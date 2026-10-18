/**
 * Pruebas del agente neuronal (nivel 5): inferencia real en partidas del
 * motor, presupuestos exactos, compatibilidad dura juego⇄cerebro e
 * integración con el registro de agentes (claves «neural:…»).
 *
 * Los pesos son aleatorios con semilla: prueban la MECÁNICA (inferencia +
 * PUCT + integración), no la fuerza del modelo. La fuerza solo se declara
 * con evaluaciones reales (Tarea E).
 */

import { describe, expect, it } from 'vitest';
import { tresEnRaya3 } from '../juegos/tresEnRaya';
import { gomoku7 } from '../juegos/gomoku';
import { escribirTensores, leerTensores, type TensorLeido } from '../lba/safetensors';
import { tablaArquitectura } from '../neural/red';
import { observarTablero } from '../neural/observacion';
import { crearRng } from '../motor/rng';
import { ejecutarPartida, type Decisor } from '../motor/partida';
import {
  crearAgente,
  registrarCerebroCargado,
  desregistrarCerebroCargado,
  cerebrosCargados,
} from './registro';
import { cargarCerebro, crearAgenteNeural, validarConfigNeural } from './neural';

const ARQ = {
  tipo: 'conv-politica-valor-v1' as const,
  entrada: { alto: 3, ancho: 3, canales: 2 as const },
  acciones: 9,
};

function pesosSembrados(semilla: number): Map<string, TensorLeido> {
  const rng = crearRng(semilla);
  const bytes = escribirTensores(
    [...tablaArquitectura(ARQ).entries()].map(([nombre, forma]) => ({
      nombre,
      forma,
      datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente() * 2 - 1),
    })),
  );
  return leerTensores(bytes);
}

describe('observación de tablero', () => {
  it('codifica propias y rivales desde la perspectiva del turno', () => {
    // X (jugador 1) movió a centro; ahora juega O (2).
    const estado = tresEnRaya3.aplicarMovimiento(tresEnRaya3.crearEstadoInicial(), { fila: 1, columna: 1 });
    const planos = observarTablero(estado, 3, 3);
    expect(planos).toHaveLength(18);
    // Turno = 2 (O): canal 0 (O) vacío, canal 1 (X) tiene el centro.
    expect(planos[4]).toBe(0);
    expect(planos[9 + 4]).toBe(1);
  });
});

describe('agente neuronal', () => {
  it('juega una partida completa con movimientos legales y estadísticas', async () => {
    const cerebro = cargarCerebro('red-t', '1.0.0', 'tres-en-raya-3', ARQ, pesosSembrados(42));
    const agente = crearAgenteNeural(cerebro, { simulaciones: 30 });
    const decisor: Decisor = (parametros) =>
      agente.elegirMovimiento(parametros.juego, parametros.estado, parametros.contexto);
    const registro = await ejecutarPartida(
      {
        juegoId: 'tres-en-raya-3',
        semilla: 1234,
        agentes: [
          { id: 'aleatorio', config: {} },
          { id: 'aleatorio', config: {} },
        ],
      },
      decisor,
    );
    expect(registro.movimientos.length).toBeGreaterThan(0);
    expect(registro.validez).toBe('verificada');
  });

  it('el decisor automático del motor resuelve claves «neural:…» registradas', async () => {
    const cerebro = cargarCerebro('red-t', '2.0.0', 'tres-en-raya-3', ARQ, pesosSembrados(43));
    const clave = registrarCerebroCargado(cerebro);
    expect(clave).toBe('neural:red-t@2.0.0');
    expect(cerebrosCargados()).toHaveLength(1);
    // La partida se ejecuta SOLO con ids y configs: el registro resuelve.
    const registro = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 4321,
      agentes: [
        { id: clave, config: { simulaciones: 25 } },
        { id: 'aleatorio', config: {} },
      ],
    });
    expect(registro.validez).toBe('verificada');
    // crearAgente directo también funciona con la clave.
    const agente = crearAgente(clave, { simulaciones: 10 });
    expect(agente).toBeDefined();
    desregistrarCerebroCargado(clave);
    expect(cerebrosCargados()).toHaveLength(0);
  });

  it('rechaza usar el cerebro en un juego incompatible (regla dura §8)', () => {
    const cerebro = cargarCerebro('red-t', '3.0.0', 'tres-en-raya-3', ARQ, pesosSembrados(44));
    const agente = crearAgenteNeural(cerebro, { simulaciones: 10 });
    const estado = gomoku7.crearEstadoInicial();
    expect(() =>
      agente.elegirMovimiento(gomoku7, estado, {
        rng: crearRng(1),
        config: {},
        indiceJugada: 0,
        semilla: 1,
      }),
    ).toThrow(/incompatible/);
  });

  it('valida su configuración (rangos y claves desconocidas)', () => {
    expect(validarConfigNeural({ simulaciones: 20, cPuct: 1.5, temperatura: 0 })).toEqual([]);
    expect(validarConfigNeural({ simulaciones: 0 })).toHaveLength(1);
    expect(validarConfigNeural({ cPuct: -1 })).toHaveLength(1);
    expect(validarConfigNeural({ chorrocientifico: 1 })).toHaveLength(1);
  });

  it('la inferencia es determinista: mismas entradas, mismas salidas', () => {
    const pesosA = pesosSembrados(45);
    const pesosB = pesosSembrados(45);
    const estado = tresEnRaya3.crearEstadoInicial();
    const cerebroA = cargarCerebro('a', '1', 'tres-en-raya-3', ARQ, pesosA);
    const cerebroB = cargarCerebro('b', '1', 'tres-en-raya-3', ARQ, pesosB);
    const salidaA = crearAgenteNeural(cerebroA, { simulaciones: 5 }).elegirMovimiento(
      tresEnRaya3,
      estado,
      { rng: crearRng(7), config: {}, indiceJugada: 0, semilla: 7 },
    );
    const salidaB = crearAgenteNeural(cerebroB, { simulaciones: 5 }).elegirMovimiento(
      tresEnRaya3,
      estado,
      { rng: crearRng(7), config: {}, indiceJugada: 0, semilla: 7 },
    );
    expect(salidaA.movimiento).toEqual(salidaB.movimiento);
    expect(salidaA.estadisticas.simulaciones).toBe(5);
  });

  it('respeta el presupuesto exacto de simulaciones', () => {
    const cerebro = cargarCerebro('red-t', '4.0.0', 'tres-en-raya-3', ARQ, pesosSembrados(46));
    const agente = crearAgenteNeural(cerebro, { simulaciones: 17 });
    const decision = agente.elegirMovimiento(tresEnRaya3, tresEnRaya3.crearEstadoInicial(), {
      rng: crearRng(9),
      config: {},
      indiceJugada: 0,
      semilla: 9,
    });
    expect(decision.estadisticas.simulaciones).toBe(17);
    expect(decision.estadisticas.nodos).toBeGreaterThanOrEqual(10);
    expect(decision.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
  });
});
