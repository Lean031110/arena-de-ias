/**
 * Nivel 5 — Agente neuronal (política + valor) con MCTS-PUCT guiado.
 *
 * Implementación REAL de Fase 2 sobre el contrato que Fase 1 dejó pendiente
 * (ADR-008/ADR-014): los pesos provienen de un paquete .lba validado, la
 * inferencia la ejecuta el runtime «ts-puro» (neural/red.ts) y la búsqueda
 * es PUCT (estilo AlphaZero: prior de política + valor de red, sin rollouts).
 *
 * El agente es síncrono (la inferencia es pura y rápida) y sin estado entre
 * jugadas: seguro en Web Workers.
 */

import { ErrorArena, ErrorConfiguracionInvalida } from '../motor/errores';
import type { Agente, ContextoAgente, Decision, EstadisticasBusqueda, Juego, Jugador } from '../motor/tipos';
import { ahoraMs } from '../motor/tipos';
import { adelante, cargarPesos, softmaxEnmascarado } from '../neural/red';
import { observarTablero } from '../neural/observacion';
import type { ArquitecturaLBA } from '../lba/esquema';
import type { TensorLeido } from '../lba/safetensors';

/** Identificador reservado del agente neuronal en el catálogo. */
export const ID_AGENTE_NEURAL = 'neural';

export interface ConfigAgenteNeural {
  /** Simulaciones PUCT por jugada (presupuesto exacto). */
  readonly simulaciones?: number;
  /** Constante PUCT (peso del prior frente al valor). */
  readonly cPuct?: number;
  /**
   * Temperatura de jugada: 0 = determinista (máx. visitas), >0 muestrea
   * proporcional a visitas^(1/T). El entrenamiento usa T>0; la competición, T=0.
   */
  readonly temperatura?: number;
}

export interface CerebroCargado {
  readonly agentId: string;
  readonly brainVersion: string;
  readonly gameId: string;
  readonly architecture: ArquitecturaLBA;
  readonly pesos: ReadonlyMap<string, TensorLeido>;
}

interface NodoPUCT<S, M> {
  readonly estado: S;
  readonly movimientoGenerador: M | null;
  readonly jugadorQueMovio: Jugador | null;
  readonly padre: NodoPUCT<S, M> | null;
  visitas: number;
  /** Suma de valores desde la perspectiva del jugador CON TURNO en este nodo. */
  valorSuma: number;
  readonly prior: number;
  readonly hijos: NodoPUCT<S, M>[];
  pendientes: readonly M[];
  prioresPendientes: readonly number[];
}

/** Carga un cerebro desde tensores ya leídos del paquete .lba. */
export function cargarCerebro(
  agentId: string,
  brainVersion: string,
  gameId: string,
  architecture: ArquitecturaLBA,
  tensores: ReadonlyMap<string, TensorLeido>,
): CerebroCargado {
  cargarPesos(tensores); // valida la presencia de los 14 tensores canónicos.
  return { agentId, brainVersion, gameId, architecture, pesos: tensores };
}

export function validarConfigNeural(config: Readonly<Record<string, number | boolean>>): string[] {
  const errores: string[] = [];
  const clavesValidas = new Set(['simulaciones', 'cPuct', 'temperatura']);
  for (const clave of Object.keys(config)) {
    if (!clavesValidas.has(clave)) errores.push(`parámetro desconocido «${clave}» para el agente neural`);
  }
  const simulaciones = config['simulaciones'];
  if (
    simulaciones !== undefined &&
    (!Number.isFinite(simulaciones) || (simulaciones as number) < 1 || (simulaciones as number) > 100000)
  ) {
    errores.push('«simulaciones» debe estar en [1, 100000]');
  }
  const cPuct = config['cPuct'];
  if (cPuct !== undefined && (!Number.isFinite(cPuct) || (cPuct as number) <= 0 || (cPuct as number) > 100)) {
    errores.push('«cPuct» debe estar en (0, 100]');
  }
  const temperatura = config['temperatura'];
  if (
    temperatura !== undefined &&
    (!Number.isFinite(temperatura) || (temperatura as number) < 0 || (temperatura as number) > 10)
  ) {
    errores.push('«temperatura» debe estar en [0, 10]');
  }
  return errores;
}

/** Crea el agente neuronal a partir de un cerebro ya cargado. */
export function crearAgenteNeural(cerebro: CerebroCargado, config: ConfigAgenteNeural = {}): Agente {
  const pesos = cargarPesos(cerebro.pesos);
  const arq = cerebro.architecture;
  const simulacionesTotales = Math.max(1, Math.floor(config.simulaciones ?? 200));
  const cPuct = config.cPuct ?? 1.5;
  const temperatura = config.temperatura ?? 0;

  return {
    elegirMovimiento<S extends object, M extends object>(
      juego: Juego<S, M>,
      estado: S,
      contexto: ContextoAgente,
    ): Decision<M> {
      if (juego.esTerminal(estado)) {
        throw new ErrorArena('el agente neuronal recibió un estado terminal');
      }
      const inicio = ahoraMs();

      // Compatibilidad dura: el cerebro declara el juego (docs/LBA-MODELO.md §8).
      if (juego.id !== cerebro.gameId) {
        throw new ErrorConfiguracionInvalida(
          `cerebro «${cerebro.agentId}@${cerebro.brainVersion}» entrenado para «${cerebro.gameId}» y usado en «${juego.id}»: combinación incompatible`,
        );
      }
      const { alto, ancho } = arq.entrada;

      const legalesRaiz = juego.movimientosLegales(estado);
      const observacionRaiz = observarTablero(
        estado as unknown as { celdas: readonly number[]; turno: Jugador },
        alto,
        ancho,
      );
      const salidaRaiz = adelante(pesos, arq, observacionRaiz);
      const indicesRaiz = legalesRaiz.map((m) => {
        const mov = m as unknown as { fila: number; columna: number };
        return mov.fila * ancho + mov.columna;
      });
      const priorRaiz = softmaxEnmascarado(salidaRaiz.politica, indicesRaiz);

      const raiz: NodoPUCT<S, M> = {
        estado,
        movimientoGenerador: null,
        jugadorQueMovio: null,
        padre: null,
        visitas: 0,
        valorSuma: 0,
        prior: 1,
        hijos: [],
        pendientes: legalesRaiz,
        prioresPendientes: legalesRaiz.map((m, i) => priorRaiz[indicesRaiz[i]!]!),
      };

      let nodos = 1;
      let profundidadMaxima = 0;

      /** Valor terminal exacto desde el jugador con turno; null si no terminal. */
      const valorTerminalONull = (nodo: NodoPUCT<S, M>): number | null => {
        const resultado = juego.resultado(nodo.estado);
        if (resultado === null) return null;
        if (resultado.tipo === 'empate') return 0;
        const conTurno = juego.jugadorActual(nodo.estado);
        return resultado.ganador === conTurno ? 1 : -1;
      };

      /** Inferencia de red: valor + priores por movimiento legal. */
      const inferir = (nodo: NodoPUCT<S, M>): { valor: number; priores: Map<M, number> } => {
        const obs = observarTablero(
          nodo.estado as unknown as { celdas: readonly number[]; turno: Jugador },
          alto,
          ancho,
        );
        const salida = adelante(pesos, arq, obs);
        const legales = juego.movimientosLegales(nodo.estado);
        const indices = legales.map((m) => {
          const mov = m as unknown as { fila: number; columna: number };
          return mov.fila * ancho + mov.columna;
        });
        const prob = softmaxEnmascarado(salida.politica, indices);
        const priores = new Map<M, number>();
        legales.forEach((m, i) => priores.set(m, prob[indices[i]!]!));
        return { valor: salida.valor, priores };
      };

      for (let simulacion = 0; simulacion < simulacionesTotales; simulacion++) {
        // 1) Selección PUCT hasta nodo con pendientes o terminal.
        let nodo: NodoPUCT<S, M> = raiz;
        let profundidad = 0;
        while (nodo.pendientes.length === 0 && nodo.hijos.length > 0) {
          let mejorHijo: NodoPUCT<S, M> | null = null;
          let mejorPuntuacion = Number.NEGATIVE_INFINITY;
          const visitasPadre = Math.max(1, nodo.visitas);
          for (const hijo of nodo.hijos) {
            // Q del hijo desde la perspectiva del jugador que elige en `nodo`.
            const q = hijo.visitas === 0 ? 0 : -hijo.valorSuma / hijo.visitas;
            const u = cPuct * hijo.prior * (Math.sqrt(visitasPadre) / (1 + hijo.visitas));
            const puntuacion = q + u;
            if (puntuacion > mejorPuntuacion) {
              mejorPuntuacion = puntuacion;
              mejorHijo = hijo;
            }
          }
          if (mejorHijo === null) break;
          nodo = mejorHijo;
          profundidad++;
        }
        profundidadMaxima = Math.max(profundidadMaxima, profundidad);

        // 2) Expansión o terminal: identificar nodo final de la simulación y su
        //    valor DESDE LA PERSPECTIVA DEL JUGADOR CON TURNO EN ESE NODO.
        let final: NodoPUCT<S, M>;
        let valorFinal: number;
        if (juego.esTerminal(nodo.estado)) {
          final = nodo;
          valorFinal = valorTerminalONull(nodo) ?? 0;
        } else if (nodo.pendientes.length > 0) {
          const movimiento = nodo.pendientes[0]!;
          const priorMovimiento = nodo.prioresPendientes[0]!;
          const estadoHijo = juego.aplicarMovimiento(nodo.estado, movimiento);
          const hijo: NodoPUCT<S, M> = {
            estado: estadoHijo,
            movimientoGenerador: movimiento,
            jugadorQueMovio: juego.jugadorActual(nodo.estado),
            padre: nodo,
            visitas: 0,
            valorSuma: 0,
            prior: priorMovimiento,
            hijos: [],
            pendientes: [],
            prioresPendientes: [],
          };
          if (!juego.esTerminal(estadoHijo)) {
            const { valor, priores } = inferir(hijo);
            hijo.pendientes = juego.movimientosLegales(estadoHijo);
            hijo.prioresPendientes = hijo.pendientes.map((m) => priores.get(m) ?? 0);
            valorFinal = valor;
          } else {
            valorFinal = valorTerminalONull(hijo) ?? 0;
          }
          nodo.hijos.push(hijo);
          nodo.pendientes = nodo.pendientes.slice(1);
          nodo.prioresPendientes = nodo.prioresPendientes.slice(1);
          nodos++;
          final = hijo;
        } else {
          // Salvaguarda (no ocurre en los juegos actuales): valor de red.
          final = nodo;
          valorFinal = inferir(nodo).valor;
        }

        // 3) Retropropagación negamax: el signo alterna en cada nivel.
        let acumulado = valorFinal;
        let actual: NodoPUCT<S, M> | null = final;
        while (actual !== null) {
          actual.visitas++;
          actual.valorSuma += acumulado;
          acumulado = -acumulado;
          actual = actual.padre;
        }
      }

      // 4) Elección final por visitas (temperatura 0 = argmax, desempate RNG).
      let elegido: NodoPUCT<S, M> | null = null;
      if (temperatura <= 0) {
        let maximo = -1;
        const empatadas: NodoPUCT<S, M>[] = [];
        for (const hijo of raiz.hijos) {
          if (hijo.visitas > maximo) {
            maximo = hijo.visitas;
            empatadas.length = 0;
            empatadas.push(hijo);
          } else if (hijo.visitas === maximo) {
            empatadas.push(hijo);
          }
        }
        elegido = empatadas.length > 0 ? contexto.rng.elegirEntre(empatadas) : null;
      } else {
        const pesosVisitas = raiz.hijos.map((hijo) => Math.pow(hijo.visitas, 1 / temperatura));
        const total = pesosVisitas.reduce((a, b) => a + b, 0);
        if (total > 0) {
          let tiro = contexto.rng.siguiente() * total;
          for (let i = 0; i < raiz.hijos.length; i++) {
            tiro -= pesosVisitas[i]!;
            if (tiro <= 0) {
              elegido = raiz.hijos[i]!;
              break;
            }
          }
        }
        elegido = elegido ?? raiz.hijos[0] ?? null;
      }

      if (elegido === null || elegido.movimientoGenerador === null) {
        throw new ErrorArena('MCTS-PUCT no pudo elegir movimiento (sin hijos)');
      }

      const estadisticas: EstadisticasBusqueda = {
        tiempoMs: ahoraMs() - inicio,
        nodos,
        simulaciones: simulacionesTotales,
        profundidad: profundidadMaxima,
      };
      return { movimiento: elegido.movimientoGenerador, estadisticas };
    },
  };
}
