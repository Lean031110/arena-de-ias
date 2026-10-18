import { describe, expect, it } from 'vitest';
import { crearAgenteHeuristico } from './heuristico';
import { crearRng } from '../motor/rng';
import type { ContextoAgente } from '../motor/tipos';
import { tresEnRaya3 } from '../juegos/tresEnRaya';
import { gomoku7 } from '../juegos/gomoku';
import { cuatroEnRaya7x6 } from '../juegos/cuatroEnRaya7x6';

function contexto(semilla: number, indiceJugada = 0): ContextoAgente {
  return { rng: crearRng(semilla), config: {}, indiceJugada, semilla };
}

describe('agente heurístico (nivel 2)', () => {
  const agente = crearAgenteHeuristico();

  it('gana cuando existe victoria inmediata (tres en raya)', () => {
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'victoria-inmediata-p1');
    if (!posicion) throw new Error('falta la posición');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(1));
    expect(tresEnRaya3.formatearMovimiento(decision.movimiento)).toBe('c1');
  });

  it('bloquea la amenaza inmediata del rival (tres en raya)', () => {
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'bloqueo-obligatorio-p2');
    if (!posicion) throw new Error('falta la posición');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(2));
    expect(tresEnRaya3.formatearMovimiento(decision.movimiento)).toBe('a1');
  });

  it('gana con victoria inmediata en gomoku (única jugada ganadora)', () => {
    const posicion = gomoku7
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'victoria-inmediata');
    if (!posicion) throw new Error('falta la posición');
    const estado = gomoku7.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(gomoku7, estado, contexto(3));
    expect(gomoku7.formatearMovimiento(decision.movimiento)).toBe('g4');
  });

  it('bloquea la columna amenazada en cuatro en raya', () => {
    const posicion = cuatroEnRaya7x6
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'bloqueo-obligatorio-p1');
    if (!posicion) throw new Error('falta la posición');
    const estado = cuatroEnRaya7x6.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(cuatroEnRaya7x6, estado, contexto(4));
    expect(cuatroEnRaya7x6.formatearMovimiento(decision.movimiento)).toBe('c');
  });

  it('prioriza ganar antes que bloquear cuando ambas opciones existen', () => {
    // P1 tiene a1-a3 (gana con a4); P2 tiene b1-b3 (amenaza b4).
    let estado = cuatroEnRaya7x6.crearEstadoInicial();
    for (const columna of [0, 1, 0, 1, 0, 1]) {
      estado = cuatroEnRaya7x6.aplicarMovimiento(estado, { columna });
    }
    // P1 (jugador 1) a punto de mover: columnas a y b tienen 3 fichas.
    const decision = agente.elegirMovimiento(cuatroEnRaya7x6, estado, contexto(5));
    expect(cuatroEnRaya7x6.formatearMovimiento(decision.movimiento)).toBe('a');
  });

  it('es determinista para la misma semilla', () => {
    const posicion = gomoku7
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'victoria-inmediata');
    if (!posicion) throw new Error('falta la posición');
    const estado = gomoku7.decodificar(posicion.estadoCodificado);
    const a = agente.elegirMovimiento(gomoku7, estado, contexto(11));
    const b = agente.elegirMovimiento(gomoku7, estado, contexto(11));
    expect(a.movimiento).toEqual(b.movimiento);
  });

  it('nunca juega movimientos ilegales en partidas completas', () => {
    for (let semilla = 0; semilla < 30; semilla++) {
      let estado = tresEnRaya3.crearEstadoInicial();
      let indice = 0;
      while (!tresEnRaya3.esTerminal(estado)) {
        const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(semilla, indice));
        expect(tresEnRaya3.validarMovimiento(estado, decision.movimiento).valido).toBe(true);
        estado = tresEnRaya3.aplicarMovimiento(estado, decision.movimiento);
        indice++;
      }
      expect(tresEnRaya3.resultado(estado)).not.toBeNull();
    }
  });
});
