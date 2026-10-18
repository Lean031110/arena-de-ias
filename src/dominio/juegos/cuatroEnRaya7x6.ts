/**
 * Instancia de Cuatro en raya 7×6 con posiciones de referencia.
 * Reglas documentadas en docs/JUEGOS.md (catálogo v1).
 */

import type { Marca, PosicionPrueba } from '../motor/tipos';
import { crearJuegoCuatroEnRaya } from './cuatroEnRaya';
import type { EstadoCuatro } from './cuatroEnRaya';
import { analizarNotacionColumna, indiceCelda } from './ayudantes';

const ANCHO = 7;
const ALTO = 6;

/** Estado construido a partir de jugadas por columna (notación "a", "d", …). */
function estadoDesdeColumnas(secuencia: readonly string[]): EstadoCuatro {
  const celdas: Marca[] = new Array<Marca>(ANCHO * ALTO).fill(0);
  const alturas: number[] = new Array<number>(ANCHO).fill(0);
  let turno: 1 | 2 = 1;
  let ultima: { fila: number; columna: number } | null = null;
  for (const notacion of secuencia) {
    const columna = analizarNotacionColumna(notacion, ANCHO);
    if (columna === null) {
      throw new Error(`notación de columna inválida: ${notacion}`);
    }
    const altura = alturas[columna] ?? 0;
    if (altura >= ALTO) {
      throw new Error(`columna llena: ${notacion}`);
    }
    celdas[indiceCelda(altura, columna, ANCHO)] = turno;
    alturas[columna] = altura + 1;
    ultima = { fila: altura, columna };
    turno = turno === 1 ? 2 : 1;
  }
  return { celdas, alturas, turno, ultima };
}

function codificar(estado: EstadoCuatro): string {
  return JSON.stringify({
    celdas: estado.celdas,
    alturas: estado.alturas,
    turno: estado.turno,
    ultima: estado.ultima,
  });
}

function posicion(
  nombre: string,
  descripcion: string,
  estado: EstadoCuatro,
  extra?: Omit<PosicionPrueba, 'nombre' | 'descripcion' | 'estadoCodificado'>,
): PosicionPrueba {
  return { nombre, descripcion, estadoCodificado: codificar(estado), ...extra };
}

/** Tablero lleno con el patrón sin líneas (empate, posición construida). */
function estadoEmpate(): EstadoCuatro {
  const celdas: Marca[] = new Array<Marca>(ANCHO * ALTO).fill(0);
  const alturas: number[] = new Array<number>(ANCHO).fill(ALTO);
  for (let fila = 0; fila < ALTO; fila++) {
    for (let columna = 0; columna < ANCHO; columna++) {
      celdas[indiceCelda(fila, columna, ANCHO)] = (fila + 2 * columna) % 4 < 2 ? 1 : 2;
    }
  }
  return { celdas, alturas, turno: 1, ultima: null };
}

/** Victoria diagonal de P1 construida (posición no alcanzada por secuencia). */
function estadoVictoriaDiagonal(): EstadoCuatro {
  // P1: (0,a) (1,b) (2,c) (3,d); P2 rellena el resto de esas columnas.
  const celdas: Marca[] = new Array<Marca>(ANCHO * ALTO).fill(0);
  const alturas: number[] = new Array<number>(ANCHO).fill(0);
  const pila: Array<{ fila: number; columna: number; marca: Marca }> = [
    { fila: 0, columna: 0, marca: 1 },
    { fila: 0, columna: 1, marca: 2 },
    { fila: 1, columna: 1, marca: 1 },
    { fila: 0, columna: 2, marca: 2 },
    { fila: 1, columna: 2, marca: 2 },
    { fila: 2, columna: 2, marca: 1 },
    { fila: 0, columna: 3, marca: 2 },
    { fila: 1, columna: 3, marca: 1 },
    { fila: 2, columna: 3, marca: 2 },
    { fila: 3, columna: 3, marca: 1 },
  ];
  let ultima: { fila: number; columna: number } | null = null;
  for (const ficha of pila) {
    celdas[indiceCelda(ficha.fila, ficha.columna, ANCHO)] = ficha.marca;
    alturas[ficha.columna] = ficha.fila + 1;
    ultima = { fila: ficha.fila, columna: ficha.columna };
  }
  return { celdas, alturas, turno: 2, ultima };
}

const posiciones: readonly PosicionPrueba[] = [
  posicion(
    'victoria-inmediata-p1',
    '✕ tiene a1-a3 en la columna a; gana soltando la cuarta ficha en a.',
    estadoDesdeColumnas(['a', 'b', 'a', 'b', 'a', 'b']),
    { legalesEsperadas: 7, mejorMovimiento: 'a' },
  ),
  posicion(
    'bloqueo-obligatorio-p1',
    '◯ tiene c1-c3; ✕ no tiene victoria propia y debe bloquear la columna c.',
    estadoDesdeColumnas(['a', 'c', 'b', 'c', 'd', 'c']),
    { legalesEsperadas: 7, mejorMovimiento: 'c' },
  ),
  posicion(
    'terminal-victoria-diagonal-p1',
    'Diagonal ascendente de ✕ de a1 a d4 (posición construida).',
    estadoVictoriaDiagonal(),
    { resultadoEsperado: { tipo: 'victoria', ganador: 1 }, legalesEsperadas: 7 },
  ),
  posicion(
    'terminal-empate',
    'Tablero lleno de 42 fichas sin líneas de 4 (posición construida).',
    estadoEmpate(),
    { resultadoEsperado: { tipo: 'empate' }, legalesEsperadas: 0 },
  ),
];

export const cuatroEnRaya7x6 = crearJuegoCuatroEnRaya({
  id: 'cuatro-en-raya-7x6',
  ancho: ANCHO,
  alto: ALTO,
  nombre: 'Cuatro en raya 7×6',
  descripcion:
    'Siete columnas y seis filas con gravedad: la ficha cae a la casilla libre ' +
    'más baja. Cuatro propias consecutivas en cualquier dirección ganan. ' +
    'Conocido como resuelto externamente; NO verificado localmente (pendiente).',
  posiciones,
});
