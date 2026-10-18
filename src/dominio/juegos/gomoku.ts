/**
 * Gomoku estilo libre (5 o más en línea gana) en tableros 7×7, 9×9 y 15×15.
 * Reglas documentadas en docs/JUEGOS.md (catálogo v1).
 */

import type { Marca, PosicionPrueba } from '../motor/tipos';
import { codificarEstadoLineas, crearJuegoLineas } from './lineas';
import type { EstadoLineas } from './lineas';
import { indiceCelda, patronSinLineas } from './ayudantes';

function posicion(
  nombre: string,
  descripcion: string,
  estado: EstadoLineas,
  extra?: Omit<PosicionPrueba, 'nombre' | 'descripcion' | 'estadoCodificado'>,
): PosicionPrueba {
  return {
    nombre,
    descripcion,
    estadoCodificado: codificarEstadoLineas(estado),
    ...extra,
  };
}

/** Coloca piedras de ambos jugadores en coordenadas (fila, columna) 0-based. */
function estadoConPiedras(
  tam: number,
  p1: readonly [number, number][],
  p2: readonly [number, number][],
  turno: 1 | 2,
  ultima: [number, number] | null,
): EstadoLineas {
  const celdas: Marca[] = new Array<Marca>(tam * tam).fill(0);
  for (const [fila, columna] of p1) celdas[indiceCelda(fila, columna, tam)] = 1;
  for (const [fila, columna] of p2) celdas[indiceCelda(fila, columna, tam)] = 2;
  const jugadas = p1.length + p2.length;
  return {
    celdas,
    turno,
    jugadas,
    ultima:
      ultima === null
        ? null
        : { fila: ultima[0], columna: ultima[1] },
  };
}

function posicionEmpate(tam: number): PosicionPrueba {
  const estado: EstadoLineas = {
    celdas: patronSinLineas(tam, tam),
    turno: 1,
    jugadas: tam * tam,
    ultima: null,
  };
  return posicion(
    'terminal-empate',
    'Tablero lleno sin líneas de 5 (posición construida, no por secuencia).',
    estado,
    { resultadoEsperado: { tipo: 'empate' }, legalesEsperadas: 0 },
  );
}

/**
 * Posición con una única jugada ganadora inmediata: cuatro piedras propias
 * consecutivas con un extremo bloqueado por el rival y el otro libre.
 * Recuento alternante coherente: P1 = 4, P2 = 4, turno de P1.
 */
function posicionVictoriaInmediata(tam: number): PosicionPrueba {
  const p1: readonly [number, number][] = [
    [3, 2],
    [3, 3],
    [3, 4],
    [3, 5],
  ];
  const p2: readonly [number, number][] = [
    [2, 2],
    [4, 3],
    [3, 1],
    [6, 6],
  ];
  const estado = estadoConPiedras(tam, p1, p2, 1, [3, 5]);
  return posicion(
    'victoria-inmediata',
    'Negras tienen cuatro en fila con un extremo bloqueado; la única jugada ganadora es g4.',
    estado,
    { legalesEsperadas: tam * tam - 8, mejorMovimiento: 'g4' },
  );
}

/** Construye posiciones para un gomoku de tamaño dado. */
function posicionesGomoku(tam: number): readonly PosicionPrueba[] {
  const victoria = posicionVictoriaInmediata(tam);
  // Cinco en línea terminal (fila 4, columnas c..g en notación 1-based).
  const p1Cinco: readonly [number, number][] = [
    [3, 2],
    [3, 3],
    [3, 4],
    [3, 5],
    [3, 6],
  ];
  const terminal5 = posicion(
    'terminal-victoria-cinco',
    'Cinco piedras consecutivas de negras: posición terminal.',
    estadoConPiedras(tam, p1Cinco, [[2, 2], [4, 4], [3, 1]], 2, [3, 6]),
    { resultadoEsperado: { tipo: 'victoria', ganador: 1 } },
  );

  // Overline (6 en línea) también gana en estilo libre.
  const p1Seis: readonly [number, number][] = [
    [5, 1],
    [5, 2],
    [5, 3],
    [5, 4],
    [5, 5],
    [5, 6],
  ];
  const overline = posicion(
    'terminal-victoria-overline',
    'Seis piedras consecutivas: en estilo libre también es victoria.',
    estadoConPiedras(tam, p1Seis, [[4, 2], [6, 5]], 2, [5, 6]),
    { resultadoEsperado: { tipo: 'victoria', ganador: 1 } },
  );

  return [victoria, terminal5, overline, posicionEmpate(tam)];
}

export const gomoku7 = crearJuegoLineas({
  id: 'gomoku-7',
  tam: 7,
  objetivo: 5,
  nombre: 'Gomoku 7×7',
  descripcion:
    'Cinco o más piedras consecutivas en cualquier dirección (estilo libre, ' +
    'sin reglas de apertura). Sin solución local conocida.',
  estiloFicha: 'piedras',
  posiciones: posicionesGomoku(7),
});

export const gomoku9 = crearJuegoLineas({
  id: 'gomoku-9',
  tam: 9,
  objetivo: 5,
  nombre: 'Gomoku 9×9',
  descripcion:
    'Cinco o más piedras consecutivas en cualquier dirección (estilo libre) ' +
    'sobre tablero 9×9.',
  estiloFicha: 'piedras',
  posiciones: posicionesGomoku(9),
});

export const gomoku15 = crearJuegoLineas({
  id: 'gomoku-15',
  tam: 15,
  objetivo: 5,
  nombre: 'Gomoku 15×15',
  descripcion:
    'Cinco o más piedras consecutivas en cualquier dirección (estilo libre) ' +
    'sobre el tablero clásico 15×15. Coste de búsqueda elevado: usa presupuestos moderados.',
  estiloFicha: 'piedras',
  posiciones: posicionesGomoku(15),
});
