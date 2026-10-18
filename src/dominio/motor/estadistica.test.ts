import { describe, expect, it } from 'vitest';
import { intervaloWilson, media, redondear } from './estadistica';

describe('intervalo de confianza de Wilson (95 %)', () => {
  it('devuelve no disponible con n = 0', () => {
    const intervalo = intervaloWilson(0, 0, 0);
    expect(intervalo.disponible).toBe(false);
    expect(intervalo.n).toBe(0);
  });

  it('coincide con valores de referencia conocidos', () => {
    // 5 victorias, 0 empates, 10 partidas: p̂ = 0.5.
    // Wilson 95 %: [0.236603, 0.763397].
    const intervalo = intervaloWilson(5, 0, 10);
    expect(intervalo.disponible).toBe(true);
    expect(intervalo.puntuacion).toBeCloseTo(0.5, 6);
    expect(intervalo.inferior).toBeCloseTo(0.236603, 4);
    expect(intervalo.superior).toBeCloseTo(0.763397, 4);
  });

  it('un punto medio de empates cuenta como media victoria', () => {
    // 4 victorias + 2 empates = 5 puntos de 10 ⇒ mismo intervalo que 5/10.
    const conEmpates = intervaloWilson(4, 2, 10);
    const sinEmpates = intervaloWilson(5, 0, 10);
    expect(conEmpates.puntuacion).toBeCloseTo(sinEmpates.puntuacion, 6);
    expect(conEmpates.inferior).toBeCloseTo(sinEmpates.inferior, 6);
    expect(conEmpates.superior).toBeCloseTo(sinEmpates.superior, 6);
  });

  it('contiene siempre la puntuación observada y está dentro de [0, 1]', () => {
    const casos: Array<[number, number, number]> = [
      [0, 0, 12],
      [12, 0, 12],
      [3, 9, 12],
      [1, 1, 40],
      [0, 40, 40],
    ];
    for (const [v, e, n] of casos) {
      const intervalo = intervaloWilson(v, e, n);
      const puntuacion = (v + e / 2) / n;
      expect(intervalo.inferior).toBeLessThanOrEqual(puntuacion + 1e-9);
      expect(intervalo.superior).toBeGreaterThanOrEqual(puntuacion - 1e-9);
      expect(intervalo.inferior).toBeGreaterThanOrEqual(0);
      expect(intervalo.superior).toBeLessThanOrEqual(1);
    }
  });

  it('el intervalo se estrecha al crecer la muestra', () => {
    const pequeño = intervaloWilson(10, 0, 20);
    const grande = intervaloWilson(50, 0, 100);
    expect(grande.superior - grande.inferior).toBeLessThan(pequeño.superior - pequeño.inferior);
  });
});

describe('media', () => {
  it('devuelve null con lista vacía (dato ausente)', () => {
    expect(media([])).toBeNull();
  });

  it('calcula la media aritmética', () => {
    expect(media([1, 2, 3, 4])).toBe(2.5);
    expect(media([10])).toBe(10);
  });
});

describe('redondear', () => {
  it('redondea a las cifras indicadas', () => {
    expect(redondear(3.14159265, 2)).toBe(3.14);
    expect(redondear(2.5, 0)).toBe(3);
  });
});
