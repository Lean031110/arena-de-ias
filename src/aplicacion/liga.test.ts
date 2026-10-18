/**
 * Pruebas de la liga de versiones y el examen de promoción:
 * - criterios congelados evaluados correctamente (función pura);
 * - examen REAL (partidas ejecutadas) con promoción protegida;
 * - el examen reprobado no promueve y no toca el paquete del campeón.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAlmacenamiento } from './almacen';
import type { Almacenamiento } from './almacen';
import { RegistroCerebros } from './registroCerebros';
import { CRITERIOS_PROMOCION_V1, evaluarCriterios, examinarCandidata } from './liga';
import { exportarPaqueteLBA, type SolicitudExportacionLBA } from '../dominio/lba/exportador';
import { escribirTensores } from '../dominio/lba/safetensors';
import { huellaJSON } from '../dominio/motor/huella';
import { crearRng } from '../dominio/motor/rng';
import { CATALOGO_JUEGOS } from '../dominio/juegos/registro';
import { tablaArquitectura } from '../dominio/neural/red';

const ARQ = {
  tipo: 'conv-politica-valor-v1' as const,
  entrada: { alto: 3, ancho: 3, canales: 2 as const },
  acciones: 9,
};

const CONFIG = {
  tipo: 'autojuego-supervisado-v1' as const,
  semilla: 5,
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
  versionCodigo: 'prueba-liga',
};

function paquetePrueba(semilla: number, agentId: string, version: string): SolicitudExportacionLBA {
  const juego = CATALOGO_JUEGOS.find((j) => j.id === 'tres-en-raya-3')!.juego!;
  const rng = crearRng(semilla);
  return {
    manifiesto: {
      formatVersion: 1 as const,
      agentId,
      brainVersion: version,
      parentModelId: null,
      createdAt: '2026-10-19T10:00:00.000Z',
      gameId: 'tres-en-raya-3',
      gameRulesVersion: juego.reglasVersion,
      gameRulesHash: huellaJSON({
        id: juego.id,
        reglasVersion: juego.reglasVersion,
        dimensiones: juego.dimensiones,
        familia: juego.familia,
      }),
      observationSchemaVersion: 1,
      actionSpaceVersion: 1,
      architecture: ARQ,
      weightsFormat: 'safetensors' as const,
      runtimeTargets: ['ts-puro' as const],
      trainingRunId: `prueba-${semilla}`,
      trainingConfig: CONFIG,
      datasetLineage: {
        origen: 'autojuego' as const,
        partidas: 4,
        ejemplos: 20,
        semilla: 5,
        rival: null,
        buffer: 'FIFO 1000',
      },
      evaluationRunIds: [],
      evaluationSummary: null,
    },
    pesosSafetensors: escribirTensores(
      [...tablaArquitectura(ARQ).entries()].map(([nombre, forma]) => ({
        nombre,
        forma,
        datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente() * 2 - 1),
      })),
    ),
    configEntrenamiento: CONFIG,
    lineageDatos: { origen: 'autojuego' as const, partidas: 4, ejemplos: 20, semilla: 5, rival: null, buffer: 'FIFO 1000' },
    linaje: {
      formatVersion: 1 as const,
      agentId,
      brainVersion: version,
      parentModelId: null,
      parentPackageSha256: null,
      motivo: 'entrenamiento-inicial' as const,
      notas: 'prueba de liga',
      createdAt: '2026-10-19T10:00:00.000Z',
    },
    resumenEvaluacion: null,
  };
}

describe('criterios de promoción (función pura, ADR-007)', () => {
  it('aprueba con 200 partidas, puntuación ≥ 0,60 e IC95 inf > 0,55', () => {
    // 130 V + 20 E en 200 → 0,70; Wilson inf ≈ 0,635 > 0,55.
    const r = evaluarCriterios(130, 20, 200);
    expect(r.aprobado).toBe(true);
    expect(r.puntuacion).toBeCloseTo(0.7, 5);
    expect(r.ic95.inferior).toBeGreaterThan(0.55);
  });

  it('rechaza por partidas insuficientes aunque la puntuación sea perfecta', () => {
    const r = evaluarCriterios(199, 0, 199); // 199 partidas, puntuación 1
    expect(r.aprobado).toBe(false); // partidasMinimas = 200
  });

  it('rechaza con puntuación por debajo del umbral', () => {
    const r = evaluarCriterios(60, 40, 200); // 0,40
    expect(r.aprobado).toBe(false);
  });

  it('rechaza cuando el IC95 inferior no supera 0,55 (muestra débil)', () => {
    // 200 partidas, puntuación exactamente 0,60 → Wilson inf ≈ 0,53 < 0,55.
    const r = evaluarCriterios(100, 40, 200);
    expect(r.puntuacion).toBeCloseTo(0.6, 5);
    expect(r.ic95.inferior).toBeLessThanOrEqual(0.55);
    expect(r.aprobado).toBe(false);
  });

  it('los criterios v1 están congelados con los valores documentados', () => {
    expect(CRITERIOS_PROMOCION_V1).toEqual({
      partidasMinimas: 200,
      puntuacionMinima: 0.6,
      ic95InferiorMinimo: 0.55,
    });
  });
});

describe('examen de promoción (partidas reales, promoción protegida)', () => {
  let almacen: Almacenamiento;
  let registro: RegistroCerebros;

  beforeEach(async () => {
    almacen = crearAlmacenamiento();
    await almacen.abrir();
    registro = new RegistroCerebros(almacen);
  });

  afterEach(async () => {
    await almacen.borrarTodo();
  });

  it('un examen reprobado registra el fracaso y no crea campeona', async () => {
    const paquete = await exportarPaqueteLBA(paquetePrueba(31, 'red-liga', '1.0.0'));
    await registro.importarPaquete(paquete.bytes);

    // Criterios relajados SOLO para ejecutar un examen rápido en pruebas:
    // partidas mínimas 4, umbrales inalcanzables (puntuación ≥ 0,99).
    const resultado = await examinarCandidata(
      registro,
      { agentId: 'red-liga', brainVersion: '1.0.0' },
      {
        juegoId: 'tres-en-raya-3',
        semillaBase: 5000,
        encuentros: 4,
        simulacionesCandidata: 12,
        criterios: { partidasMinimas: 4, puntuacionMinima: 0.99, ic95InferiorMinimo: 0.99 },
      },
    );
    expect(resultado.aprobado).toBe(false);
    expect(resultado.componentes).toHaveLength(1); // sin campeona: solo referencia
    expect(resultado.componentes[0]!.partidas).toBe(4);
    expect(resultado.componentes[0]!.victorias + resultado.componentes[0]!.empates + resultado.componentes[0]!.derrotas).toBe(4);
    const lista = await registro.listar();
    expect(lista[0]!.estado).not.toBe('campeon');
    // El evento de examen reprobado queda registrado con sus números.
    expect(lista[0]!.eventos.some((e) => e.tipo === 'examen' && e.datos?.aprobado === false)).toBe(true);
  });

  it('un examen aprobado promueve sin sobrescribir el paquete del cerebro', async () => {
    const paquete = await exportarPaqueteLBA(paquetePrueba(32, 'red-liga', '1.0.0'));
    await registro.importarPaquete(paquete.bytes);
    const bytesAntes = new Uint8Array((await registro.exportar('red-liga', '1.0.0')).bytes);
    const huellaAntes = (await registro.exportar('red-liga', '1.0.0')).sha256;

    // Examen aprobable: pesos sembrados contra ALEATORIO con umbral bajo.
    // Cambiamos la referencia congelada de forma controlada en la prueba
    // mediante criterios laxos y el propio azar del aleatorio.
    const resultado = await examinarCandidata(
      registro,
      { agentId: 'red-liga', brainVersion: '1.0.0' },
      {
        juegoId: 'tres-en-raya-3',
        semillaBase: 6000,
        encuentros: 4,
        simulacionesCandidata: 12,
        criterios: { partidasMinimas: 4, puntuacionMinima: 0, ic95InferiorMinimo: -1 },
      },
    );
    expect(resultado.aprobado).toBe(true);
    const lista = await registro.listar();
    expect(lista[0]!.estado).toBe('campeon');

    // PROTECCIÓN DEL CAMPEÓN: los bytes del paquete quedan intactos.
    const exportado = await registro.exportar('red-liga', '1.0.0');
    expect(exportado.sha256).toBe(huellaAntes);
    expect(Array.from(exportado.bytes)).toEqual(Array.from(bytesAntes));
  });

  it('con campeona vigente, el examen incluye el duelo contra ella', async () => {
    // Promovemos una primera versión…
    const paqueteA = await exportarPaqueteLBA(paquetePrueba(33, 'red-liga', '1.0.0'));
    await registro.importarPaquete(paqueteA.bytes);
    await examinarCandidata(
      registro,
      { agentId: 'red-liga', brainVersion: '1.0.0' },
      {
        juegoId: 'tres-en-raya-3',
        semillaBase: 7000,
        encuentros: 4,
        simulacionesCandidata: 12,
        criterios: { partidasMinimas: 4, puntuacionMinima: 0, ic95InferiorMinimo: -1 },
      },
    );
    // …y examinamos una segunda: debe aparecer el componente contra la campeona.
    const paqueteB = await exportarPaqueteLBA(paquetePrueba(34, 'red-liga', '1.1.0'));
    await registro.importarPaquete(paqueteB.bytes);
    const resultado = await examinarCandidata(
      registro,
      { agentId: 'red-liga', brainVersion: '1.1.0' },
      {
        juegoId: 'tres-en-raya-3',
        semillaBase: 8000,
        encuentros: 4,
        simulacionesCandidata: 12,
        criterios: { partidasMinimas: 4, puntuacionMinima: 0, ic95InferiorMinimo: -1 },
      },
    );
    expect(resultado.componentes).toHaveLength(2);
    expect(resultado.componentes[1]!.etiqueta).toBe('campeona:red-liga@1.0.0');
    expect(resultado.componentes[1]!.rivales[0]!.id).toBe('neural:red-liga@1.0.0');
  });
});
