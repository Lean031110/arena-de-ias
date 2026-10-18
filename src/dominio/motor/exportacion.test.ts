import { describe, expect, it } from 'vitest';
import { aCSVPartidas, aCSVEvaluacion, aJSON, escaparCSV } from './exportacion';
import { ejecutarEvaluacion } from './evaluacion';
import { ejecutarPartida } from './partida';

describe('exportación CSV/JSON', () => {
  it('escapa valores según RFC 4180', () => {
    expect(escaparCSV('simple')).toBe('simple');
    expect(escaparCSV('con, coma')).toBe('"con, coma"');
    expect(escaparCSV('con "comillas"')).toBe('"con ""comillas"""');
    expect(escaparCSV('línea\nnueva')).toBe('"línea\nnueva"');
    expect(escaparCSV(123)).toBe('123');
    expect(escaparCSV(null)).toBe('');
    expect(escaparCSV(undefined)).toBe('');
  });

  it('CSV de partidas: BOM, cabecera completa y filas coherentes', async () => {
    const partida = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 8,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    const csv = aCSVPartidas([partida]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lineas = csv
      .replace(/^\uFEFF/, '')
      .split('\r\n')
      .filter((linea) => linea.length > 0);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe(
      'id,fecha,juego,reglas_version,semilla,agente1_id,agente1_version,agente2_id,agente2_version,resultado,jugadas,duracion_ms,validez,huella',
    );
    expect(lineas[1]).toContain('tres-en-raya-3');
    expect(lineas[1]).toContain('aleatorio');
    expect(lineas[1]).toContain(partida.huella);
    expect(lineas[1]).toContain(String(partida.movimientos.length));
  });

  it('CSV de evaluación: una fila por agente con IC', async () => {
    const registro = await ejecutarEvaluacion({
      juegoId: 'tres-en-raya-3',
      semillaBase: 400,
      encuentrosPorPar: 4,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'heuristico', config: {} },
      ],
    });
    if ('cancelada' in registro) throw new Error('no debía cancelarse');
    const csv = aCSVEvaluacion(registro);
    const lineas = csv.split('\r\n').filter((linea) => linea.length > 0);
    expect(lineas).toHaveLength(3); // cabecera + 2 agentes
    expect(lineas[0]).toContain('puntuacion');
    expect(lineas[0]).toContain('ic95_inferior');
    expect(lineas[1]).toContain('aleatorio');
    expect(lineas[2]).toContain('heuristico');
  });

  it('JSON conserva el registro completo y re-parseable', async () => {
    const partida = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 9,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    const texto = aJSON(partida);
    const reparseado = JSON.parse(texto) as typeof partida;
    expect(reparseado.huella).toBe(partida.huella);
    expect(reparseado.movimientos).toEqual(partida.movimientos);
    expect(reparseado.resultado).toEqual(partida.resultado);
  });
});
