/**
 * Tres en raya 3×3 y su variante 4×4 (cuatro en línea).
 * Reglas documentadas en docs/JUEGOS.md (catálogo v1).
 */

import type { PosicionPrueba } from '../motor/tipos';
import { codificarEstadoLineas, crearJuegoLineas, estadoDesdeSecuencia } from './lineas';
import type { EstadoLineas } from './lineas';
import { patronSinLineas } from './ayudantes';

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

function posicionEmpate(tam: number, nombre: string, descripcion: string): PosicionPrueba {
  const estado: EstadoLineas = {
    celdas: patronSinLineas(tam, tam),
    turno: 1,
    jugadas: tam * tam,
    ultima: null,
  };
  return posicion(nombre, `${descripcion} (posición construida, no por secuencia)`, estado, {
    resultadoEsperado: { tipo: 'empate' },
    legalesEsperadas: 0,
  });
}

/* ------------------------------ 3×3 ------------------------------ */

const posiciones3: readonly PosicionPrueba[] = [
  posicion(
    'victoria-inmediata-p1',
    '✕ amenaza completar la fila superior; la única jugada que gana es c1.',
    estadoDesdeSecuencia(3, ['a1', 'a2', 'b1', 'b2']),
    { legalesEsperadas: 5, mejorMovimiento: 'c1' },
  ),
  posicion(
    'bloqueo-obligatorio-p2',
    '◯ debe bloquear la diagonal ✕ (b2, c3) jugando a1 o perderá.',
    estadoDesdeSecuencia(3, ['b2', 'a3', 'c3']),
    { legalesEsperadas: 6, mejorMovimiento: 'a1' },
  ),
  posicion(
    'terminal-victoria-p1',
    '✕ completa la columna a; posición terminal.',
    estadoDesdeSecuencia(3, ['a1', 'b1', 'a2', 'b2', 'a3']),
    { resultadoEsperado: { tipo: 'victoria', ganador: 1 } },
  ),
  posicionEmpate(3, 'terminal-empate', 'Tablero lleno sin líneas de 3.'),
];

export const tresEnRaya3 = crearJuegoLineas({
  id: 'tres-en-raya-3',
  tam: 3,
  objetivo: 3,
  nombre: 'Tres en raya 3×3',
  descripcion:
    'El clásico: 3 marcas propias consecutivas en fila, columna o diagonal. ' +
    'Resuelto: empate con juego perfecto (verificado localmente por solucionador).',
  estiloFicha: 'marcas',
  posiciones: posiciones3,
});

/* ------------------------------ 4×4 ------------------------------ */

const posiciones4: readonly PosicionPrueba[] = [
  posicion(
    'victoria-inmediata-p1-4x4',
    '✕ amenaza completar la fila superior con 4 en línea; gana jugando d1.',
    estadoDesdeSecuencia(4, ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']),
    { legalesEsperadas: 10, mejorMovimiento: 'd1' },
  ),
  posicion(
    'bloqueo-obligatorio-p2-4x4',
    '✕ tiene a1, b2 y c3 en la diagonal; ◯ debe bloquear d4.',
    estadoDesdeSecuencia(4, ['a1', 'd1', 'b2', 'd2', 'c3']),
    { legalesEsperadas: 11, mejorMovimiento: 'd4' },
  ),
  posicion(
    'terminal-victoria-p1-4x4',
    '✕ completa la fila superior de 4; posición terminal.',
    estadoDesdeSecuencia(4, ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1']),
    { resultadoEsperado: { tipo: 'victoria', ganador: 1 } },
  ),
  posicionEmpate(4, 'terminal-empate-4x4', 'Tablero 4×4 lleno sin líneas de 4.'),
];

export const tresEnRaya4 = crearJuegoLineas({
  id: 'tres-en-raya-4',
  tam: 4,
  objetivo: 4,
  nombre: 'Tres en raya 4×4 (cuatro en línea)',
  descripcion:
    'Variante 4×4 con condición de victoria documentada: 4 marcas consecutivas ' +
    '(10 líneas posibles). Estado resuelto localmente por solucionador (ver informe).',
  estiloFicha: 'marcas',
  posiciones: posiciones4,
});
