/**
 * Generador pseudoaleatorio determinista (mulberry32) con semilla.
 *
 * Regla del dominio: toda la aleatoriedad del motor fluye por aquí;
 * `Math.random` está prohibido en el dominio para garantizar reproducibilidad
 * (ADR-003). Ver docs/MODELO_DATOS.md §11.
 */

export interface Rng {
  /** Semilla raíz de esta secuencia. */
  readonly semilla: number;
  /** Siguiente flotante en [0, 1). */
  siguiente(): number;
  /** Entero uniforme en [0, maxExclusivo). Lanza si maxExclusivo ≤ 0. */
  entero(maxExclusivo: number): number;
  /** Elección uniforme; `undefined` si la lista está vacía. */
  elegir<T>(opciones: readonly T[]): T | undefined;
  /** Elección uniforme; lanza si la lista está vacía. */
  elegirEntre<T>(opciones: readonly T[]): T;
  /** Barajado Fisher–Yates in situ sobre una copia (no muta la entrada). */
  barajar<T>(lista: readonly T[]): T[];
}

/** mulberry32: 32 bits, periodo 2^32, suficiente para juegos por turnos. */
function crearMulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearRng(semilla: number): Rng {
  const numero = semilla >>> 0;
  const paso = crearMulberry32(numero);
  const entero = (maxExclusivo: number): number => {
    if (!Number.isFinite(maxExclusivo) || maxExclusivo <= 0) {
      throw new RangeError(`maxExclusivo debe ser > 0 (recibido ${maxExclusivo})`);
    }
    return Math.floor(paso() * maxExclusivo);
  };
  return {
    semilla: numero,
    siguiente: paso,
    entero,
    elegir: <T,>(opciones: readonly T[]): T | undefined =>
      opciones.length === 0 ? undefined : opciones[entero(opciones.length)],
    elegirEntre: <T,>(opciones: readonly T[]): T => {
      if (opciones.length === 0) {
        throw new RangeError('elegirEntre recibió una lista vacía');
      }
      return opciones[entero(opciones.length)] as T;
    },
    barajar: <T,>(lista: readonly T[]): T[] => {
      const copia = [...lista];
      for (let i = copia.length - 1; i > 0; i--) {
        const j = entero(i + 1);
        const a = copia[i] as T;
        const b = copia[j] as T;
        copia[i] = b;
        copia[j] = a;
      }
      return copia;
    },
  };
}

/**
 * Mezcla determinista de semillas (estilo SplitMix) para derivar subsemillas
 * por jugada/agente sin correlaciones. Devuelve entero en [0, 2^32).
 */
export function mezclarSemillas(semilla: number, ...partes: readonly number[]): number {
  let h = semilla >>> 0;
  for (const parte of partes) {
    h = (h ^ (parte >>> 0)) >>> 0;
    h = Math.imul(h, 0x85ebca6b);
    h = (h ^ (h >>> 13)) >>> 0;
  }
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Hash FNV-1a de 32 bits sobre texto (para derivar semillas desde ids). */
export function hashTexto(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
