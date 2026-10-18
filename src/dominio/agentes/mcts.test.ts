import { describe, expect, it } from 'vitest';
import { crearAgenteMCTS } from './mcts';
import { crearRng } from '../motor/rng';
import type { ContextoAgente } from '../motor/tipos';
import { tresEnRaya3 } from '../juegos/tresEnRaya';
import { gomoku7 } from '../juegos/gomoku';
import { cuatroEnRaya7x6 } from '../juegos/cuatroEnRaya7x6';

function contexto(semilla: number, indiceJugada = 0): ContextoAgente {
  return { rng: crearRng(semilla), config: {}, indiceJugada, semilla };
}

describe('agente MCTS (nivel 4)', () => {
  it('ejecuta exactamente el presupuesto de simulaciones configurado', () => {
    for (const simulaciones of [1, 10, 137, 400]) {
      const agente = crearAgenteMCTS({ simulaciones });
      const decision = agente.elegirMovimiento(
        tresEnRaya3,
        tresEnRaya3.crearEstadoInicial(),
        contexto(1),
      );
      expect(decision.estadisticas.simulaciones).toBe(simulaciones);
      // Nodos ≤ simulaciones + 1 (una expansión por iteración como máximo).
      expect(decision.estadisticas.nodos).toBeLessThanOrEqual(simulaciones + 1);
      expect(decision.estadisticas.nodos).toBeGreaterThan(0);
    }
  });

  it('encuentra la victoria inmediata con presupuesto razonable', () => {
    const agente = crearAgenteMCTS({ simulaciones: 400 });
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'victoria-inmediata-p1');
    if (!posicion) throw new Error('falta la posición');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(2));
    expect(tresEnRaya3.formatearMovimiento(decision.movimiento)).toBe('c1');
  });

  it('bloquea la amenaza inmediata del rival con presupuesto razonable', () => {
    const agente = crearAgenteMCTS({ simulaciones: 500 });
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'bloqueo-obligatorio-p2');
    if (!posicion) throw new Error('falta la posición');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(3));
    // Sin bloquear, el rival gana en su siguiente jugada: el rollout lo ve.
    expect(tresEnRaya3.formatearMovimiento(decision.movimiento)).toBe('a1');
  });

  it('es determinista para la misma semilla y estado', () => {
    const agente = crearAgenteMCTS({ simulaciones: 250 });
    const estado = tresEnRaya3.crearEstadoInicial();
    const a = agente.elegirMovimiento(tresEnRaya3, estado, contexto(4242));
    const b = agente.elegirMovimiento(tresEnRaya3, estado, contexto(4242));
    expect(a.movimiento).toEqual(b.movimiento);
    expect(a.estadisticas.nodos).toBe(b.estadisticas.nodos);
  });

  it('nunca elige jugadas ilegales en partidas completas', () => {
    const agente = crearAgenteMCTS({ simulaciones: 60 });
    for (let semilla = 0; semilla < 8; semilla++) {
      let estado = tresEnRaya3.crearEstadoInicial();
      let indice = 0;
      while (!tresEnRaya3.esTerminal(estado)) {
        const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(semilla, indice));
        expect(tresEnRaya3.validarMovimiento(estado, decision.movimiento).valido).toBe(true);
        estado = tresEnRaya3.aplicarMovimiento(estado, decision.movimiento);
        indice++;
      }
    }
  });

  it('funciona sobre gomoku 7×7 y cuatro en raya (genericidad)', () => {
    const agente = crearAgenteMCTS({ simulaciones: 80 });
    const decisionGomoku = agente.elegirMovimiento(
      gomoku7,
      gomoku7.crearEstadoInicial(),
      contexto(5),
    );
    expect(
      gomoku7.validarMovimiento(gomoku7.crearEstadoInicial(), decisionGomoku.movimiento).valido,
    ).toBe(true);
    expect(decisionGomoku.estadisticas.simulaciones).toBe(80);

    const decisionCuatro = agente.elegirMovimiento(
      cuatroEnRaya7x6,
      cuatroEnRaya7x6.crearEstadoInicial(),
      contexto(6),
    );
    expect(
      cuatroEnRaya7x6.validarMovimiento(
        cuatroEnRaya7x6.crearEstadoInicial(),
        decisionCuatro.movimiento,
      ).valido,
    ).toBe(true);
  });

  it('respeta el cap de rollout configurado', () => {
    // Con cap 1, los rollouts caen inmediatamente en la heurística;
    // el comportamiento sigue siendo legal y el presupuesto exacto.
    const agente = crearAgenteMCTS({ simulaciones: 50, limiteRollout: 1 });
    const decision = agente.elegirMovimiento(
      tresEnRaya3,
      tresEnRaya3.crearEstadoInicial(),
      contexto(7),
    );
    expect(decision.estadisticas.simulaciones).toBe(50);
    expect(tresEnRaya3.validarMovimiento(tresEnRaya3.crearEstadoInicial(), decision.movimiento).valido).toBe(true);
  });

  it('registra tiempo medido y profundidad no negativos', () => {
    const agente = crearAgenteMCTS({ simulaciones: 100 });
    const decision = agente.elegirMovimiento(
      tresEnRaya3,
      tresEnRaya3.crearEstadoInicial(),
      contexto(8),
    );
    expect(decision.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
    expect(decision.estadisticas.profundidad).toBeGreaterThanOrEqual(0);
  });

  it('lanza sobre estado terminal', () => {
    const agente = crearAgenteMCTS({ simulaciones: 10 });
    let estado = tresEnRaya3.crearEstadoInicial();
    for (const notacion of ['a1', 'b1', 'a2', 'b2', 'a3']) {
      estado = tresEnRaya3.aplicarMovimiento(estado, tresEnRaya3.analizarMovimiento(notacion)!);
    }
    expect(() => agente.elegirMovimiento(tresEnRaya3, estado, contexto(9))).toThrow();
  });
});
