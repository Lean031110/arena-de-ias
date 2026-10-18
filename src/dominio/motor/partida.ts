/**
 * Ejecutor de partidas y cronista de registros.
 *
 * Toda partida:
 * 1. Se ejecuta con semilla raíz registrada; cada jugada usa un RNG con
 *    semilla derivada (mezcla determinista documentada).
 * 2. Cada jugada del agente se VALIDA contra las reglas antes de aplicarse.
 * 3. Al terminar, la secuencia se REVALIDA por replay y el registro marca
 *    `validez: 'verificada'` o `'invalida'` con sus errores.
 * 4. El registro incluye huella de integridad del núcleo determinista.
 */

import type {
  ContextoAgente,
  Decision,
  EstadisticasBusqueda,
  Juego,
  JuegoConcreto,
  Jugador,
  ResultadoTerminal,
} from './tipos';
import { ahoraMs } from './tipos';
import { ErrorConfiguracionInvalida } from './errores';
import { crearRng, hashTexto, mezclarSemillas } from './rng';
import { huellaJSON } from './huella';
import { detectarEntorno, ahoraISO, generarId } from './eventos';
import type { EntornoEjecucion } from './eventos';
import { validarSecuencia } from './validacion';
import { obtenerJuego } from '../juegos/registro';
import { crearAgente, obtenerDefinicionAgente, validarConfigAgente } from '../agentes/registro';

export interface ConfigAgentePartida {
  readonly id: string;
  readonly config: Readonly<Record<string, number | boolean>>;
}

export interface ConfigPartida {
  readonly juegoId: string;
  readonly semilla: number;
  readonly agentes: readonly [ConfigAgentePartida, ConfigAgentePartida];
}

export interface MovimientoRegistrado {
  readonly indice: number;
  readonly jugador: Jugador;
  readonly notacion: string;
  readonly estadisticas: EstadisticasBusqueda;
}

export interface ResumenAgentePartida {
  readonly jugadas: number;
  readonly nodosTotales?: number;
  readonly simulacionesTotales?: number;
  readonly profundidadMaxima?: number;
  readonly tiempoTotalMs: number;
  readonly presupuestoAgotado: boolean;
}

/** Acumulador mutable interno del cronista. */
interface AcumuladorResumen {
  jugadas: number;
  nodosTotales?: number;
  simulacionesTotales?: number;
  profundidadMaxima?: number;
  tiempoTotalMs: number;
  presupuestoAgotado: boolean;
}

export interface InfoAgenteRegistrado {
  readonly id: string;
  readonly nombre: string;
  readonly version: string;
  readonly config: Readonly<Record<string, number | boolean>>;
}

export interface RegistroPartida {
  readonly id: string;
  readonly fecha: string;
  readonly entorno: EntornoEjecucion;
  readonly juego: { readonly id: string; readonly reglasVersion: string };
  readonly semilla: number;
  readonly agentes: readonly [InfoAgenteRegistrado, InfoAgenteRegistrado];
  readonly movimientos: readonly MovimientoRegistrado[];
  readonly resultado: ResultadoTerminal | null;
  readonly validez: 'verificada' | 'invalida';
  readonly errores: readonly string[];
  readonly duracionMs: number;
  readonly resumenAgentes: readonly [ResumenAgentePartida, ResumenAgentePartida];
  readonly huella: string;
}

/** Semilla determinista de una jugada (derivación documentada y probada). */
export function semillaParaJugada(
  semilla: number,
  indiceJugada: number,
  jugador: Jugador,
  agenteId: string,
): number {
  return mezclarSemillas(semilla, indiceJugada, jugador, hashTexto(agenteId));
}

export function validarConfigPartida(config: unknown): asserts config is ConfigPartida {
  if (typeof config !== 'object' || config === null) {
    throw new ErrorConfiguracionInvalida('la configuración de partida debe ser un objeto');
  }
  const objeto = config as Record<string, unknown>;
  const juegoId = objeto['juegoId'];
  if (typeof juegoId !== 'string' || juegoId.length === 0) {
    throw new ErrorConfiguracionInvalida('juegoId debe ser un texto no vacío');
  }
  const semilla = objeto['semilla'];
  if (typeof semilla !== 'number' || !Number.isInteger(semilla) || semilla < 0 || semilla > Number.MAX_SAFE_INTEGER) {
    throw new ErrorConfiguracionInvalida('semilla debe ser un entero en [0, 2^53−1]');
  }
  const agentes = objeto['agentes'];
  if (!Array.isArray(agentes) || agentes.length !== 2) {
    throw new ErrorConfiguracionInvalida('la partida exige exactamente 2 agentes');
  }
  for (const [posicion, agente] of agentes.entries()) {
    if (typeof agente !== 'object' || agente === null) {
      throw new ErrorConfiguracionInvalida(`agente ${posicion + 1} inválido`);
    }
    const a = agente as Record<string, unknown>;
    if (typeof a['id'] !== 'string') {
      throw new ErrorConfiguracionInvalida(`agente ${posicion + 1} sin id`);
    }
    if (typeof a['config'] !== 'object' || a['config'] === null || Array.isArray(a['config'])) {
      throw new ErrorConfiguracionInvalida(`agente ${posicion + 1} con config inválida`);
    }
    for (const [clave, valor] of Object.entries(a['config'] as Record<string, unknown>)) {
      if (typeof valor !== 'number' && typeof valor !== 'boolean') {
        throw new ErrorConfiguracionInvalida(
          `agente ${posicion + 1}: parámetro «${clave}» debe ser número o booleano`,
        );
      }
    }
  }
}

/**
 * Cronista: acumula jugadas y construye el registro final con validación
 * de replay. Lo usan tanto el ejecutor automático como la partida interactiva
 * de la interfaz (una sola fuente de verdad del formato).
 */
export class CronistaPartida {
  private readonly movimientos: MovimientoRegistrado[] = [];
  private readonly inicio = ahoraMs();
  private readonly resumenes: [AcumuladorResumen, AcumuladorResumen] = [
    {
      jugadas: 0,
      tiempoTotalMs: 0,
      presupuestoAgotado: false,
    },
    {
      jugadas: 0,
      tiempoTotalMs: 0,
      presupuestoAgotado: false,
    },
  ];

  constructor(
    private readonly juego: JuegoConcreto,
    private readonly config: ConfigPartida,
  ) {}

  /** Número de jugadas registradas hasta ahora. */
  numeroJugadas(): number {
    return this.movimientos.length;
  }

  registrar(jugador: Jugador, notacion: string, estadisticas: EstadisticasBusqueda): void {
    const indice = this.movimientos.length;
    this.movimientos.push({ indice, jugador, notacion, estadisticas });
    const posicion = jugador - 1;
    const resumen = this.resumenes[posicion];
    if (resumen === undefined) return;
    resumen.jugadas += 1;
    resumen.tiempoTotalMs += estadisticas.tiempoMs;
    if (estadisticas.nodos !== undefined) {
      resumen.nodosTotales = (resumen.nodosTotales ?? 0) + estadisticas.nodos;
    }
    if (estadisticas.simulaciones !== undefined) {
      resumen.simulacionesTotales =
        (resumen.simulacionesTotales ?? 0) + estadisticas.simulaciones;
    }
    if (estadisticas.profundidad !== undefined) {
      resumen.profundidadMaxima = Math.max(
        resumen.profundidadMaxima ?? 0,
        estadisticas.profundidad,
      );
    }
    if (estadisticas.presupuestoAgotado === true) {
      resumen.presupuestoAgotado = true;
    }
  }

  /** Construye el registro final aplicando la validación de replay. */
  finalizar(resultado: ResultadoTerminal | null, erroresAdicionales: readonly string[]): RegistroPartida {
    const errores = [...erroresAdicionales];
    const replay = validarSecuencia(this.juego, this.movimientos.map((m) => m.notacion));
    if (!replay.valido) {
      errores.push(...replay.motivos.map((motivo) => `replay: ${motivo}`));
    }
    if (resultado !== null && replay.resultado !== null) {
      const coincide =
        resultado.tipo === replay.resultado.tipo &&
        resultado.ganador === replay.resultado.ganador;
      if (!coincide) {
        errores.push('replay: el resultado calculado no coincide con el registrado');
      }
    }
    const validez: 'verificada' | 'invalida' = errores.length === 0 ? 'verificada' : 'invalida';

    const infoAgentes = this.config.agentes.map((agente) => {
      const definicion = obtenerDefinicionAgente(agente.id);
      return {
        id: agente.id,
        nombre: definicion.nombre,
        version: definicion.version,
        config: agente.config,
      };
    }) as [InfoAgenteRegistrado, InfoAgenteRegistrado];

    const nucleo = {
      semilla: this.config.semilla,
      juegoId: this.juego.id,
      reglasVersion: this.juego.reglasVersion,
      agentes: infoAgentes.map((info) => ({
        id: info.id,
        version: info.version,
        config: info.config,
      })),
      movimientos: this.movimientos.map((m) => m.notacion),
      resultado,
      validez,
    };

    return {
      id: generarId(),
      fecha: ahoraISO(),
      entorno: detectarEntorno(),
      juego: { id: this.juego.id, reglasVersion: this.juego.reglasVersion },
      semilla: this.config.semilla,
      agentes: infoAgentes,
      movimientos: this.movimientos,
      resultado: validez === 'invalida' ? null : resultado,
      validez,
      errores,
      duracionMs: ahoraMs() - this.inicio,
      resumenAgentes: this.resumenes,
      huella: huellaJSON(nucleo),
    };
  }
}

export interface ParametrosDecision<S extends object, M extends object> {
  readonly juego: Juego<S, M>;
  readonly estado: S;
  readonly jugador: Jugador;
  readonly infoAgente: ConfigAgentePartida;
  readonly contexto: ContextoAgente;
}

/** Función que decide una jugada (agente automático o interfaz humana). */
export type Decisor = <S extends object, M extends object>(
  parametros: ParametrosDecision<S, M>,
) => Decision<M> | Promise<Decision<M>>;

/** Decisor por defecto: instancia el agente automático del catálogo. */
export const decisorAutomatico: Decisor = <S extends object, M extends object>(
  parametros: ParametrosDecision<S, M>,
): Decision<M> => {
  const agente = crearAgente(parametros.infoAgente.id, parametros.infoAgente.config);
  return agente.elegirMovimiento(parametros.juego, parametros.estado, parametros.contexto);
};

/**
 * Ejecuta una partida completa entre dos agentes automáticos (o mediante un
 * decisor personalizado, p. ej. la interfaz con jugador humano).
 */
export async function ejecutarPartida(
  config: ConfigPartida,
  decidir: Decisor = decisorAutomatico,
): Promise<RegistroPartida> {
  validarConfigPartida(config);
  // Validación temprana de los agentes: un error de configuración debe
  // fallar la llamada, no invalidar la partida a mitad de juego.
  for (const agente of config.agentes) {
    const erroresAgente = validarConfigAgente(agente.id, agente.config);
    if (erroresAgente.length > 0) {
      throw new ErrorConfiguracionInvalida(
        `agente «${agente.id}»: ${erroresAgente.join('; ')}`,
      );
    }
  }
  const juego = obtenerJuego(config.juegoId);
  let estado = juego.crearEstadoInicial();
  const cronista = new CronistaPartida(juego, config);
  const errores: string[] = [];

  while (!juego.esTerminal(estado)) {
    const jugador = juego.jugadorActual(estado);
    const indiceJugada = cronista.numeroJugadas();
    const infoAgente = config.agentes[jugador - 1];
    if (infoAgente === undefined) {
      errores.push(`no hay agente configurado para el jugador ${jugador}`);
      break;
    }
    const contexto: ContextoAgente = {
      rng: crearRng(semillaParaJugada(config.semilla, indiceJugada, jugador, infoAgente.id)),
      config: infoAgente.config,
      indiceJugada,
      semilla: config.semilla,
    };
    let decision: Decision<unknown>;
    try {
      decision = await decidir({ juego, estado, jugador, infoAgente, contexto });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      errores.push(`jugada ${indiceJugada}: el agente «${infoAgente.id}» falló (${mensaje})`);
      break;
    }
    const comprobacion = juego.validarMovimiento(estado, decision.movimiento);
    if (!comprobacion.valido) {
      errores.push(
        `jugada ${indiceJugada}: movimiento ilegal del agente «${infoAgente.id}» (${
          comprobacion.motivo ?? 'sin motivo'
        })`,
      );
      break;
    }
    estado = juego.aplicarMovimiento(estado, decision.movimiento);
    cronista.registrar(jugador, juego.formatearMovimiento(decision.movimiento), decision.estadisticas);
  }

  const resultado = errores.length === 0 ? juego.resultado(estado) : null;
  return cronista.finalizar(resultado, errores);
}

/** Reproduce un registro y comprueba que coincide con lo almacenado. */
export function reproducirRegistro(
  registro: RegistroPartida,
): { coincide: boolean; motivos: readonly string[] } {
  const juego = obtenerJuego(registro.juego.id);
  const replay = validarSecuencia(juego, registro.movimientos.map((m) => m.notacion));
  const motivos: string[] = [];
  if (!replay.valido) motivos.push(...replay.motivos);
  if (registro.resultado !== null) {
    if (replay.resultado === null) {
      motivos.push('el registro declara resultado pero el replay no llega a terminal');
    } else if (
      registro.resultado.tipo !== replay.resultado.tipo ||
      registro.resultado.ganador !== replay.resultado.ganador
    ) {
      motivos.push('el resultado del replay no coincide con el registrado');
    }
  }
  return { coincide: motivos.length === 0, motivos };
}
