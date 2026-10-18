import { describe, expect, it } from 'vitest';
import { ejecutarPartida, reproducirRegistro, semillaParaJugada } from './partida';
import type { Decisor } from './partida';
import { ErrorConfiguracionInvalida } from './errores';

const configBase = {
  juegoId: 'tres-en-raya-3',
  semilla: 1000,
  agentes: [
    { id: 'aleatorio', config: {} },
    { id: 'aleatorio', config: {} },
  ],
} as const;

describe('ejecutor de partidas', () => {
  it('ejecuta una partida completa con registro íntegro y verificada', async () => {
    const registro = await ejecutarPartida({ ...configBase, semilla: 42 });
    expect(registro.validez).toBe('verificada');
    expect(registro.errores).toHaveLength(0);
    expect(registro.resultado).not.toBeNull();
    expect(registro.juego.id).toBe('tres-en-raya-3');
    expect(registro.juego.reglasVersion).toBe('1');
    expect(registro.movimientos.length).toBeGreaterThanOrEqual(5);
    expect(registro.movimientos.length).toBeLessThanOrEqual(9);
    expect(registro.semilla).toBe(42);
    expect(registro.fecha).toBeTruthy();
    expect(registro.entorno.plataforma).toBe('node');
    expect(registro.huella).toMatch(/^[0-9a-f]{8}$/);
    for (const movimiento of registro.movimientos) {
      expect(movimiento.notacion).toMatch(/^[a-c][1-3]$/);
      expect(movimiento.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
    }
    // El turno de los movimientos es estrictamente alternado desde P1.
    registro.movimientos.forEach((movimiento, indice) => {
      expect(movimiento.jugador).toBe(indice % 2 === 0 ? 1 : 2);
      expect(movimiento.indice).toBe(indice);
    });
    // Resúmenes por agente coherentes con los movimientos.
    const jugadasP1 = registro.movimientos.filter((m) => m.jugador === 1).length;
    expect(registro.resumenAgentes[0]?.jugadas).toBe(jugadasP1);
  });

  it('es reproducible: misma semilla ⇒ misma secuencia, resultado y huella', async () => {
    const a = await ejecutarPartida({ ...configBase, semilla: 777 });
    const b = await ejecutarPartida({ ...configBase, semilla: 777 });
    expect(a.movimientos.map((m) => m.notacion)).toEqual(b.movimientos.map((m) => m.notacion));
    expect(a.resultado).toEqual(b.resultado);
    expect(a.huella).toBe(b.huella);
    // Semillas distintas producen (casi con certeza) otra secuencia.
    const c = await ejecutarPartida({ ...configBase, semilla: 778 });
    expect(
      c.huella !== a.huella ||
        c.movimientos.map((m) => m.notacion).join('') !==
          a.movimientos.map((m) => m.notacion).join(''),
    ).toBe(true);
  });

  it('los tiempos y fechas no forman parte de la huella (solo el núcleo determinista)', async () => {
    const a = await ejecutarPartida({ ...configBase, semilla: 555 });
    const b = await ejecutarPartida({ ...configBase, semilla: 555 });
    expect(a.huella).toBe(b.huella);
    expect(a.duracionMs).not.toBe(b.duracionMs); // casi seguro distintos
  });

  it('registra y marca inválida una partida cuyo agente devuelve jugada ilegal', async () => {
    const decisorMalo: Decisor = ({ jugador }) => {
      if (jugador === 1) {
        // Jugada ilegal en la segunda jugada de P1. El cast `as never`
        // adapta el tipo concreto al genérico M del contrato Decisor.
        return {
          movimiento: { fila: 0, columna: 0 } as never,
          estadisticas: { tiempoMs: 0 },
        };
      }
      return {
        movimiento: { fila: 1, columna: 1 } as never,
        estadisticas: { tiempoMs: 0 },
      };
    };
    // P1 juega (0,0) dos veces: la segunda es ilegal.
    const registro = await ejecutarPartida({ ...configBase, semilla: 10 }, decisorMalo);
    expect(registro.validez).toBe('invalida');
    expect(registro.resultado).toBeNull();
    expect(registro.errores.length).toBeGreaterThan(0);
    expect(registro.errores[0]).toContain('ilegal');
  });

  it('registra el fallo de un agente que lanza una excepción', async () => {
    const decisorExplosivo: Decisor = ({ jugador }) => {
      if (jugador === 2) throw new Error('fallo simulado del agente');
      return { movimiento: { fila: 0, columna: 0 } as never, estadisticas: { tiempoMs: 0 } };
    };
    const registro = await ejecutarPartida({ ...configBase, semilla: 11 }, decisorExplosivo);
    expect(registro.validez).toBe('invalida');
    expect(registro.errores.join(' ')).toContain('fallo simulado');
  });

  it('no se puede continuar una partida terminada: la jugada extra invalida el registro', async () => {
    // Partida normal que termina en victoria; secuencia adulterada +1 jugada.
    const registro = await ejecutarPartida({
      ...configBase,
      semilla: 3,
      agentes: [
        { id: 'heuristico', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    expect(registro.validez).toBe('verificada');
    // Adulteración: el replay con jugada extra debe fallar al reproducir.
    const adulterado = {
      ...registro,
      movimientos: [...registro.movimientos, { ...registro.movimientos[0]!, indice: 99 }],
    };
    const replay = reproducirRegistro(adulterado);
    expect(replay.coincide).toBe(false);
  });

  it('reproducirRegistro confirma los registros válidos', async () => {
    const registro = await ejecutarPartida({ ...configBase, semilla: 21 });
    const replay = reproducirRegistro(registro);
    expect(replay.coincide).toBe(true);
    expect(replay.motivos).toHaveLength(0);
  });

  it('rechaza configuraciones inválidas con errores claros', async () => {
    await expect(ejecutarPartida({ ...configBase, semilla: -1 })).rejects.toThrow(
      ErrorConfiguracionInvalida,
    );
    await expect(
      ejecutarPartida({ ...configBase, semilla: 1.5 }),
    ).rejects.toThrow(ErrorConfiguracionInvalida);
    await expect(
      ejecutarPartida({ ...configBase, juegoId: 'inexistente' }),
    ).rejects.toThrow();
    await expect(
      ejecutarPartida({
        ...configBase,
        agentes: [
          { id: 'aleatorio', config: {} },
          { id: 'mcts', config: { simulaciones: 999999999 } },
        ],
      }),
    ).rejects.toThrow(ErrorConfiguracionInvalida);
  });

  it('la derivación de semillas por jugada es estable y distinta por agente', () => {
    const a = semillaParaJugada(100, 0, 1, 'aleatorio');
    expect(semillaParaJugada(100, 0, 1, 'aleatorio')).toBe(a);
    expect(semillaParaJugada(100, 1, 1, 'aleatorio')).not.toBe(a);
    expect(semillaParaJugada(100, 0, 2, 'aleatorio')).not.toBe(a);
    expect(semillaParaJugada(100, 0, 1, 'minimax')).not.toBe(a);
  });

  it('con heurístico contra aleatorio el registro conserva estadísticas de búsqueda', async () => {
    const registro = await ejecutarPartida({
      ...configBase,
      semilla: 33,
      agentes: [
        { id: 'minimax', config: { profundidad: 3, nodoLimite: 20000, tiempoLimiteMs: 3000 } },
        { id: 'aleatorio', config: {} },
      ],
    });
    expect(registro.validez).toBe('verificada');
    const resumenMinimax = registro.resumenAgentes[0];
    expect(resumenMinimax?.nodosTotales).toBeGreaterThan(0);
    expect(resumenMinimax?.profundidadMaxima).toBeLessThanOrEqual(3);
    expect(resumenMinimax?.tiempoTotalMs).toBeGreaterThanOrEqual(0);
    expect(registro.resumenAgentes[1]?.nodosTotales).toBeUndefined();
    // Las estadísticas por jugada del minimax llevan nodos.
    const jugadaMinimax = registro.movimientos.find((m) => m.jugador === 1);
    expect(jugadaMinimax?.estadisticas.nodos).toBeGreaterThan(0);
  });
});
