/**
 * Fase 3 — Motor de consulta de equipos.
 *
 * `consultarEquipo` analiza UNA posición con todos los miembros del equipo y
 * produce el registro completo (propuestas con presupuesto consumido, decisión
 * final agregada, presupuesto total). Es la base tanto del MODO CONSULTA
 * (varias IAs analizan una misma posición) como del agente de equipo dentro
 * de partidas reales (`agenteEquipo.ts`).
 *
 * Reproducibilidad: el RNG de cada miembro se deriva deterministamente de
 * (semilla, índice de jugada, jugador con turno, alias del miembro). La misma
 * situación produce las mismas propuestas (salvo los tiempos medidos).
 */

import type { Juego, Jugador } from '../motor/tipos';
import { crearRng, hashTexto, mezclarSemillas } from '../motor/rng';
import { crearAgente } from '../agentes/registro';
import { agregarPropuestas } from './agregacion';
import type {
  DecisionEquipo,
  Equipo,
  OpcionesConsulta,
  PropuestaMiembro,
  RegistroConsulta,
} from './tipos';

/** Semilla reproducible para el miembro en esta jugada. */
function semillaMiembro(
  opciones: OpcionesConsulta,
  jugador: Jugador,
  alias: string,
): number {
  return mezclarSemillas(
    opciones.semilla >>> 0,
    opciones.indiceJugada,
    jugador,
    hashTexto(alias),
  );
}

function versionCerebroDe(agenteId: string): string {
  const prefijo = 'neural:';
  if (agenteId.startsWith(prefijo)) {
    const resto = agenteId.slice(prefijo.length);
    const arroba = resto.lastIndexOf('@');
    return arroba === -1 ? '—' : resto.slice(arroba + 1);
  }
  return '—';
}

/**
 * Ejecuta la consulta del equipo sobre una posición y devuelve el registro
 * completo con la decisión final.
 *
 * - Protocolo «consulta»: todos los miembros proponen; `agregarPropuestas`
 *   resuelve los desacuerdos según la política del equipo.
 * - Protocolo «turno-alternado»: SOLO decide el miembro cuyo turno toca
 *   (índice de jugada del bando módulo el número de miembros); su propuesta
 *   es la decisión (no hay desacuerdo por construcción) y el registro deja
 *   constancia de quién decidió.
 */
export function consultarEquipo<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
  equipo: Equipo,
  opciones: OpcionesConsulta,
): RegistroConsulta {
  if (equipo.juegoId !== juego.id) {
    throw new Error(
      `el equipo «${equipo.nombre}» es de «${equipo.juegoId}», no de «${juego.id}»`,
    );
  }
  if (juego.esTerminal(estado)) {
    throw new Error('no se consulta sobre un estado terminal');
  }
  const jugador = juego.jugadorActual(estado);

  const proposals: PropuestaMiembro[] = [];
  let miembrosQueDecidieron: number;
  if (equipo.protocolo === 'turno-alternado') {
    const indice =
      opciones.indiceJugadaDelBando % equipo.miembros.length;
    const miembro = equipo.miembros[indice] as (typeof equipo.miembros)[number];
    proposals.push(proponer(juego, estado, miembro, jugador, opciones));
    miembrosQueDecidieron = 1;
  } else {
    for (const miembro of equipo.miembros) {
      proposals.push(proponer(juego, estado, miembro, jugador, opciones));
    }
    miembrosQueDecidieron = equipo.miembros.length;
  }

  const decision: DecisionEquipo =
    equipo.protocolo === 'turno-alternado'
      ? decisionUnica(proposals[0] as PropuestaMiembro, equipo)
      : agregarPropuestas(proposals, equipo.miembros, equipo.politica, 'consulta');

  return {
    juegoId: juego.id,
    estadoCodificado: juego.codificar(estado),
    equipo: equipo.nombre,
    protocolo: equipo.protocolo,
    politica: equipo.politica,
    propuestas: proposals,
    decision,
    presupuestoTotal: {
      nodos: proposals.reduce((t, p) => t + (p.estadisticas.nodos ?? 0), 0),
      simulaciones: proposals.reduce((t, p) => t + (p.estadisticas.simulaciones ?? 0), 0),
      tiempoMs: proposals.reduce((t, p) => t + p.estadisticas.tiempoMs, 0),
      miembrosQueDecidieron,
    },
    fechaISO: new Date().toISOString(),
  };
}

function proponer<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
  miembro: Equipo['miembros'][number],
  jugador: Jugador,
  opciones: OpcionesConsulta,
): PropuestaMiembro {
  const agente = crearAgente(miembro.agente.id, miembro.agente.config);
  const decision = agente.elegirMovimiento(juego, estado, {
    rng: crearRng(semillaMiembro(opciones, jugador, miembro.alias)),
    config: miembro.agente.config,
    indiceJugada: opciones.indiceJugada,
    semilla: opciones.semilla,
  });
  return {
    alias: miembro.alias,
    agenteId: miembro.agente.id,
    versionCerebro: versionCerebroDe(miembro.agente.id),
    notacion: juego.formatearMovimiento(decision.movimiento),
    estadisticas: decision.estadisticas,
  };
}

function decisionUnica(
  propuesta: PropuestaMiembro,
  equipo: Equipo,
): DecisionEquipo {
  return {
    notacion: propuesta.notacion,
    politica: equipo.politica,
    protocolo: 'turno-alternado',
    recuento: [
      { notacion: propuesta.notacion, valor: 1, votantes: [propuesta.alias] },
    ],
    elegidoPor: [propuesta.alias],
    estadisticas: propuesta.estadisticas,
  };
}

/**
 * Traduce la decisión de una consulta al movimiento correspondiente del
 * juego (busca entre los legales la notación decidida). Lanza si la notación
 * no corresponde a un movimiento legal (defensa ante datos corruptos).
 */
export function movimientoDesdeNotacion<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
  notacion: string,
): M {
  for (const movimiento of juego.movimientosLegales(estado)) {
    if (juego.formatearMovimiento(movimiento) === notacion) {
      return movimiento;
    }
  }
  throw new Error(
    `la decisión «${notacion}» no es un movimiento legal en esta posición`,
  );
}
