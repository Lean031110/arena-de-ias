import { describe, expect, it } from 'vitest';
import { validarSecuencia } from './validacion';
import { tresEnRaya3 } from '../juegos/tresEnRaya';
import { cuatroEnRaya7x6 } from '../juegos/cuatroEnRaya7x6';

describe('validación de secuencias (replay)', () => {
  it('acepta una secuencia legal completa y calcula el resultado', () => {
    const replay = validarSecuencia(tresEnRaya3, ['a1', 'b1', 'a2', 'b2', 'a3']);
    expect(replay.valido).toBe(true);
    expect(replay.movimientos).toHaveLength(5);
    expect(replay.resultado).toEqual({ tipo: 'victoria', ganador: 1 });
  });

  it('rechaza notaciones no reconocidas', () => {
    const replay = validarSecuencia(tresEnRaya3, ['a1', 'zz9']);
    expect(replay.valido).toBe(false);
    expect(replay.motivos[0]).toContain('no reconocida');
  });

  it('rechaza celdas ocupadas', () => {
    const replay = validarSecuencia(tresEnRaya3, ['a1', 'a1']);
    expect(replay.valido).toBe(false);
    expect(replay.motivos[0]).toContain('ocupada');
  });

  it('rechaza jugadas tras un estado terminal', () => {
    // a1,b1,a2,b2,a3 termina la partida; una sexta jugada sobra.
    const replay = validarSecuencia(tresEnRaya3, ['a1', 'b1', 'a2', 'b2', 'a3', 'c1']);
    expect(replay.valido).toBe(false);
    expect(replay.motivos.join(' ')).toContain('ya estaba terminada');
  });

  it('detecta secuencias truncadas que no llegan a terminal', () => {
    const replay = validarSecuencia(tresEnRaya3, ['a1', 'b1']);
    expect(replay.valido).toBe(true);
    expect(replay.resultado).toBeNull();
  });

  it('valida con gravedad en cuatro en raya', () => {
    const replay = validarSecuencia(cuatroEnRaya7x6, ['a', 'b', 'a', 'c', 'a', 'd', 'a']);
    expect(replay.valido).toBe(true);
    expect(replay.resultado).toEqual({ tipo: 'victoria', ganador: 1 });
  });

  it('rechaza columnas llenas en cuatro en raya', () => {
    // Llenar la columna a (6 jugadas) y una séptima cae fuera.
    const secuencia = ['a', 'a', 'a', 'a', 'a', 'a', 'a'];
    const replay = validarSecuencia(cuatroEnRaya7x6, secuencia);
    expect(replay.valido).toBe(false);
    expect(replay.motivos[0]).toContain('llena');
  });
});
