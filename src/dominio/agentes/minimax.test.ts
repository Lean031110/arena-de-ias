import { describe, expect, it } from 'vitest';
import { crearAgenteMinimax } from './minimax';
import { agenteAleatorio } from './aleatorio';
import { crearRng } from '../motor/rng';
import type { ContextoAgente } from '../motor/tipos';
import { tresEnRaya3 } from '../juegos/tresEnRaya';
import { gomoku7 } from '../juegos/gomoku';
import { cuatroEnRaya7x6 } from '../juegos/cuatroEnRaya7x6';

function contexto(semilla: number, indiceJugada = 0): ContextoAgente {
  return { rng: crearRng(semilla), config: {}, indiceJugada, semilla };
}

describe('agente minimax α-β (nivel 3)', () => {
  it('encuentra la victoria inmediata con profundidad 1', () => {
    const agente = crearAgenteMinimax({ profundidad: 1, nodoLimite: 10000 });
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'victoria-inmediata-p1');
    if (!posicion) throw new Error('falta la posición');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(1));
    expect(tresEnRaya3.formatearMovimiento(decision.movimiento)).toBe('c1');
    expect(decision.estadisticas.nodos).toBeGreaterThan(0);
    expect(decision.estadisticas.profundidad).toBeLessThanOrEqual(1);
  });

  it('bloquea la amenaza con profundidad 2 (ve la respuesta del rival)', () => {
    const agente = crearAgenteMinimax({ profundidad: 2, nodoLimite: 20000 });
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'bloqueo-obligatorio-p2');
    if (!posicion) throw new Error('falta la posición');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    const decision = agente.elegirMovimiento(tresEnRaya3, estado, contexto(2));
    expect(tresEnRaya3.formatearMovimiento(decision.movimiento)).toBe('a1');
  });

  it('respeta el presupuesto estricto de nodos', () => {
    const nodoLimite = 500;
    const agente = crearAgenteMinimax({ profundidad: 6, nodoLimite });
    const decision = agente.elegirMovimiento(
      tresEnRaya3,
      tresEnRaya3.crearEstadoInicial(),
      contexto(3),
    );
    expect(decision.estadisticas.nodos).toBeLessThanOrEqual(nodoLimite + 9);
    expect(decision.estadisticas.presupuestoAgotado).toBe(true);
  });

  it('respeta la profundidad máxima configurada', () => {
    const agente = crearAgenteMinimax({ profundidad: 2, nodoLimite: 500000 });
    const decision = agente.elegirMovimiento(
      tresEnRaya3,
      tresEnRaya3.crearEstadoInicial(),
      contexto(4),
    );
    expect(decision.estadisticas.profundidad).toBeLessThanOrEqual(2);
    expect(decision.estadisticas.presupuestoAgotado).toBe(false);
  });

  it('es determinista para la misma semilla y estado', () => {
    const agente = crearAgenteMinimax({ profundidad: 3, nodoLimite: 100000 });
    const estado = tresEnRaya3.crearEstadoInicial();
    const a = agente.elegirMovimiento(tresEnRaya3, estado, contexto(77));
    const b = agente.elegirMovimiento(tresEnRaya3, estado, contexto(77));
    expect(a.movimiento).toEqual(b.movimiento);
    expect(a.estadisticas.nodos).toBe(b.estadisticas.nodos);
  });

  it('con profundidad completa en 3×3 nunca pierde contra el aleatorio', () => {
    // profundidad 9 = árbol completo del tres en raya.
    const agente = crearAgenteMinimax({ profundidad: 9, nodoLimite: 500000 });
    const aleatorio = agenteAleatorio;
    let derrotas = 0;
    let empates = 0;
    let victorias = 0;
    for (let semilla = 0; semilla < 30; semilla++) {
      let estado = tresEnRaya3.crearEstadoInicial();
      let indice = 0;
      while (!tresEnRaya3.esTerminal(estado)) {
        const jugador = tresEnRaya3.jugadorActual(estado);
        // minimax juega como P1 con semillas pares, como P2 con impares.
        const esMinimax = jugador === (semilla % 2 === 0 ? 1 : 2);
        const decision = esMinimax
          ? agente.elegirMovimiento(tresEnRaya3, estado, contexto(semilla, indice))
          : aleatorio.elegirMovimiento(tresEnRaya3, estado, contexto(semilla + 1000, indice));
        estado = tresEnRaya3.aplicarMovimiento(estado, decision.movimiento);
        indice++;
      }
      const resultado = tresEnRaya3.resultado(estado);
      const bandoMinimax = semilla % 2 === 0 ? 1 : 2;
      if (resultado?.tipo === 'victoria') {
        if (resultado.ganador === bandoMinimax) victorias++;
        else derrotas++;
      } else {
        empates++;
      }
    }
    expect(derrotas).toBe(0);
    expect(victorias + empates + derrotas).toBe(30);
  });

  it('funciona sobre gomoku y cuatro en raya (genericidad) con presupuesto', () => {
    const agente = crearAgenteMinimax({ profundidad: 2, nodoLimite: 800 });
    const decisionGomoku = agente.elegirMovimiento(
      gomoku7,
      gomoku7.crearEstadoInicial(),
      contexto(5),
    );
    expect(gomoku7.validarMovimiento(gomoku7.crearEstadoInicial(), decisionGomoku.movimiento).valido).toBe(true);
    const decisionCuatro = agente.elegirMovimiento(
      cuatroEnRaya7x6,
      cuatroEnRaya7x6.crearEstadoInicial(),
      contexto(6),
    );
    expect(
      cuatroEnRaya7x6.validarMovimiento(cuatroEnRaya7x6.crearEstadoInicial(), decisionCuatro.movimiento).valido,
    ).toBe(true);
    // Con nodoLimite pequeño el presupuesto se agota y se registra.
    expect(decisionGomoku.estadisticas.presupuestoAgotado).toBe(true);
  });

  it('registra tiempo medido no negativo', () => {
    const agente = crearAgenteMinimax({ profundidad: 2 });
    const decision = agente.elegirMovimiento(tresEnRaya3, tresEnRaya3.crearEstadoInicial(), contexto(8));
    expect(decision.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
  });
});
