import { describe, expect, it } from 'vitest';
import { crearRng, hashTexto, mezclarSemillas } from './rng';

describe('RNG mulberry32 con semilla', () => {
  it('es determinista para la misma semilla', () => {
    const a = crearRng(12345);
    const b = crearRng(12345);
    const secuenciaA = Array.from({ length: 100 }, () => a.siguiente());
    const secuenciaB = Array.from({ length: 100 }, () => b.siguiente());
    expect(secuenciaA).toEqual(secuenciaB);
  });

  it('produce valores en [0, 1)', () => {
    const rng = crearRng(7);
    for (let i = 0; i < 10000; i++) {
      const valor = rng.siguiente();
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it('entero devuelve valores en [0, maxExclusivo)', () => {
    const rng = crearRng(99);
    for (let i = 0; i < 2000; i++) {
      const valor = rng.entero(6);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(6);
      expect(Number.isInteger(valor)).toBe(true);
    }
  });

  it('entero lanza con maxExclusivo inválido', () => {
    const rng = crearRng(1);
    expect(() => rng.entero(0)).toThrow(RangeError);
    expect(() => rng.entero(-3)).toThrow(RangeError);
  });

  it('elegir devuelve undefined con lista vacía y elegirEntre lanza', () => {
    const rng = crearRng(3);
    expect(rng.elegir([])).toBeUndefined();
    expect(() => rng.elegirEntre([])).toThrow(RangeError);
  });

  it('distribuye aproximadamente uniforme (prueba de chi-cuadrado ligera)', () => {
    const rng = crearRng(4242);
    const cubos = new Array<number>(10).fill(0);
    const tiradas = 20000;
    for (let i = 0; i < tiradas; i++) {
      const cubo = rng.entero(10);
      cubos[cubo] = (cubos[cubo] ?? 0) + 1;
    }
    const esperado = tiradas / 10;
    // Chi-cuadrado con 9 grados de libertad: percentil 99.999 ≈ 27.9.
    const chi = cubos.reduce((suma, observado) => suma + (observado - esperado) ** 2 / esperado, 0);
    expect(chi).toBeLessThan(27.9);
  });

  it('barajar conserva elementos y es determinista por semilla', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = crearRng(10).barajar(original);
    const b = crearRng(10).barajar(original);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // no muta la entrada
  });
});

describe('mezclarSemillas', () => {
  it('es determinista y sensible a cada parte', () => {
    const base = mezclarSemillas(100, 1, 2);
    expect(mezclarSemillas(100, 1, 2)).toBe(base);
    expect(mezclarSemillas(100, 2, 1)).not.toBe(base);
    expect(mezclarSemillas(101, 1, 2)).not.toBe(base);
    expect(mezclarSemillas(100, 1, 3)).not.toBe(base);
  });

  it('devuelve enteros de 32 bits', () => {
    for (let i = 0; i < 200; i++) {
      const valor = mezclarSemillas(i, i * 3, i * 7);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(valor)).toBe(true);
    }
  });
});

describe('hashTexto', () => {
  it('es determinista y distingue textos', () => {
    expect(hashTexto('aleatorio')).toBe(hashTexto('aleatorio'));
    expect(hashTexto('aleatorio')).not.toBe(hashTexto('heuristico'));
    expect(hashTexto('minimax')).not.toBe(hashTexto('mcts'));
  });
});
