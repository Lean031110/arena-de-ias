/**
 * Ayudantes compartidos por los juegos de tablero rectangular.
 * Representación: celdas en fila-major (índice = fila * ancho + columna).
 */

import type { Marca } from '../motor/tipos';

export function indiceCelda(fila: number, columna: number, ancho: number): number {
  return fila * ancho + columna;
}

export function dentroDeTablero(
  fila: number,
  columna: number,
  ancho: number,
  alto: number,
): boolean {
  return fila >= 0 && fila < alto && columna >= 0 && columna < ancho;
}

export function leerCelda(
  celdas: readonly Marca[],
  ancho: number,
  fila: number,
  columna: number,
): Marca {
  const valor = celdas[indiceCelda(fila, columna, ancho)];
  return valor ?? 0;
}

/**
 * Longitud de la línea consecutiva de `jugador` que pasa por (fila, columna)
 * en la dirección (df, dc) (contando ambas orientaciones).
 */
export function longitudLinea(
  celdas: readonly Marca[],
  ancho: number,
  alto: number,
  fila: number,
  columna: number,
  df: number,
  dc: number,
  jugador: Marca,
): number {
  const cuenta = (pasoF: number, pasoC: number): number => {
    let total = 0;
    let f = fila + pasoF;
    let c = columna + pasoC;
    while (dentroDeTablero(f, c, ancho, alto) && leerCelda(celdas, ancho, f, c) === jugador) {
      total++;
      f += pasoF;
      c += pasoC;
    }
    return total;
  };
  if (leerCelda(celdas, ancho, fila, columna) !== jugador) return 0;
  return 1 + cuenta(df, dc) + cuenta(-df, -dc);
}

const DIRECCIONES: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** ¿Existe una línea de `objetivo` o más de `jugador` que pase por el origen? */
export function hayLineaDesde(
  celdas: readonly Marca[],
  ancho: number,
  alto: number,
  fila: number,
  columna: number,
  jugador: Marca,
  objetivo: number,
): boolean {
  for (const [df, dc] of DIRECCIONES) {
    if (longitudLinea(celdas, ancho, alto, fila, columna, df, dc, jugador) >= objetivo) {
      return true;
    }
  }
  return false;
}

/**
 * Puntuación heurística por ventanas deslizantes de `longitud` (en las 4
 * direcciones): ventana con ambas marcas = 0; en otro caso 8^(k−1) con k =
 * piedras del jugador. Signo positivo para `jugador`, negativo para el rival.
 * Es una ESTIMACIÓN (nunca una probabilidad garantizada).
 */
export function puntuarVentanas(
  celdas: readonly Marca[],
  ancho: number,
  alto: number,
  longitud: number,
  jugador: Marca,
): number {
  const rival: Marca = jugador === 1 ? 2 : 1;
  const valorVentana = (mias: number, suyas: number): number => {
    if (mias > 0 && suyas > 0) return 0;
    if (mias === 0 && suyas === 0) return 0;
    const k = mias > 0 ? mias : suyas;
    const magnitud = Math.pow(8, k - 1);
    return mias > 0 ? magnitud : -magnitud;
  };

  let puntuacion = 0;
  for (let fila = 0; fila < alto; fila++) {
    for (let columna = 0; columna < ancho; columna++) {
      for (const [df, dc] of DIRECCIONES) {
        const finFila = fila + df * (longitud - 1);
        const finColumna = columna + dc * (longitud - 1);
        if (!dentroDeTablero(finFila, finColumna, ancho, alto)) continue;
        let mias = 0;
        let suyas = 0;
        for (let paso = 0; paso < longitud; paso++) {
          const valor = leerCelda(celdas, ancho, fila + df * paso, columna + dc * paso);
          if (valor === jugador) mias++;
          else if (valor === rival) suyas++;
        }
        puntuacion += valorVentana(mias, suyas);
      }
    }
  }
  return puntuacion;
}

/**
 * Patrón de llenado completo sin líneas de 4+ en ninguna dirección:
 * color = ((fila + 2·columna) mod 4) < 2 ? 1 : 2. La corrida máxima es 2.
 * Sirve para construir posiciones terminales de empate (documentado como
 * posición construida, no alcanzada por secuencia).
 */
export function patronSinLineas(ancho: number, alto: number): Marca[] {
  const celdas: Marca[] = new Array<Marca>(ancho * alto).fill(0);
  for (let fila = 0; fila < alto; fila++) {
    for (let columna = 0; columna < ancho; columna++) {
      celdas[indiceCelda(fila, columna, ancho)] = (fila + 2 * columna) % 4 < 2 ? 1 : 2;
    }
  }
  return celdas;
}

export interface TransformacionCoordenada {
  readonly id: string;
  readonly descripcion: string;
  aplicar(fila: number, columna: number): { fila: number; columna: number };
}

/**
 * Grupo dihedral D4 para tableros cuadrados de lado n (8 elementos,
 * identidad primero). Aplicado a celdas produce estados equivalentes.
 */
export function simetriasD4(n: number): readonly TransformacionCoordenada[] {
  return [
    { id: 'identidad', descripcion: 'identidad', aplicar: (f, c) => ({ fila: f, columna: c }) },
    { id: 'rot90', descripcion: 'rotación 90° horaria', aplicar: (f, c) => ({ fila: c, columna: n - 1 - f }) },
    { id: 'rot180', descripcion: 'rotación 180°', aplicar: (f, c) => ({ fila: n - 1 - f, columna: n - 1 - c }) },
    { id: 'rot270', descripcion: 'rotación 270° horaria', aplicar: (f, c) => ({ fila: n - 1 - c, columna: f }) },
    { id: 'espejo-vertical', descripcion: 'espejo vertical (filas)', aplicar: (f, c) => ({ fila: n - 1 - f, columna: c }) },
    { id: 'espejo-horizontal', descripcion: 'espejo horizontal (columnas)', aplicar: (f, c) => ({ fila: f, columna: n - 1 - c }) },
    { id: 'transpuesta', descripcion: 'transpuesta (diagonal principal)', aplicar: (f, c) => ({ fila: c, columna: f }) },
    { id: 'antitranspuesta', descripcion: 'antitranspuesta (diagonal secundaria)', aplicar: (f, c) => ({ fila: n - 1 - c, columna: n - 1 - f }) },
  ];
}

/** Aplica una transformación de coordenadas a un tablero plano (fila-major). */
export function transformarCeldas(
  celdas: readonly Marca[],
  ancho: number,
  alto: number,
  transformacion: TransformacionCoordenada,
): Marca[] {
  const resultado: Marca[] = new Array<Marca>(ancho * alto).fill(0);
  for (let fila = 0; fila < alto; fila++) {
    for (let columna = 0; columna < ancho; columna++) {
      const destino = transformacion.aplicar(fila, columna);
      resultado[indiceCelda(destino.fila, destino.columna, ancho)] =
        leerCelda(celdas, ancho, fila, columna);
    }
  }
  return resultado;
}

const LETRAS_COLUMNAS = 'abcdefghijklmnop';

export function letraColumna(columna: number): string {
  return LETRAS_COLUMNAS[columna] ?? '?';
}

export function numeroDeLetra(letra: string): number | null {
  const indice = LETRAS_COLUMNAS.indexOf(letra.toLowerCase());
  return indice === -1 ? null : indice;
}

/** Analiza una notación de celda "c3" con límites del tablero. */
export function analizarNotacionCelda(
  texto: string,
  ancho: number,
  alto: number,
): { fila: number; columna: number } | null {
  const coincidencia = /^([a-p])([0-9]{1,2})$/.exec(texto.trim().toLowerCase());
  if (coincidencia === null) return null;
  const columna = numeroDeLetra(coincidencia[1] ?? '');
  const filaNumero = Number(coincidencia[2]);
  if (columna === null || !Number.isInteger(filaNumero)) return null;
  const fila = filaNumero - 1;
  if (!dentroDeTablero(fila, columna, ancho, alto)) return null;
  return { fila, columna };
}

/** Analiza una notación de columna "d" con límites del tablero. */
export function analizarNotacionColumna(
  texto: string,
  ancho: number,
): number | null {
  const coincidencia = /^([a-p])$/.exec(texto.trim().toLowerCase());
  if (coincidencia === null) return null;
  const columna = numeroDeLetra(coincidencia[1] ?? '');
  if (columna === null || columna >= ancho) return null;
  return columna;
}
