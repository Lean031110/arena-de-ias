/**
 * Nivel 3 — Minimax (negamax) con poda alfa-beta.
 *
 * Presupuestos estrictos (se respetan y se registran):
 * - `profundidad`: profundidad máxima exacta.
 * - `nodoLimite`: techo duro de nodos explorados (la expansión se detiene
 *   al alcanzarlo; se marca `presupuestoAgotado`).
 * - `tiempoLimiteMs`: techo blando de tiempo (comprobado periódicamente).
 *
 * Ordenación: barajado con el RNG del contexto (variedad reproducible) y
 * orden estable por evaluación estática descendente (mejora la poda).
 * Determinista para la misma semilla y estado.
 */

import type { Agente, ContextoAgente, Decision, EstadisticasBusqueda, Juego } from '../motor/tipos';
import { ahoraMs } from '../motor/tipos';
import { ErrorArena } from '../motor/errores';

export interface ConfigMinimax {
  /** Profundidad máxima de búsqueda (por defecto 3). */
  profundidad?: number;
  /** Techo duro de nodos explorados (por defecto 60000). */
  nodoLimite?: number;
  /** Techo blando de tiempo en milisegundos (por defecto 2000). */
  tiempoLimiteMs?: number;
}

interface HijoOrdenable<M> {
  readonly movimiento: M;
  readonly valorEstatico: number;
}

function valorTerminalDesdeJugadorAJugar<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
): number | null {
  const resultado = juego.resultado(estado);
  if (resultado === null) return null;
  if (resultado.tipo === 'empate') return 0;
  const ganador = resultado.ganador;
  const jugadorAJugar = juego.jugadorActual(estado);
  return ganador === jugadorAJugar ? 1 : -1;
}

export function crearAgenteMinimax(config: ConfigMinimax = {}): Agente {
  const profundidadMaxima = Math.max(1, Math.floor(config.profundidad ?? 3));
  const nodoLimite = Math.max(1, Math.floor(config.nodoLimite ?? 60000));
  const tiempoLimiteMs = Math.max(1, config.tiempoLimiteMs ?? 2000);

  return {
    elegirMovimiento<S extends object, M extends object>(
      juego: Juego<S, M>,
      estado: S,
      contexto: ContextoAgente,
    ): Decision<M> {
      const inicio = ahoraMs();
      let nodos = 0;
      let presupuestoAgotado = false;
      let profundidadAlcanzada = 0;

      const tiempoAgotado = (): boolean => ahoraMs() - inicio > tiempoLimiteMs;

      const negamax = (estadoActual: S, profundidad: number, alfa: number, beta: number): number => {
        nodos++;
        profundidadAlcanzada = Math.max(
          profundidadAlcanzada,
          profundidadMaxima - profundidad,
        );
        const terminal = valorTerminalDesdeJugadorAJugar(juego, estadoActual);
        if (terminal !== null) return terminal;
        if (profundidad === 0) {
          return juego.evaluar(estadoActual, juego.jugadorActual(estadoActual));
        }
        if (nodos >= nodoLimite || tiempoAgotado()) {
          presupuestoAgotado = true;
          return juego.evaluar(estadoActual, juego.jugadorActual(estadoActual));
        }

        // Ordenación: barajado reproducible + evaluación estática descendente.
        const jugador = juego.jugadorActual(estadoActual);
        const hijos: HijoOrdenable<M>[] = contexto.rng
          .barajar(juego.movimientosLegales(estadoActual))
          .map((movimiento) => ({
            movimiento,
            valorEstatico: juego.evaluar(juego.aplicarMovimiento(estadoActual, movimiento), jugador),
          }));
        hijos.sort((a, b) => b.valorEstatico - a.valorEstatico);

        let mejorValor = Number.NEGATIVE_INFINITY;
        let alfaLocal = alfa;
        for (const hijo of hijos) {
          const estadoHijo = juego.aplicarMovimiento(estadoActual, hijo.movimiento);
          const valor = -negamax(estadoHijo, profundidad - 1, -beta, -alfaLocal);
          if (valor > mejorValor) mejorValor = valor;
          if (mejorValor > alfaLocal) alfaLocal = mejorValor;
          if (alfaLocal >= beta) break; // poda beta
          if (nodos >= nodoLimite || tiempoAgotado()) {
            presupuestoAgotado = true;
            break;
          }
        }
        return mejorValor;
      };

      const legales = juego.movimientosLegales(estado);
      if (legales.length === 0) {
        throw new ErrorArena('minimax no tiene jugadas legales (¿estado terminal?)');
      }
      const jugadorRaiz = juego.jugadorActual(estado);
      const hijos: HijoOrdenable<M>[] = contexto.rng
        .barajar(legales)
        .map((movimiento) => ({
          movimiento,
          valorEstatico: juego.evaluar(juego.aplicarMovimiento(estado, movimiento), jugadorRaiz),
        }));
      hijos.sort((a, b) => b.valorEstatico - a.valorEstatico);

      let mejorMovimiento: M | null = null;
      let mejorValor = Number.NEGATIVE_INFINITY;
      for (const hijo of hijos) {
        const estadoHijo = juego.aplicarMovimiento(estado, hijo.movimiento);
        const valor = -negamax(estadoHijo, profundidadMaxima - 1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
        if (valor > mejorValor) {
          mejorValor = valor;
          mejorMovimiento = hijo.movimiento;
        }
      }
      if (mejorMovimiento === null) {
        throw new ErrorArena('minimax no pudo elegir jugada');
      }

      const estadisticas: EstadisticasBusqueda = {
        nodos,
        profundidad: profundidadAlcanzada,
        presupuestoAgotado,
        tiempoMs: ahoraMs() - inicio,
      };
      return { movimiento: mejorMovimiento, estadisticas };
    },
  };
}

/** Validación de parámetros de minimax para la configuración de agentes. */
export function validarConfigMinimax(config: Readonly<Record<string, number | boolean>>): string[] {
  const errores: string[] = [];
  const profundidad = config['profundidad'];
  if (typeof profundidad === 'number' && (!Number.isInteger(profundidad) || profundidad < 1 || profundidad > 12)) {
    errores.push('profundidad debe ser un entero en [1, 12]');
  }
  const nodoLimite = config['nodoLimite'];
  if (typeof nodoLimite === 'number' && (!Number.isInteger(nodoLimite) || nodoLimite < 100 || nodoLimite > 5_000_000)) {
    errores.push('nodoLimite debe ser un entero en [100, 5000000]');
  }
  const tiempoLimiteMs = config['tiempoLimiteMs'];
  if (typeof tiempoLimiteMs === 'number' && (tiempoLimiteMs < 50 || tiempoLimiteMs > 60000)) {
    errores.push('tiempoLimiteMs debe estar en [50, 60000]');
  }
  return errores;
}
