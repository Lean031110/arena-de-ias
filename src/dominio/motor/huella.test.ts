import { describe, expect, it } from 'vitest';
import { establecerJSON, huellaFNV, huellaJSON } from './huella';

describe('huella FNV-1a de 32 bits', () => {
  it('coincide con vectores de referencia conocidos', () => {
    // Vectores estándar FNV-1a 32 bits.
    expect(huellaFNV('')).toBe('811c9dc5');
    expect(huellaFNV('a')).toBe('e40c292c');
    expect(huellaFNV('b')).toBe('e70c2de5');
    expect(huellaFNV('foobar')).toBe('bf9cf968');
  });

  it('produce 8 dígitos hexadecimales', () => {
    for (const texto of ['x', 'hola', 'arena-de-ias', 'ñandú']) {
      expect(huellaFNV(texto)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe('establecerJSON (serialización canónica)', () => {
  it('ordena las claves de los objetos recursivamente', () => {
    const a = establecerJSON({ z: 1, a: { y: [2, { b: 1, a: 2 }] } });
    const b = establecerJSON({ a: { y: [2, { a: 2, b: 1 }] }, z: 1 });
    expect(a).toBe(b);
  });

  it('distingue estructuras distintas', () => {
    expect(establecerJSON({ a: 1, b: 2 })).not.toBe(establecerJSON({ a: 2, b: 1 }));
    expect(establecerJSON([1, 2])).not.toBe(establecerJSON([2, 1]));
  });

  it('trata undefined como ausente en objetos y null en arrays', () => {
    expect(establecerJSON({ a: undefined, b: 1 })).toBe(establecerJSON({ b: 1 }));
    expect(establecerJSON([1, undefined])).toBe('[1,null]');
  });
});

describe('huellaJSON', () => {
  it('es estable ante el reordenamiento de claves', () => {
    const a = { semilla: 5, juego: 'x', config: { profundidad: 2, nodoLimite: 100 } };
    const b = { config: { nodoLimite: 100, profundidad: 2 }, juego: 'x', semilla: 5 };
    expect(huellaJSON(a)).toBe(huellaJSON(b));
  });

  it('cambia ante cualquier modificación del núcleo determinista', () => {
    const base = { semilla: 5, movimientos: ['a1', 'b2'], resultado: null };
    expect(huellaJSON(base)).not.toBe(huellaJSON({ ...base, semilla: 6 }));
    expect(huellaJSON(base)).not.toBe(huellaJSON({ ...base, movimientos: ['a1', 'b3'] }));
    expect(huellaJSON(base)).not.toBe(huellaJSON({ ...base, resultado: { tipo: 'empate' } }));
  });
});
