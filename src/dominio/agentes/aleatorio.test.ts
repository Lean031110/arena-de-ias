import { describe, expect, it } from 'vitest';
import { agenteAleatorio } from './aleatorio';
import { crearRng } from '../motor/rng';
import type { ContextoAgente } from '../motor/tipos';
import { tresEnRaya3 } from '../juegos/tresEnRaya';
import { cuatroEnRaya7x6 } from '../juegos/cuatroEnRaya7x6';

function contexto(semilla: number, indiceJugada = 0): ContextoAgente {
  return { rng: crearRng(semilla), config: {}, indiceJugada, semilla };
}

describe('agente aleatorio (nivel 1)', () => {
  it('elige siempre jugadas legales', () => {
    for (let semilla = 0; semilla < 200; semilla++) {
      let estado = tresEnRaya3.crearEstadoInicial();
      let indice = 0;
      while (!tresEnRaya3.esTerminal(estado)) {
        const decision = agenteAleatorio.elegirMovimiento(tresEnRaya3, estado, contexto(semilla, indice));
        expect(tresEnRaya3.validarMovimiento(estado, decision.movimiento).valido).toBe(true);
        estado = tresEnRaya3.aplicarMovimiento(estado, decision.movimiento);
        indice++;
      }
    }
  });

  it('es determinista por semilla y estado', () => {
    const estado = tresEnRaya3.crearEstadoInicial();
    const a = agenteAleatorio.elegirMovimiento(tresEnRaya3, estado, contexto(555));
    const b = agenteAleatorio.elegirMovimiento(tresEnRaya3, estado, contexto(555));
    expect(a.movimiento).toEqual(b.movimiento);

    // La partida completa con la misma semilla reproduce la misma secuencia.
    const jugar = (semilla: number): string[] => {
      let est = tresEnRaya3.crearEstadoInicial();
      let i = 0;
      const notaciones: string[] = [];
      while (!tresEnRaya3.esTerminal(est)) {
        const decision = agenteAleatorio.elegirMovimiento(tresEnRaya3, est, contexto(semilla, i));
        notaciones.push(tresEnRaya3.formatearMovimiento(decision.movimiento));
        est = tresEnRaya3.aplicarMovimiento(est, decision.movimiento);
        i++;
      }
      return notaciones;
    };
    expect(jugar(777)).toEqual(jugar(777));

    // Variedad: con 100 semillas distintas aparecen varias primeras jugadas.
    const primeras = new Set<number>();
    for (let semilla = 0; semilla < 100; semilla++) {
      const decision = agenteAleatorio.elegirMovimiento(tresEnRaya3, estado, contexto(semilla));
      primeras.add(decision.movimiento.fila * 3 + decision.movimiento.columna);
    }
    expect(primeras.size).toBeGreaterThan(1);
  });

  it('registra tiempo medido no negativo', () => {
    const decision = agenteAleatorio.elegirMovimiento(
      tresEnRaya3,
      tresEnRaya3.crearEstadoInicial(),
      contexto(1),
    );
    expect(decision.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
  });

  it('funciona igual en cuatro en raya (genericidad)', () => {
    const estado = cuatroEnRaya7x6.crearEstadoInicial();
    const decision = agenteAleatorio.elegirMovimiento(cuatroEnRaya7x6, estado, contexto(9));
    expect(decision.movimiento).toHaveProperty('columna');
    expect(cuatroEnRaya7x6.validarMovimiento(estado, decision.movimiento).valido).toBe(true);
  });

  it('lanza sobre estado terminal sin jugadas legales', () => {
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-empate');
    if (!posicion) throw new Error('falta la posición de empate');
    const estado = tresEnRaya3.decodificar(posicion.estadoCodificado);
    expect(tresEnRaya3.movimientosLegales(estado)).toHaveLength(0);
    expect(() => agenteAleatorio.elegirMovimiento(tresEnRaya3, estado, contexto(2))).toThrow();
  });
});
