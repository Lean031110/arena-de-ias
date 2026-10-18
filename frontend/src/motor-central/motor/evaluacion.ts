/**
 * Evaluación round-robin: cada par de agentes disputa `encuentrosPorPar`
 * partidas alternando lados (diseño pareado), con semillas derivadas y
 * registro íntegro de todas las partidas.
 *
 * Métricas (calculadas sobre registros, docs/MODELO_DATOS.md §3):
 * puntuación = (V + E/2)/n; IC de Wilson 95 %; medias de tiempo/nodos.
 * Las partidas inválidas se cuentan aparte y quedan fuera de la puntuación.
 */

import { ErrorConfiguracionInvalida } from './errores';
import { huellaJSON } from './huella';
import { ahoraISO, detectarEntorno, generarId } from './eventos';
import type { EntornoEjecucion } from './eventos';
import type { IntervaloWilson } from './estadistica';
import { intervaloWilson, media } from './estadistica';
import type { ConfigAgentePartida, RegistroPartida } from './partida';
import { ejecutarPartida } from './partida';
import type { JuegoConcreto } from './tipos';
import { obtenerJuego } from '../juegos/registro';
import { obtenerDefinicionAgente } from '../agentes/registro';
import { mezclarSemillas } from './rng';

export interface ConfigEvaluacion {
  readonly juegoId: string;
  readonly semillaBase: number;
  readonly encuentrosPorPar: number;
  readonly agentes: readonly ConfigAgentePartida[];
}

export interface ResumenAgenteEvaluacion {
  readonly agenteId: string;
  readonly nombre: string;
  readonly victorias: number;
  readonly empates: number;
  readonly derrotas: number;
  readonly partidas: number;
  readonly invalidas: number;
  readonly puntuacion: number;
  readonly ic95: IntervaloWilson;
  readonly tiempoMedioMs: number | null;
  readonly nodosMedios: number | null;
  readonly simulacionesMedias: number | null;
}

export interface RegistroEvaluacion {
  readonly id: string;
  readonly fecha: string;
  readonly entorno: EntornoEjecucion;
  readonly juego: { readonly id: string; readonly reglasVersion: string };
  readonly encuentrosPorPar: number;
  readonly semillaBase: number;
  readonly agentes: readonly ConfigAgentePartida[];
  /** Para cada partida, índices en `agentes` de quien jugó como P1 y P2. */
  readonly asignaciones: readonly (readonly [number, number])[];
  readonly partidas: readonly RegistroPartida[];
  readonly resumenPorAgente: readonly ResumenAgenteEvaluacion[];
  readonly invalidas: number;
  readonly errores: readonly string[];
  readonly huella: string;
}

export interface OpcionesEvaluacion {
  /** Progreso real: partidas completadas / total. */
  readonly onProgreso?: (completadas: number, total: number) => void;
  /** Consulta de cancelación (se aplica entre partidas). */
  readonly debeCancelar?: () => boolean;
}

export interface ResultadoCancelado {
  readonly cancelada: true;
  readonly partidas: readonly RegistroPartida[];
  readonly completadas: number;
  readonly total: number;
}

export function validarConfigEvaluacion(config: unknown): asserts config is ConfigEvaluacion {
  if (typeof config !== 'object' || config === null) {
    throw new ErrorConfiguracionInvalida('la configuración de evaluación debe ser un objeto');
  }
  const objeto = config as Record<string, unknown>;
  const juegoId = objeto['juegoId'];
  if (typeof juegoId !== 'string' || juegoId.length === 0) {
    throw new ErrorConfiguracionInvalida('juegoId debe ser un texto no vacío');
  }
  const semillaBase = objeto['semillaBase'];
  if (
    typeof semillaBase !== 'number' ||
    !Number.isInteger(semillaBase) ||
    semillaBase < 0 ||
    semillaBase > Number.MAX_SAFE_INTEGER
  ) {
    throw new ErrorConfiguracionInvalida('semillaBase debe ser un entero en [0, 2^53−1]');
  }
  const encuentrosPorPar = objeto['encuentrosPorPar'];
  if (
    typeof encuentrosPorPar !== 'number' ||
    !Number.isInteger(encuentrosPorPar) ||
    encuentrosPorPar < 1 ||
    encuentrosPorPar > 10000
  ) {
    throw new ErrorConfiguracionInvalida('encuentrosPorPar debe ser un entero en [1, 10000]');
  }
  const agentes = objeto['agentes'];
  if (!Array.isArray(agentes) || agentes.length < 2 || agentes.length > 8) {
    throw new ErrorConfiguracionInvalida('la evaluación exige entre 2 y 8 agentes');
  }
  for (const [posicion, agente] of agentes.entries()) {
    if (typeof agente !== 'object' || agente === null) {
      throw new ErrorConfiguracionInvalida(`agente ${posicion + 1} inválido`);
    }
    const a = agente as Record<string, unknown>;
    if (typeof a['id'] !== 'string') {
      throw new ErrorConfiguracionInvalida(`agente ${posicion + 1} sin id`);
    }
  }
}

const cederAlBucleDeEventos = (): Promise<void> =>
  new Promise((resolver) => {
    setTimeout(resolver, 0);
  });

export async function ejecutarEvaluacion(
  config: ConfigEvaluacion,
  opciones: OpcionesEvaluacion = {},
): Promise<RegistroEvaluacion | ResultadoCancelado> {
  validarConfigEvaluacion(config);
  const juego: JuegoConcreto = obtenerJuego(config.juegoId);
  const numeroAgentes = config.agentes.length;
  const pares: Array<[number, number]> = [];
  for (let i = 0; i < numeroAgentes; i++) {
    for (let j = i + 1; j < numeroAgentes; j++) {
      pares.push([i, j]);
    }
  }
  const total = pares.length * config.encuentrosPorPar;
  let completadas = 0;

  const partidas: RegistroPartida[] = [];
  const asignaciones: Array<[number, number]> = [];

  for (const [i, j] of pares) {
    for (let encuentro = 0; encuentro < config.encuentrosPorPar; encuentro++) {
      if (opciones.debeCancelar?.() === true) {
        return {
          cancelada: true,
          partidas,
          completadas,
          total,
        };
      }
      const semilla = mezclarSemillas(config.semillaBase, i, j, encuentro);
      // Alternancia de lados (diseño pareado).
      const [indiceP1, indiceP2] =
        encuentro % 2 === 0 ? ([i, j] as [number, number]) : ([j, i] as [number, number]);
      const agenteP1 = config.agentes[indiceP1];
      const agenteP2 = config.agentes[indiceP2];
      if (agenteP1 === undefined || agenteP2 === undefined) {
        throw new ErrorConfiguracionInvalida('configuración de agentes inconsistente');
      }
      const registro = await ejecutarPartida({
        juegoId: config.juegoId,
        semilla,
        agentes: [agenteP1, agenteP2],
      });
      partidas.push(registro);
      asignaciones.push([indiceP1, indiceP2]);
      completadas++;
      opciones.onProgreso?.(completadas, total);
      // Cede el control para progreso/cancelación (worker o hilo principal).
      await cederAlBucleDeEventos();
    }
  }

  // Resumen por agente (cálculo reproducible sobre los registros).
  const resumen = config.agentes.map((agente, indice) => {
    let v = 0;
    let e = 0;
    let d = 0;
    let invalidasAgente = 0;
    const tiempos: number[] = [];
    for (const [numeroPartida, partida] of partidas.entries()) {
      const asignacion = asignaciones[numeroPartida];
      if (asignacion === undefined) continue;
      const [posP1, posP2] = asignacion;
      let posicion: number | null = null;
      if (posP1 === indice) posicion = 0;
      else if (posP2 === indice) posicion = 1;
      if (posicion === null) continue;
      if (partida.validez === 'invalida' || partida.resultado === null) {
        invalidasAgente++;
        continue;
      }
      if (partida.resultado.tipo === 'empate') {
        e++;
      } else if (partida.resultado.ganador === posicion + 1) {
        v++;
      } else {
        d++;
      }
      tiempos.push(partida.duracionMs);
    }
    const partidasValidas = v + e + d;
    const definicion = obtenerDefinicionAgente(agente.id);
    // Medias por jugada (más informativas que los totales por partida).
    const simulacionesPorJugada: number[] = [];
    const nodosPorJugada: number[] = [];
    for (const [numeroPartida, partida] of partidas.entries()) {
      const asignacion = asignaciones[numeroPartida];
      if (asignacion === undefined) continue;
      const [posP1, posP2] = asignacion;
      let posicion: number | null = null;
      if (posP1 === indice) posicion = 0;
      else if (posP2 === indice) posicion = 1;
      if (posicion === null) continue;
      const resumenAgente = partida.resumenAgentes[posicion];
      if (resumenAgente === undefined) continue;
      if (resumenAgente.jugadas > 0) {
        if (resumenAgente.nodosTotales !== undefined) {
          nodosPorJugada.push(resumenAgente.nodosTotales / resumenAgente.jugadas);
        }
        if (resumenAgente.simulacionesTotales !== undefined) {
          simulacionesPorJugada.push(resumenAgente.simulacionesTotales / resumenAgente.jugadas);
        }
      }
    }
    return {
      agenteId: agente.id,
      nombre: definicion.nombre,
      victorias: v,
      empates: e,
      derrotas: d,
      partidas: partidasValidas,
      invalidas: invalidasAgente,
      puntuacion:
        partidasValidas === 0 ? 0 : Number(((v + e / 2) / partidasValidas).toFixed(6)),
      ic95: intervaloWilson(v, e, partidasValidas),
      tiempoMedioMs: media(tiempos) === null ? null : Number(media(tiempos)!.toFixed(3)),
      nodosMedios: media(nodosPorJugada) === null ? null : Math.round(media(nodosPorJugada)!),
      simulacionesMedias:
        media(simulacionesPorJugada) === null ? null : Math.round(media(simulacionesPorJugada)!),
    } satisfies ResumenAgenteEvaluacion;
  });

  const invalidas = partidas.filter((p) => p.validez === 'invalida').length;
  const errores = partidas.flatMap((p) =>
    p.validez === 'invalida' ? p.errores.map((error) => `partida ${p.id}: ${error}`) : [],
  );

  const nucleo = {
    juegoId: juego.id,
    reglasVersion: juego.reglasVersion,
    semillaBase: config.semillaBase,
    encuentrosPorPar: config.encuentrosPorPar,
    agentes: config.agentes,
    // Los ids de partida son UUID aleatorios: se excluyen de la huella para
    // que la misma ejecución determinista produzca la misma huella.
    partidas: partidas.map((p) => ({
      huella: p.huella,
      resultado: p.resultado,
      validez: p.validez,
    })),
    resumenPorAgente: resumen.map((r) => ({
      agenteId: r.agenteId,
      victorias: r.victorias,
      empates: r.empates,
      derrotas: r.derrotas,
    })),
  };

  return {
    id: generarId(),
    fecha: ahoraISO(),
    entorno: detectarEntorno(),
    juego: { id: juego.id, reglasVersion: juego.reglasVersion },
    encuentrosPorPar: config.encuentrosPorPar,
    semillaBase: config.semillaBase,
    agentes: config.agentes,
    asignaciones,
    partidas,
    resumenPorAgente: resumen,
    invalidas,
    errores,
    huella: huellaJSON(nucleo),
  };
}
