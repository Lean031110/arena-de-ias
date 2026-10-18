/**
 * Fase 3 — Pruebas del registro del plantel (capa de aplicación, con
 * fake-indexeddb): incorporación de catálogo y de cerebro REAL importado,
 * rechazo de cerebros no importados (sin artefacto no hay entrada),
 * persistencia, retiro con evento, evaluaciones medidas, historial de
 * versiones y derivación de equipos desde el plantel.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAlmacenamiento, type Almacenamiento } from './almacen';
import { RegistroCerebros } from './registroCerebros';
import { RegistroPlantel } from './registroPlantel';
import { exportarPaqueteLBA, type SolicitudExportacionLBA } from '../dominio/lba/exportador';
import { escribirTensores } from '../dominio/lba/safetensors';
import { huellaJSON } from '../dominio/motor/huella';
import { crearRng } from '../dominio/motor/rng';
import { CATALOGO_JUEGOS } from '../dominio/juegos/registro';
import { tablaArquitectura } from '../dominio/neural/red';
import { limpiarEquiposCargados, esEquipoCargado } from '../dominio/equipos/registro';

const ARQ = {
  tipo: 'conv-politica-valor-v1' as const,
  entrada: { alto: 3, ancho: 3, canales: 2 as const },
  acciones: 9,
};

const CONFIG = {
  tipo: 'autojuego-supervisado-v1' as const,
  semilla: 1,
  iteraciones: 1,
  partidasPorIteracion: 4,
  simulacionesMCTS: 16,
  temperatura: 1,
  dirichletAlfa: 0.03,
  dirichletEpsilon: 0.25,
  tamanoLote: 8,
  tasaAprendizaje: 0.001,
  pasosPorIteracion: 4,
  bufferCapacidad: 1000,
  dispositivo: 'cpu',
  versionCodigo: 'prueba',
};

function pesos(semilla: number): Uint8Array {
  const rng = crearRng(semilla);
  return escribirTensores(
    [...tablaArquitectura(ARQ).entries()].map(([nombre, forma]) => ({
      nombre,
      forma,
      datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente() * 2 - 1),
    })),
  );
}

function solicitud(semilla: number, agentId: string, version: string, padre: string | null): SolicitudExportacionLBA {
  const juegoTer = CATALOGO_JUEGOS.find((j) => j.id === 'tres-en-raya-3')!.juego!;
  return {
    manifiesto: {
      formatVersion: 1 as const,
      agentId,
      brainVersion: version,
      parentModelId: padre,
      createdAt: new Date().toISOString(),
      gameId: 'tres-en-raya-3',
      gameRulesVersion: juegoTer.reglasVersion,
      gameRulesHash: huellaJSON({
        id: juegoTer.id,
        reglasVersion: juegoTer.reglasVersion,
        dimensiones: juegoTer.dimensiones,
        familia: juegoTer.familia,
      }),
      observationSchemaVersion: 1,
      actionSpaceVersion: 1,
      architecture: ARQ,
      weightsFormat: 'safetensors' as const,
      runtimeTargets: ['ts-puro' as const],
      trainingRunId: `run-${version}`,
      trainingConfig: CONFIG,
      datasetLineage: {
        origen: 'autojuego' as const,
        partidas: 4,
        ejemplos: 20,
        semilla: 1,
        rival: null,
        buffer: 'FIFO 1000',
      },
      evaluationRunIds: [],
      evaluationSummary: null,
    },
    pesosSafetensors: pesos(semilla),
    configEntrenamiento: CONFIG,
    lineageDatos: { origen: 'autojuego' as const, partidas: 4, ejemplos: 20, semilla: 1, rival: null, buffer: 'FIFO 1000' },
    linaje: {
      formatVersion: 1 as const,
      agentId,
      brainVersion: version,
      parentModelId: padre,
      parentPackageSha256: null,
      motivo: padre === null ? ("entrenamiento-inicial" as const) : ("reentrenamiento" as const),
      notas: 'prueba',
      createdAt: new Date().toISOString(),
    },
    resumenEvaluacion: null,
  };
}

describe('RegistroPlantel', () => {
  let almacen: Almacenamiento;
  let cerebros: RegistroCerebros;
  let plantel: RegistroPlantel;

  beforeEach(async () => {
    almacen = crearAlmacenamiento();
    await almacen.abrir();
    await almacen.borrarTodo();
    cerebros = new RegistroCerebros(almacen);
    plantel = new RegistroPlantel(almacen, cerebros);
    limpiarEquiposCargados();
  });

  afterEach(async () => {
    try {
      await almacen.borrarTodo();
    } catch {
      /* limpieza best-effort */
    }
    limpiarEquiposCargados();
  });

  it('incorpora un agente de catálogo con evento y persistencia', async () => {
    const entrada = await plantel.incorporarCatalogo(
      'táctico',
      'minimax',
      { profundidad: 4, nodoLimite: 60000, tiempoLimiteMs: 2000 },
      'tres-en-raya-3',
    );
    const listado = await plantel.listar();
    expect(listado).toHaveLength(1);
    expect(listado[0]?.alias).toBe('táctico');
    const eventos = await plantel.eventos();
    expect(eventos.some((e) => e.tipo === 'incorporado' && e.entradaId === entrada.id)).toBe(true);
  });

  it('rechaza agentes de catálogo inválidos sin escribir', async () => {
    await expect(
      plantel.incorporarCatalogo('fantasma', 'no-existe', {}, 'tres-en-raya-3'),
    ).rejects.toThrow(/no existe/);
    expect(await plantel.listar()).toHaveLength(0);
  });

  it('incorpora un cerebro REAL importado, con linaje completo', async () => {
    const paquete = await exportarPaqueteLBA(solicitud(11, 'red-ter-3', '1.0.0', null));
    const resultado = await cerebros.importarPaquete(paquete.bytes);
    expect(resultado.resultado).toBe('importado');

    const entrada = await plantel.incorporarCerebro('campeona', 'red-ter-3', '1.0.0', 'tres-en-raya-3');
    expect(entrada.identidad).toMatchObject({
      tipo: 'cerebro',
      agentId: 'red-ter-3',
      brainVersion: '1.0.0',
      huella: paquete.sha256,
      parentModelId: null,
      trainingRunId: 'run-1.0.0',
    });
    const eventos = await plantel.eventos();
    const evento = eventos.find((e) => e.tipo === 'incorporado');
    expect(evento?.datos?.huella).toBe(paquete.sha256);
  });

  it('SIN artefacto importado no hay entrada (sin escritura)', async () => {
    await expect(
      plantel.incorporarCerebro('inventada', 'red-fantasma', '9.9.9', 'tres-en-raya-3'),
    ).rejects.toThrow(/no está importado/);
    expect(await plantel.listar()).toHaveLength(0);
    expect((await plantel.eventos()).filter((e) => e.tipo === 'incorporado')).toHaveLength(0);
  });

  it('rechaza incorporar un cerebro a un juego distinto', async () => {
    const paquete = await exportarPaqueteLBA(solicitud(12, 'red-ter-3', '1.0.0', null));
    await cerebros.importarPaquete(paquete.bytes);
    await expect(
      plantel.incorporarCerebro('mal-juego', 'red-ter-3', '1.0.0', 'gomoku-7'),
    ).rejects.toThrow(/gomoku-7/);
  });

  it('retira con evento y el listado activo lo excluye', async () => {
    const entrada = await plantel.incorporarCatalogo('efímero', 'aleatorio', {}, 'tres-en-raya-3');
    const ok = await plantel.retirar(entrada.id);
    expect(ok).toBe(true);
    expect(await plantel.listar()).toHaveLength(0);
    const eventos = await plantel.eventos();
    expect(eventos.some((e) => e.tipo === 'retirado' && e.entradaId === entrada.id)).toBe(true);
    expect(await plantel.retirar('id-inexistente')).toBe(false);
  });

  it('registra evaluaciones medidas y deriva el peso', async () => {
    const entrada = await plantel.incorporarCatalogo('medido', 'heuristico', {}, 'tres-en-raya-3');
    await plantel.registrarEvaluacion(entrada.id, {
      fechaISO: '2026-10-19T02:00:00.000Z',
      rival: 'aleatorio',
      partidas: 10,
      victorias: 5,
      empates: 4,
      derrotas: 1,
      puntuacion: 0.7,
      ic95Inferior: 0.42,
      ic95Superior: 0.89,
    });
    const listado = await plantel.listar();
    expect(listado[0]?.evaluaciones).toHaveLength(1);
    const eventos = await plantel.eventos();
    expect(eventos.some((e) => e.tipo === 'evaluacion-registrada')).toBe(true);
    // Resumen que no cuadra: rechazado.
    await expect(
      plantel.registrarEvaluacion(entrada.id, {
        fechaISO: '2026-10-19T03:00:00.000Z',
        rival: 'aleatorio',
        partidas: 10,
        victorias: 99,
        empates: 0,
        derrotas: 0,
        puntuacion: 0.7,
        ic95Inferior: 0.42,
        ic95Superior: 0.89,
      }),
    ).rejects.toThrow(/no cuadra/);
  });

  it('historial de versiones: cadena del linaje real importado', async () => {
    const p1 = await exportarPaqueteLBA(solicitud(21, 'red-ter-3', '1.0.0', null));
    await cerebros.importarPaquete(p1.bytes);
    const p2 = await exportarPaqueteLBA(solicitud(22, 'red-ter-3', '1.0.1', 'red-ter-3@1.0.0'));
    await cerebros.importarPaquete(p2.bytes);
    await plantel.incorporarCerebro('raíz', 'red-ter-3', '1.0.0', 'tres-en-raya-3');
    await plantel.incorporarCerebro('hija', 'red-ter-3', '1.0.1', 'tres-en-raya-3');
    const { cadena, huerfanas } = await plantel.historial('red-ter-3');
    expect(huerfanas).toHaveLength(0);
    expect(
      cadena.map((e) => (e.identidad as { brainVersion: string }).brainVersion),
    ).toEqual(['1.0.0', '1.0.1']);
  });

  it('deriva un equipo desde el plantel con pesos medidos y lo registra', async () => {
    const e1 = await plantel.incorporarCatalogo('pesado', 'heuristico', {}, 'tres-en-raya-3');
    await plantel.incorporarCatalogo('ligero', 'aleatorio', {}, 'tres-en-raya-3');
    await plantel.registrarEvaluacion(e1.id, {
      fechaISO: '2026-10-19T04:00:00.000Z',
      rival: 'aleatorio',
      partidas: 8,
      victorias: 6,
      empates: 2,
      derrotas: 0,
      puntuacion: 0.875,
      ic95Inferior: 0.6,
      ic95Superior: 0.98,
    });
    const { equipo, clave } = await plantel.derivarEquipo(
      'dream-team',
      'tres-en-raya-3',
      'consulta',
      'ponderado',
      ['pesado', 'ligero'],
    );
    expect(clave).toBe('equipo:dream-team');
    expect(esEquipoCargado(clave)).toBe(true);
    const pesos = equipo.miembros.map((m) => m.pesoMedido);
    expect(pesos[0]).toBeCloseTo(0.875, 3);
    expect(pesos[1]).toBe(0); // sin evaluaciones → 0 (nada inventado)
    expect(plantel.retirarEquipo(clave)).toBe(true);
    expect(esEquipoCargado(clave)).toBe(false);
  });

  it('derivarEquipo rechaza alias ausentes del plantel', async () => {
    await expect(
      plantel.derivarEquipo('x', 'tres-en-raya-3', 'consulta', 'votacion', ['nadie1', 'nadie2']),
    ).rejects.toThrow(/no está en el plantel/);
  });

  it('persistencia real: el plantel sobrevive a una relectura', async () => {
    await plantel.incorporarCatalogo('persistente', 'mcts', { simulaciones: 50, constanteExploracion: 1.4, limiteRollout: 9 }, 'tres-en-raya-3');
    const plantel2 = new RegistroPlantel(almacen, cerebros);
    const listado = await plantel2.listar();
    expect(listado).toHaveLength(1);
    expect(listado[0]?.alias).toBe('persistente');
    expect(listado[0]?.identidad).toMatchObject({ tipo: 'catalogo', agenteId: 'mcts' });
  });
});
