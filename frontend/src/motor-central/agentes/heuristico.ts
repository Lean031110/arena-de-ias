/**
 * Nivel 2 — Agente heurístico táctico.
 * Prioridad: (1) ganar si es posible; (2) bloquear la victoria inmediata del
 * rival; (3) maximizar la evaluación posicional del juego (estimación).
 * Desempates aleatorios con el RNG del contexto (reproducible).
 */

import type { Agente, ContextoAgente, Decision, Juego, Jugador } from '../motor/tipos';
import { ahoraMs, otroJugador } from '../motor/tipos';
import { ErrorArena } from '../motor/errores';

function esVictoriaPara<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
  movimiento: M,
  jugador: Jugador,
): boolean {
  const hipotetico = juego.simularMovimiento(estado, movimiento, jugador);
  const resultado = juego.resultado(hipotetico);
  return resultado !== null && resultado.tipo === 'victoria' && resultado.ganador === jugador;
}

export function crearAgenteHeuristico(): Agente {
  return {
    elegirMovimiento<S extends object, M extends object>(
      juego: Juego<S, M>,
      estado: S,
      contexto: ContextoAgente,
    ): Decision<M> {
      const inicio = ahoraMs();
      const legales = juego.movimientosLegales(estado);
      if (legales.length === 0) {
        throw new ErrorArena('el agente heurístico no tiene jugadas legales (¿estado terminal?)');
      }
      const yo = juego.jugadorActual(estado);
      const rival = otroJugador(yo);

      // 1) Victoria inmediata propia.
      const ganadoras = legales.filter((movimiento) =>
        esVictoriaPara(juego, estado, movimiento, yo),
      );
      if (ganadoras.length > 0) {
        return {
          movimiento: contexto.rng.elegirEntre(ganadoras),
          estadisticas: { tiempoMs: ahoraMs() - inicio },
        };
      }

      // 2) Bloquear la victoria inmediata del rival (misma jugada, su pieza).
      const amenazas = legales.filter((movimiento) =>
        esVictoriaPara(juego, estado, movimiento, rival),
      );
      if (amenazas.length > 0) {
        return {
          movimiento: contexto.rng.elegirEntre(amenazas),
          estadisticas: { tiempoMs: ahoraMs() - inicio },
        };
      }

      // 3) Evaluación posicional (estimación heurística del juego).
      let mejor: M | null = null;
      let mejorValor = Number.NEGATIVE_INFINITY;
      for (const movimiento of legales) {
        const hijo = juego.aplicarMovimiento(estado, movimiento);
        const valor = juego.evaluar(hijo, yo);
        if (valor > mejorValor + 1e-12) {
          mejorValor = valor;
          mejor = movimiento;
        }
      }
      if (mejor === null) {
        throw new ErrorArena('el agente heurístico no encontró jugada evaluada');
      }
      return {
        movimiento: mejor,
        estadisticas: { tiempoMs: ahoraMs() - inicio },
      };
    },
  };
}
