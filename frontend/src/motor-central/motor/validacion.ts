/**
 * Validación de secuencias de movimientos (replay): repite una partida desde
 * el estado inicial comprobando la legalidad de cada jugada en notación y
 * devolviendo el estado final y su resultado según las reglas.
 */

import type { Juego, ResultadoTerminal } from './tipos';

export interface ResultadoValidacion<S, M> {
  readonly valido: boolean;
  readonly motivos: readonly string[];
  readonly movimientos: readonly M[];
  readonly estadoFinal: S;
  readonly resultado: ResultadoTerminal | null;
}

export function validarSecuencia<S extends object, M extends object>(
  juego: Juego<S, M>,
  notaciones: readonly string[],
): ResultadoValidacion<S, M> {
  const motivos: string[] = [];
  const movimientos: M[] = [];
  let estado = juego.crearEstadoInicial();
  let valido = true;

  for (let indice = 0; indice < notaciones.length; indice++) {
    const notacion = notaciones[indice] ?? '';
    const movimiento = juego.analizarMovimiento(notacion);
    if (movimiento === null) {
      motivos.push(`jugada ${indice}: notación «${notacion}» no reconocida`);
      valido = false;
      break;
    }
    const comprobacion = juego.validarMovimiento(estado, movimiento);
    if (!comprobacion.valido) {
      motivos.push(
        `jugada ${indice} (${notacion}): ${comprobacion.motivo ?? 'movimiento ilegal'}`,
      );
      valido = false;
      break;
    }
    estado = juego.aplicarMovimiento(estado, movimiento);
    movimientos.push(movimiento);
  }

  // La secuencia no puede continuar tras un estado terminal.
  if (valido && movimientos.length > 0) {
    // Recorremos comprobando que ninguna jugada se hizo sobre un terminal.
    let estadoReplay = juego.crearEstadoInicial();
    for (let indice = 0; indice < movimientos.length; indice++) {
      if (juego.esTerminal(estadoReplay)) {
        motivos.push(`jugada ${indice}: la partida ya estaba terminada`);
        valido = false;
        break;
      }
      const movimiento = movimientos[indice];
      if (movimiento === undefined) break;
      estadoReplay = juego.aplicarMovimiento(estadoReplay, movimiento);
    }
  }

  return {
    valido,
    motivos,
    movimientos,
    estadoFinal: estado,
    resultado: juego.resultado(estado),
  };
}
