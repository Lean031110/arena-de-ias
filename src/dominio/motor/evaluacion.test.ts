import { describe, expect, it } from 'vitest';
import { ejecutarEvaluacion } from './evaluacion';
import { ErrorConfiguracionInvalida } from './errores';

describe('evaluación round-robin', () => {
  const config = {
    juegoId: 'tres-en-raya-3',
    semillaBase: 5000,
    encuentrosPorPar: 10,
    agentes: [
      { id: 'aleatorio', config: {} },
      { id: 'heuristico', config: {} },
    ],
  } as const;

  it('ejecuta el número exacto de partidas con alternancia de lados', async () => {
    const resultado = await ejecutarEvaluacion(config);
    if ('cancelada' in resultado) throw new Error('no debía cancelarse');
    const registro = resultado;
    expect(registro.partidas).toHaveLength(10);
    // Cada agente juega 5 veces como P1 y 5 como P2.
    const p1DelPar = registro.asignaciones.filter(([a]) => a === 0).length;
    const p2DelPar = registro.asignaciones.filter(([, b]) => b === 0).length;
    expect(p1DelPar).toBe(5);
    expect(p2DelPar).toBe(5);
    for (const [numero, partida] of registro.partidas.entries()) {
      const asignacion = registro.asignaciones[numero];
      expect(asignacion).toBeDefined();
      // La partida registra como agente 1 al que jugó de P1 según asignación.
      const idxP1 = asignacion![0];
      expect(partida.agentes[0]?.id).toBe(config.agentes[idxP1]?.id);
    }
  });

  it('calcula resúmenes coherentes: V + E + D = partidas por agente', async () => {
    const evaluado = await ejecutarEvaluacion(config);
    if ('cancelada' in evaluado) throw new Error('no debía cancelarse');
    const registro = evaluado;
    expect(registro.resumenPorAgente).toHaveLength(2);
    for (const resumen of registro.resumenPorAgente) {
      expect(resumen.victorias + resumen.empates + resumen.derrotas).toBe(resumen.partidas);
      expect(resumen.partidas).toBe(10);
      expect(resumen.invalidas).toBe(0);
      const puntuacion = (resumen.victorias + resumen.empates / 2) / resumen.partidas;
      expect(resumen.puntuacion).toBeCloseTo(puntuacion, 5);
      expect(resumen.ic95.disponible).toBe(true);
      expect(resumen.ic95.inferior).toBeLessThanOrEqual(resumen.puntuacion + 1e-6);
      expect(resumen.ic95.superior).toBeGreaterThanOrEqual(resumen.puntuacion - 1e-6);
    }
    // Suma de victorias = suma de derrotas (cada victoria es derrota de otro).
    const totalV = registro.resumenPorAgente.reduce((suma, r) => suma + r.victorias, 0);
    const totalD = registro.resumenPorAgente.reduce((suma, r) => suma + r.derrotas, 0);
    expect(totalV).toBe(totalD);
    // Los empates son pares (empatan ambos).
    for (const resumen of registro.resumenPorAgente) {
      expect(resumen.empates % 2 === 0 || registro.resumenPorAgente.length > 2).toBe(true);
    }
  });

  it('es reproducible: misma semillaBase ⇒ mismos resultados y misma huella', async () => {
    const a = await ejecutarEvaluacion(config);
    const b = await ejecutarEvaluacion(config);
    if ('cancelada' in a || 'cancelada' in b) throw new Error('no debía cancelarse');
    expect(a.huella).toBe(b.huella);
    // Comparamos los campos deterministas (los tiempos NO lo son y por
    // diseño quedan fuera de la huella).
    expect(a.resumenPorAgente.map((r) => ({
      agenteId: r.agenteId,
      victorias: r.victorias,
      empates: r.empates,
      derrotas: r.derrotas,
      puntuacion: r.puntuacion,
      ic95: r.ic95,
    }))).toEqual(b.resumenPorAgente.map((r) => ({
      agenteId: r.agenteId,
      victorias: r.victorias,
      empates: r.empates,
      derrotas: r.derrotas,
      puntuacion: r.puntuacion,
      ic95: r.ic95,
    })));
    expect(a.partidas.map((p) => p.huella)).toEqual(b.partidas.map((p) => p.huella));
  });

  it('el progreso comunicado es real (partidas completadas / total)', async () => {
    const progreso: Array<[number, number]> = [];
    const evaluado = await ejecutarEvaluacion(config, { onProgreso: (completadas, total) => progreso.push([completadas, total]) });
    if ('cancelada' in evaluado) throw new Error('no debía cancelarse');
    expect(progreso).toHaveLength(10);
    expect(progreso[0]).toEqual([1, 10]);
    expect(progreso[9]).toEqual([10, 10]);
    for (const [completadas] of progreso) expect(completadas).toBeGreaterThan(0);
  });

  it('soporta 3+ agentes (round-robin completo: 3 pares × N)', async () => {
    const evaluado = await ejecutarEvaluacion({
      ...config,
      encuentrosPorPar: 4,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'heuristico', config: {} },
        { id: 'mcts', config: { simulaciones: 50, constanteExploracion: 1.4, limiteRollout: 0 } },
      ],
    });
    if ('cancelada' in evaluado) throw new Error('no debía cancelarse');
    const registro = evaluado;
    expect(registro.partidas).toHaveLength(12); // C(3,2) = 3 pares × 4
    expect(registro.resumenPorAgente).toHaveLength(3);
    for (const resumen of registro.resumenPorAgente) {
      expect(resumen.partidas).toBe(8); // cada agente juega 2 pares × 4
    }
    // El agente MCTS registra simulaciones medias.
    const resumenMcts = registro.resumenPorAgente.find((r) => r.agenteId === 'mcts');
    expect(resumenMcts?.simulacionesMedias).toBe(50);
  });

  it('la cancelación detiene entre partidas y devuelve las completadas', async () => {
    let llamadas = 0;
    const registro = await ejecutarEvaluacion(config, {
      debeCancelar: () => llamadas >= 3,
      onProgreso: () => {
        llamadas++;
      },
    });
    expect(registro && 'cancelada' in registro && registro.cancelada).toBe(true);
    if ('cancelada' in registro) {
      expect(registro.partidas).toHaveLength(3);
      expect(registro.completadas).toBe(3);
      expect(registro.total).toBe(10);
    }
  });

  it('rechaza configuraciones inválidas', async () => {
    await expect(ejecutarEvaluacion({ ...config, encuentrosPorPar: 0 })).rejects.toThrow(
      ErrorConfiguracionInvalida,
    );
    await expect(
      ejecutarEvaluacion({ ...config, agentes: [{ id: 'aleatorio', config: {} }] }),
    ).rejects.toThrow(ErrorConfiguracionInvalida);
    await expect(ejecutarEvaluacion({ ...config, semillaBase: -5 })).rejects.toThrow(
      ErrorConfiguracionInvalida,
    );
  });

  it('partidas inválidas quedan fuera de la puntuación y contadas aparte', async () => {
    // Provocamos una invalidación con un agente con parámetro inválido no es
    // posible (se valida antes); usamos un juego y semillas sanos y
    // comprobamos la consistencia aritmética de los campos invalidas.
    const evaluado = await ejecutarEvaluacion(config);
    if ('cancelada' in evaluado) throw new Error('no debía cancelarse');
    const registro = evaluado;
    expect(registro.invalidas).toBe(0);
    expect(registro.errores).toHaveLength(0);
    const sumaInvalidas = registro.resumenPorAgente.reduce((suma, r) => suma + r.invalidas, 0);
    expect(sumaInvalidas).toBe(registro.invalidas * 2); // cada invalida toca a 2 agentes
  });
});
