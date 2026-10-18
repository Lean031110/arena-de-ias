/**
 * Nivel 1 — Agente aleatorio (referencia mínima).
 * Elige uniformemente entre los movimientos legales usando el RNG con
 * semilla del contexto (reproducible).
 */

import type { Agente, ContextoAgente, Decision, Juego } from '../motor/tipos';
import { ahoraMs } from '../motor/tipos';
import { ErrorArena } from '../motor/errores';

export const agenteAleatorio: Agente = {
  elegirMovimiento<S extends object, M extends object>(
    juego: Juego<S, M>,
    estado: S,
    contexto: ContextoAgente,
  ): Decision<M> {
    const inicio = ahoraMs();
    const legales = juego.movimientosLegales(estado);
    if (legales.length === 0) {
      throw new ErrorArena('el agente aleatorio no tiene jugadas legales (¿estado terminal?)');
    }
    const movimiento = contexto.rng.elegirEntre(legales);
    return {
      movimiento,
      estadisticas: { tiempoMs: ahoraMs() - inicio },
    };
  },
};
