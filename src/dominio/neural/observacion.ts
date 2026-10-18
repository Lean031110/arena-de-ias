/**
 * Codificación de observaciones para redes de tablero (juegos de rejilla
 * con `celdas` y `turno`: tres en raya, gomoku, cuatro en raya…).
 *
 * Contrato v1 (docs/LBA-MODELO.md §4): dos canales, canal 0 = fichas del
 * jugador con turno, canal 1 = fichas del rival. Índice de acción =
 * fila * ancho + columna (recorrido por filas).
 */

import { otroJugador } from '../motor/tipos';
import type { Jugador } from '../motor/tipos';

export interface EstadoTablero {
  readonly celdas: ReadonlyArray<number>;
  readonly turno: Jugador;
}

/**
 * Codifica un estado de tablero en planos [2, alto, ancho].
 * Compatible con cualquier juego cuya celda sea 0 (vacía), 1 o 2.
 */
export function observarTablero(estado: EstadoTablero, alto: number, ancho: number): Float32Array {
  if (estado.celdas.length !== alto * ancho) {
    throw new Error(`tablero de ${estado.celdas.length} celdas, esperadas ${alto * ancho}`);
  }
  const rival = otroJugador(estado.turno);
  const planos = new Float32Array(2 * alto * ancho);
  for (let i = 0; i < estado.celdas.length; i++) {
    const valor = estado.celdas[i]!;
    if (valor === estado.turno) planos[i] = 1;
    else if (valor === rival) planos[alto * ancho + i] = 1;
  }
  return planos;
}

/** Índice de acción (fila-major) para un movimiento de celda. */
export function indiceAccion(fila: number, columna: number, ancho: number): number {
  return fila * ancho + columna;
}

/** Inverso de `indiceAccion`. */
export function coordenadaDeIndice(indice: number, ancho: number): { fila: number; columna: number } {
  return { fila: Math.floor(indice / ancho), columna: indice % ancho };
}
