/**
 * Fase 3 — Agente de equipo: adapta un Equipo al contrato `Agente` del motor
 * para que los equipos jueguen partidas REALES igual que cualquier agente
 * individual (mismo motor, misma evaluación, mismo trabajador web).
 *
 * El bando del equipo llama a `elegirMovimiento` en cada una de sus jugadas:
 * el agente cuenta cuántas jugadas lleva el BANDO (índice relativo) y aplica
 * el protocolo del equipo:
 * - «consulta»: `consultarEquipo` con todos los miembros; la política de
 *   agregación resuelve los desacuerdos.
 * - «turno-alternado»: solo el miembro cuyo turno toca decide esa jugada.
 *
 * El estado de la partida lo comparte el motor (única fuente de verdad);
 * este adaptador no mantiene estado oculto más allá del contador de jugadas
 * del bando, que se DERIVA del índice de jugada global y del jugador del
 * bando (determinista y sin memoria entre partidas).
 *
 * Trazabilidad: opcionalmente notifica cada consulta completa mediante
 * `alConsultar` (la capa de aplicación la persiste).
 */

import type { Agente, ContextoAgente, Decision, Juego } from '../motor/tipos';
import { ErrorArena } from '../motor/errores';
import { consultarEquipo, movimientoDesdeNotacion } from './consulta';
import type { Equipo, RegistroConsulta } from './tipos';

export interface OpcionesAgenteEquipo {
  /** Notificación con el registro completo de cada consulta (opcional). */
  readonly alConsultar?: (registro: RegistroConsulta) => void;
}

/**
 * Índice relativo de la jugada DENTRO del bando del equipo, derivado del
 * estado (cuenta de fichas propias) — sin memoria entre llamadas.
 */
function jugadasDelBando<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
  jugador: number,
): number {
  const vista = juego.vista(estado);
  // vista.celdas: array plano; 0 vacía, 1 jugador 1, 2 jugador 2.
  let propias = 0;
  for (const celda of vista.celdas) {
    if (celda === jugador) propias++;
  }
  // Las jugadas ya DECIDIDAS por este bando = fichas propias colocadas.
  return propias;
}

export function crearAgenteEquipo(
  equipo: Equipo,
  opciones: OpcionesAgenteEquipo = {},
): Agente {
  return {
    elegirMovimiento<S extends object, M extends object>(
      juego: Juego<S, M>,
      estado: S,
      contexto: ContextoAgente,
    ): Decision<M> {
      if (equipo.juegoId !== juego.id) {
        throw new ErrorArena(
          `el equipo «${equipo.nombre}» es de «${equipo.juegoId}», no de «${juego.id}»`,
        );
      }
      const jugador = juego.jugadorActual(estado);
      const indiceBando = jugadasDelBando(juego, estado, jugador);
      const registro = consultarEquipo(juego, estado, equipo, {
        semilla: contexto.semilla,
        indiceJugada: contexto.indiceJugada,
        indiceJugadaDelBando: indiceBando,
      });
      opciones.alConsultar?.(registro);
      const movimiento = movimientoDesdeNotacion(
        juego,
        estado,
        registro.decision.notacion,
      );
      return {
        movimiento,
        estadisticas: registro.decision.estadisticas,
      };
    },
  };
}
