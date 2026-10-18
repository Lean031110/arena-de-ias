/**
 * Pruebas del registro de cerebros (ADR-015): importar, duplicados,
 * colisiones, estados derivados de eventos, clonación, ramas, carga en
 * runtime y protección del campeón. IndexedDB simulado con fake-indexeddb.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAlmacenamiento } from './almacen';
import type { Almacenamiento } from './almacen';
import { RegistroCerebros, derivarEstado, siguienteVersion } from './registroCerebros';
import { exportarPaqueteLBA, type SolicitudExportacionLBA } from '../dominio/lba/exportador';
import { escribirTensores } from '../dominio/lba/safetensors';
import { huellaJSON } from '../dominio/motor/huella';
import { crearRng } from '../dominio/motor/rng';
import { CATALOGO_JUEGOS } from '../dominio/juegos/registro';
import { tablaArquitectura } from '../dominio/neural/red';
import type { EventoCerebro } from './almacen';

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

function solicitud(semilla: number, agentId = 'red-prueba', version = '1.0.0'): SolicitudExportacionLBA {
  const juegoTer = CATALOGO_JUEGOS.find((j) => j.id === 'tres-en-raya-3')!.juego!;
  return {
    manifiesto: {
      formatVersion: 1 as const,
      agentId,
      brainVersion: version,
      parentModelId: null,
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
      trainingRunId: 'run-prueba',
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
      parentModelId: null,
      parentPackageSha256: null,
      motivo: 'entrenamiento-inicial' as const,
      notas: 'prueba',
      createdAt: new Date().toISOString(),
    },
    resumenEvaluacion: null,
  };
}

describe('RegistroCerebros', () => {
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

  it('importa un paquete válido y queda listado como raíz', async () => {
    const paquete = await exportarPaqueteLBA(solicitud(11));
    const resultado = await registro.importarPaquete(paquete.bytes);
    expect(resultado.resultado).toBe('importado');
    const lista = await registro.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.estado).toBe('raiz');
    expect(lista[0]!.registro.manifiesto.agentId).toBe('red-prueba');
    expect(lista[0]!.eventos.some((e) => e.tipo === 'importado')).toBe(true);
  });

  it('reimportar el mismo paquete → duplicado (sin segunda entrada)', async () => {
    const paquete = await exportarPaqueteLBA(solicitud(12));
    await registro.importarPaquete(paquete.bytes);
    const segundo = await registro.importarPaquete(paquete.bytes);
    expect(segundo.resultado).toBe('duplicado');
    expect((await registro.listar())).toHaveLength(1);
  });

  it('misma versión con contenido distinto → colisión rechazada', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(13))).bytes);
    const otro = await exportarPaqueteLBA(solicitud(14)); // mismos ids, otros pesos
    const resultado = await registro.importarPaquete(otro.bytes);
    expect(resultado.resultado).toBe('colision');
    expect((await registro.listar())).toHaveLength(1);
  });

  it('una importación fallida no toca el registro', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(15))).bytes);
    const malo = new Uint8Array(64); // ni siquiera ZIP
    await expect(registro.importarPaquete(malo)).rejects.toThrow(/rechazado/i);
    expect((await registro.listar())).toHaveLength(1); // intacto
  });

  it('carga en runtime y devuelve la clave de agente usable', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(16))).bytes);
    const clave = await registro.cargar('red-prueba', '1.0.0');
    expect(clave).toBe('neural:red-prueba@1.0.0');
    // La partida real con el agente cargado llega en las pruebas del agente.
  });

  it('clonar crea una versión parche+1 con el mismo linaje padre', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(17))).bytes);
    const clon = await registro.clonar('red-prueba', '1.0.0');
    expect(clon.brainVersion).toBe('1.0.1');
    expect(clon.manifiesto.parentModelId).toBe('red-prueba@1.0.0');
    const lista = await registro.listar();
    expect(lista).toHaveLength(2);
    const clonEstado = lista.find((c) => c.registro.brainVersion === '1.0.1');
    expect(clonEstado!.estado).toBe('raiz'); // clon: hereda pesos, es raíz de su propia línea
    expect(clonEstado!.eventos.some((e) => e.tipo === 'clonado')).toBe(true);
  });

  it('crear rama crea versión menor+1 y estado candidato', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(18))).bytes);
    const rama = await registro.crearRama('red-prueba', '1.0.0');
    expect(rama.brainVersion).toBe('1.1.0');
    const lista = await registro.listar();
    const ramaEstado = lista.find((c) => c.registro.brainVersion === '1.1.0');
    expect(ramaEstado!.estado).toBe('candidato');
    // El padre queda intacto y sigue listado.
    expect(lista.some((c) => c.registro.brainVersion === '1.0.0')).toBe(true);
  });

  it('exportar devuelve los bytes originales con su huella', async () => {
    const paquete = await exportarPaqueteLBA(solicitud(19));
    await registro.importarPaquete(paquete.bytes);
    const exportado = await registro.exportar('red-prueba', '1.0.0');
    expect(exportado.sha256).toBe(paquete.sha256);
    expect(exportado.bytes.length).toBe(paquete.bytes.length);
  });

  it('el examen aprobado promueve a campeón; el rechazado no', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(20))).bytes);
    await registro.registrarExamen('red-prueba', '1.0.0', false, { motivo: 'insuficiente evidencia' });
    let lista = await registro.listar();
    expect(lista[0]!.estado).not.toBe('campeon');
    await registro.registrarExamen('red-prueba', '1.0.0', true, { partida: 200, puntuacion: 0.61 });
    lista = await registro.listar();
    expect(lista[0]!.estado).toBe('campeon');
  });

  it('archivar e incompatible se reflejan en el estado derivado', async () => {
    await registro.importarPaquete((await exportarPaqueteLBA(solicitud(21))).bytes);
    await registro.archivar('red-prueba', '1.0.0', 'obsoleto');
    expect((await registro.listar())[0]!.estado).toBe('archivado');
    await registro.marcarIncompatible('red-prueba', '1.0.0', 'reglas v2');
    expect((await registro.listar())[0]!.estado).toBe('incompatible'); // prioridad máxima
  });
});

describe('utilidades de registro', () => {
  it('siguienteVersion incrementa el componente correcto', () => {
    expect(siguienteVersion('1.2.3', 'parche')).toBe('1.2.4');
    expect(siguienteVersion('1.2.3', 'menor')).toBe('1.3.0');
    expect(siguienteVersion('1.2.3', 'mayor')).toBe('2.0.0');
  });

  it('derivarEstado prioriza incompatible > archivado > campeon > candidato > raíz', () => {
    const e = (tipo: EventoCerebro['tipo']): EventoCerebro => ({
      id: `x-${tipo}`,
      fecha: '2026-10-19T00:00:00.000Z',
      tipo,
      agentId: 'a',
      brainVersion: '1.0.0',
    });
    expect(derivarEstado([])).toBe('raiz');
    expect(derivarEstado([e('rama')])).toBe('candidato');
    expect(derivarEstado([e('rama'), e('promocion')])).toBe('campeon');
    expect(derivarEstado([e('promocion'), e('archivado')])).toBe('archivado');
    expect(derivarEstado([e('promocion'), e('incompatible')])).toBe('incompatible');
  });
});
