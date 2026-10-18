/**
 * Fase 3 — Pruebas del dominio del plantel: incorporación validada (catálogo
 * y cerebro con huella OBLIGATORIA), id determinista, historial de versiones
 * reconstruido por linaje, peso medido derivado de evaluaciones reales y
 * rechazo de resúmenes que no cuadran.
 */

import { describe, expect, it } from 'vitest';
import {
  conEvaluacion,
  crearEntradaCatalogo,
  crearEntradaCerebro,
  erroresEntradaCatalogo,
  erroresEntradaCerebro,
  historialVersiones,
  idDeIdentidad,
  pesoMedido,
  type EntradaPlantel,
  type ResumenEvaluacion,
} from './plantel';

const HUELLA = 'a'.repeat(64);

function entradaCerebro(
  version: string,
  parentModelId: string | null,
  alias = `red-${version}`,
): EntradaPlantel {
  return crearEntradaCerebro(
    alias,
    {
      agentId: 'red-ter-3',
      brainVersion: version,
      gameId: 'tres-en-raya-3',
      huella: HUELLA,
      parentModelId,
      trainingRunId: `run-${version}`,
    },
    'tres-en-raya-3',
    '2026-10-19T00:00:00.000Z',
  );
}

function resumen(puntuacion: number, fecha = '2026-10-19T01:00:00.000Z'): ResumenEvaluacion {
  // Desglose coherente con la puntuación (4 partidas).
  const v = Math.round(puntuacion * 4 - 1);
  const e = 4 - 2 * Math.max(0, Math.round(puntuacion * 4 - 1));
  const d = 4 - Math.max(0, v) - e;
  return {
    fechaISO: fecha,
    rival: 'heuristico',
    partidas: 4,
    victorias: Math.max(0, v),
    empates: Math.max(0, e),
    derrotas: Math.max(0, d),
    puntuacion,
    ic95Inferior: Math.max(0, puntuacion - 0.1),
    ic95Superior: Math.min(1, puntuacion + 0.1),
  };
}

describe('incorporación de catálogo', () => {
  it('crea la entrada con id determinista', () => {
    const entrada = crearEntradaCatalogo(
      'táctico',
      'minimax',
      { profundidad: 4, nodoLimite: 60000, tiempoLimiteMs: 2000 },
      'tres-en-raya-3',
      '2026-10-19T00:00:00.000Z',
    );
    expect(entrada.identidad.tipo).toBe('catalogo');
    expect(entrada.evaluaciones).toEqual([]);
    const otra = crearEntradaCatalogo('otro-alias', 'minimax', {}, 'tres-en-raya-3', 'x');
    // El id depende de la IDENTIDAD, no del alias: mismo agente = mismo id.
    expect(otra.id).toBe(entrada.id);
  });

  it('rechaza agentes inexistentes o no automáticos', () => {
    expect(erroresEntradaCatalogo('x', 'no-existe', 'tres-en-raya-3').join()).toContain('no existe');
    expect(erroresEntradaCatalogo('x', 'humano', 'tres-en-raya-3').join()).toContain('no es automático');
    expect(() => crearEntradaCatalogo('x', 'no-existe', {}, 'tres-en-raya-3', 'x')).toThrow();
  });
});

describe('incorporación de cerebro (sin artefacto no hay entrada)', () => {
  it('exige huella sha256 bien formada', () => {
    const errores = erroresEntradaCerebro(
      'alias',
      { agentId: 'red', brainVersion: '1.0.0', gameId: 'tres-en-raya-3', huella: 'corta' },
      'tres-en-raya-3',
    );
    expect(errores.join()).toContain('huella');
    expect(() =>
      crearEntradaCerebro(
        'alias',
        { agentId: 'red', brainVersion: '1.0.0', gameId: 'tres-en-raya-3', huella: 'corta', parentModelId: null, trainingRunId: null },
        'tres-en-raya-3',
        'x',
      ),
    ).toThrow(/huella/);
  });

  it('rechaza versiones mal formadas y juegos que no coinciden', () => {
    expect(
      erroresEntradaCerebro(
        'a',
        { agentId: 'red', brainVersion: '1.0', gameId: 'tres-en-raya-3', huella: HUELLA },
        'tres-en-raya-3',
      ).join(),
    ).toContain('versión');
    expect(
      erroresEntradaCerebro(
        'a',
        { agentId: 'red', brainVersion: '1.0.0', gameId: 'tres-en-raya-3', huella: HUELLA },
        'gomoku-7',
      ).join(),
    ).toContain('gomoku-7');
  });

  it('crea la entrada con linaje completo', () => {
    const entrada = entradaCerebro('1.0.1', 'red-ter-3@1.0.0');
    expect(entrada.identidad).toMatchObject({
      tipo: 'cerebro',
      agentId: 'red-ter-3',
      brainVersion: '1.0.1',
      parentModelId: 'red-ter-3@1.0.0',
      trainingRunId: 'run-1.0.1',
    });
  });

  it('id determinista distinto por versión y huella', () => {
    const a = entradaCerebro('1.0.0', null);
    const b = entradaCerebro('1.0.1', 'red-ter-3@1.0.0');
    expect(a.id).not.toBe(b.id);
    expect(idDeIdentidad(a.identidad)).toBe(a.id);
  });
});

describe('historial de versiones (linaje reconstruido)', () => {
  it('ordena la cadena de la raíz a la última versión', () => {
    const entradas = [
      entradaCerebro('1.0.1', 'red-ter-3@1.0.0'),
      entradaCerebro('1.0.0', null),
      entradaCerebro('1.1.0', 'red-ter-3@1.0.1'),
    ];
    const { cadena, huerfanas } = historialVersiones(entradas, 'red-ter-3');
    expect(huerfanas).toHaveLength(0);
    expect(cadena.map((e) => (e.identidad as { brainVersion: string }).brainVersion)).toEqual([
      '1.0.0',
      '1.0.1',
      '1.1.0',
    ]);
  });

  it('las entradas con padre ausente quedan como huérfanas', () => {
    const entradas = [entradaCerebro('2.0.0', 'red-ter-3@9.9.9')];
    const { cadena, huerfanas } = historialVersiones(entradas, 'red-ter-3');
    expect(cadena).toHaveLength(1);
    expect(huerfanas).toHaveLength(1);
  });

  it('ignora cerebros de otros agentId', () => {
    const otras = crearEntradaCerebro(
      'otra',
      { agentId: 'red-otra', brainVersion: '1.0.0', gameId: 'tres-en-raya-3', huella: HUELLA, parentModelId: null, trainingRunId: null },
      'tres-en-raya-3',
      'x',
    );
    const { cadena } = historialVersiones([otras], 'red-ter-3');
    expect(cadena).toHaveLength(0);
  });
});

describe('evaluaciones medidas y peso derivado', () => {
  it('sin evaluaciones el peso es 0 (nada inventado)', () => {
    expect(pesoMedido(entradaCerebro('1.0.0', null))).toBe(0);
  });

  it('el peso es la media de las puntuaciones reales', () => {
    let entrada = entradaCerebro('1.0.0', null);
    entrada = conEvaluacion(entrada, resumen(0.5));
    entrada = conEvaluacion(entrada, resumen(0.75));
    expect(pesoMedido(entrada)).toBeCloseTo(0.625, 3);
  });

  it('rechaza resúmenes que no cuadran', () => {
    const entrada = entradaCerebro('1.0.0', null);
    expect(() => conEvaluacion(entrada, { ...resumen(0.5), partidas: 0 })).toThrow();
    expect(() =>
      conEvaluacion(entrada, { ...resumen(0.5), victorias: 99 }),
    ).toThrow(/no cuadra/);
  });

  it('la entrada es inmutable: la evaluación se añade en copia', () => {
    const entrada = entradaCerebro('1.0.0', null);
    const actualizada = conEvaluacion(entrada, resumen(0.5));
    expect(entrada.evaluaciones).toHaveLength(0);
    expect(actualizada.evaluaciones).toHaveLength(1);
  });
});
