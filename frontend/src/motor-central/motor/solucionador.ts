/**
 * Solucionador exacto genérico: negamax a profundidad completa (sin poda
 * alfa-beta, para que la tabla de transposición guarde valores exactos) con
 * claves canónicas por simetría.
 *
 * Corrección del diseño:
 * - Sin poda alfa-beta ⇒ el valor de un estado depende solo del estado ⇒
 *   la TT es exacta (sin bandas superior/inferior).
 * - Clave canónica = mínimo entre las claves de los estados simétricos ⇒
 *   las simetrías declaradas y probadas garantizan el mismo valor.
 * - Presupuesto de tiempo de seguridad: si se agota, `completo = false` y
 *   NADA se declara resuelto (regla de integridad).
 */

import type { Juego, JuegoConcreto } from './tipos';
import { ahoraMs } from './tipos';

export interface ResultadoSolucion {
  /** Valor del juego desde el jugador 1: +1 gana, 0 empate, −1 pierde. */
  readonly valor: -1 | 0 | 1;
  /** Notaciones de las jugadas óptimas en la raíz. */
  readonly jugadasOptimas: readonly string[];
  readonly nodos: number;
  readonly tiempoMs: number;
  readonly completo: boolean;
  readonly presupuestoAgotado: boolean;
}

interface ContextoSolver<S extends object, M extends object> {
  readonly juego: Juego<S, M>;
  readonly tabla: Map<string, number>;
  nodos: number;
  readonly inicio: number;
  readonly presupuestoMs: number;
}

class SenalPresupuesto extends Error {
  constructor() {
    super('presupuesto de tiempo del solucionador agotado');
  }
}

function claveCanonica<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
): string {
  const numeroSimetrias = juego.simetrias.length;
  let claveMinima = juego.claveEstado(estado);
  if (numeroSimetrias <= 1) return claveMinima;
  for (let indice = 1; indice < numeroSimetrias; indice++) {
    const simetrico = juego.aplicarSimetria(estado, indice);
    const clave = juego.claveEstado(simetrico);
    if (clave < claveMinima) claveMinima = clave;
  }
  return claveMinima;
}

/** Negamax exacto (sin poda) con TT por clave canónica. */
function negamaxExacto<S extends object, M extends object>(
  contexto: ContextoSolver<S, M>,
  estado: S,
): number {
  contexto.nodos++;
  if (contexto.nodos % 2048 === 0 && ahoraMs() - contexto.inicio > contexto.presupuestoMs) {
    throw new SenalPresupuesto();
  }
  const resultado = contexto.juego.resultado(estado);
  if (resultado !== null) {
    if (resultado.tipo === 'empate') return 0;
    return resultado.ganador === contexto.juego.jugadorActual(estado) ? 1 : -1;
  }
  const clave = claveCanonica(contexto.juego, estado);
  const memo = contexto.tabla.get(clave);
  if (memo !== undefined) return memo;

  let mejor = Number.NEGATIVE_INFINITY;
  for (const movimiento of contexto.juego.movimientosLegales(estado)) {
    const hijo = contexto.juego.aplicarMovimiento(estado, movimiento);
    const valor = -negamaxExacto(contexto, hijo);
    if (valor > mejor) mejor = valor;
  }
  contexto.tabla.set(clave, mejor);
  return mejor;
}

/**
 * Resuelve el juego (o el estado dado) exhaustivamente dentro del presupuesto.
 * `completo = false` ⇒ la búsqueda NO terminó: ningún resultado se declara.
 */
export function resolverJuego(
  juego: JuegoConcreto,
  presupuestoMs = 30000,
  estadoInicialCodificado?: string,
): ResultadoSolucion {
  const estadoInicial =
    estadoInicialCodificado === undefined
      ? juego.crearEstadoInicial()
      : juego.decodificar(estadoInicialCodificado);
  const contexto: ContextoSolver<object, object> = {
    juego: juego as unknown as Juego<object, object>,
    tabla: new Map<string, number>(),
    nodos: 0,
    inicio: ahoraMs(),
    presupuestoMs,
  };

  try {
    const valorJugador1 =
      juego.jugadorActual(estadoInicial) === 1
        ? negamaxExacto(contexto, estadoInicial)
        : -negamaxExacto(contexto, estadoInicial);

    // Jugadas óptimas en la raíz: aquellas cuyo valor negado coincide con el
    // valor de la raíz. Los hijos suelen estar ya en la TT; si no, se calculan.
    const jugadasOptimas: string[] = [];
    for (const movimiento of juego.movimientosLegales(estadoInicial)) {
      const hijo = juego.aplicarMovimiento(estadoInicial, movimiento);
      const claveHijo = claveCanonica(juego, hijo);
      // La TT guarda el valor del hijo desde el jugador con turno en el hijo;
      // el valor de la jugada desde la raíz es su negación.
      const valorHijo = contexto.tabla.get(claveHijo) ?? negamaxExacto(contexto, hijo);
      if (-valorHijo === valorJugador1) {
        jugadasOptimas.push(juego.formatearMovimiento(movimiento));
      }
    }

    // Normalización de −0 (Object.is distingue 0 de −0).
    const valorNormalizado = valorJugador1 === 0 ? 0 : valorJugador1;
    return {
      valor: Math.max(-1, Math.min(1, Math.round(valorNormalizado))) as -1 | 0 | 1,
      jugadasOptimas,
      nodos: contexto.nodos,
      tiempoMs: ahoraMs() - contexto.inicio,
      completo: true,
      presupuestoAgotado: false,
    };
  } catch (error) {
    if (error instanceof SenalPresupuesto) {
      return {
        valor: 0,
        jugadasOptimas: [],
        nodos: contexto.nodos,
        tiempoMs: ahoraMs() - contexto.inicio,
        completo: false,
        presupuestoAgotado: true,
      };
    }
    throw error;
  }
}

/** Mejor jugada y valor exacto de un estado concreto (null si es terminal). */
export function mejorJugada(
  juego: JuegoConcreto,
  estadoCodificado: string,
  presupuestoMs = 30000,
): { notacion: string; valor: -1 | 0 | 1 } | null {
  const estado = juego.decodificar(estadoCodificado);
  if (juego.esTerminal(estado)) return null;
  const resultado = resolverJuego(juego, presupuestoMs, estadoCodificado);
  if (!resultado.completo || resultado.jugadasOptimas.length === 0) return null;
  return {
    notacion: resultado.jugadasOptimas[0] ?? '',
    valor: resultado.valor,
  };
}
