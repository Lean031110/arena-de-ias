/**
 * Pruebas del núcleo .lba: safetensors, exportador/importador (ida y vuelta),
 * rechazos de seguridad (bombas, traversal, manipulados) y compatibilidad.
 *
 * Los paquetes de prueba usan pesos ALEATORIOS CON SEMILLA: son artefactos de
 * prueba del FORMATO, nunca modelos entrenados ni métricas reales.
 */

import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { crearRng } from '../motor/rng';
import { escribirTensores, leerTensores, analizarEstructura } from './safetensors';
import { exportarPaqueteLBA, type SolicitudExportacionLBA } from './exportador';
import { LIMITES_POR_DEFECTO, validarPaqueteLBA } from './validador';
import { RechazoLBA } from './errores';
import { huellaJSON } from '../motor/huella';
import { CATALOGO_JUEGOS } from '../juegos/registro';
import { tablaArquitectura } from '../neural/red';
import { esquemaConfigEntrenamiento } from './esquema';

const ARQ_3X3 = {
  tipo: 'conv-politica-valor-v1' as const,
  entrada: { alto: 3, ancho: 3, canales: 2 as const },
  acciones: 9,
};

function pesosAleatorios(semilla: number): Uint8Array {
  const rng = crearRng(semilla);
  const tensores = [...tablaArquitectura(ARQ_3X3).entries()].map(([nombre, forma]) => ({
    nombre,
    forma,
    datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente() * 2 - 1),
  }));
  return escribirTensores(tensores);
}

const CONFIG_ENTRENAMIENTO = {
  tipo: 'autojuego-supervisado-v1' as const,
  semilla: 20261019,
  iteraciones: 3,
  partidasPorIteracion: 40,
  simulacionesMCTS: 64,
  temperatura: 1,
  dirichletAlfa: 0.03,
  dirichletEpsilon: 0.25,
  tamanoLote: 64,
  tasaAprendizaje: 0.001,
  pasosPorIteracion: 30,
  bufferCapacidad: 20000,
  dispositivo: 'cpu',
  versionCodigo: 'prueba-1',
};

function hashReglas(gameId: string): string {
  const entrada = CATALOGO_JUEGOS.find((j) => j.id === gameId);
  const juego = entrada?.juego;
  if (juego === undefined) throw new Error(`juego ${gameId} no implementado`);
  return huellaJSON({
    id: juego.id,
    reglasVersion: juego.reglasVersion,
    dimensiones: juego.dimensiones,
    familia: juego.familia,
  });
}

function solicitudBase(semilla = 20261019): SolicitudExportacionLBA {
  return {
    manifiesto: {
      formatVersion: 1 as const,
      agentId: 'red-ter-prueba',
      brainVersion: '0.1.0',
      parentModelId: null,
      createdAt: '2026-10-19T10:00:00.000Z',
      gameId: 'tres-en-raya-3',
      gameRulesVersion: '1',
      gameRulesHash: hashReglas('tres-en-raya-3'),
      observationSchemaVersion: 1,
      actionSpaceVersion: 1,
      architecture: ARQ_3X3,
      weightsFormat: 'safetensors' as const,
      runtimeTargets: ['ts-puro' as const],
      trainingRunId: 'prueba-000',
      trainingConfig: CONFIG_ENTRENAMIENTO,
      datasetLineage: {
        origen: 'autojuego' as const,
        partidas: 120,
        ejemplos: 700,
        semilla: 20261019,
        rival: null,
        buffer: 'FIFO 20000, muestreo uniforme (prueba)',
      },
      evaluationRunIds: [],
      evaluationSummary: null,
    },
    pesosSafetensors: pesosAleatorios(semilla),
    configEntrenamiento: CONFIG_ENTRENAMIENTO,
    lineageDatos: { origen: 'autojuego' as const, partidas: 120, ejemplos: 700, semilla: 20261019, rival: null, buffer: 'FIFO 20000, muestreo uniforme (prueba)' },
    linaje: {
      formatVersion: 1 as const,
      agentId: 'red-ter-prueba',
      brainVersion: '0.1.0',
      parentModelId: null,
      parentPackageSha256: null,
      motivo: 'entrenamiento-inicial' as const,
      notas: 'paquete de prueba del formato',
      createdAt: '2026-10-19T10:00:00.000Z',
    },
    resumenEvaluacion: null,
  };
}

describe('safetensors', () => {
  it('ida y vuelta: escribir → analizar → leer conserva nombres, formas y valores', () => {
    const pesos = pesosAleatorios(7);
    const estructura = analizarEstructura(pesos);
    expect(estructura.tensores).toHaveLength(14);
    const tensores = leerTensores(pesos);
    const conv1 = tensores.get('conv1.peso');
    expect(conv1).toBeDefined();
    expect(conv1!.forma).toEqual([32, 2, 3, 3]);
    expect(conv1!.datos.length).toBe(32 * 2 * 3 * 3);
    // Valor concreto reproducible con la semilla.
    const rng = crearRng(7);
    const esperado = rng.siguiente() * 2 - 1;
    expect(conv1!.datos[0]).toBeCloseTo(esperado, 5);
  });

  it('rechaza dtype que no es F32', () => {
    const cabecera = JSON.stringify({ x: { dtype: 'F16', shape: [2], data_offsets: [0, 4] } });
    const longitud = new TextEncoder().encode(cabecera).length;
    const bytes = new Uint8Array(8 + longitud + 4);
    new DataView(bytes.buffer).setUint32(0, longitud, true);
    bytes.set(new TextEncoder().encode(cabecera), 8);
    expect(() => analizarEstructura(bytes)).toThrow(/no soportado/);
  });

  it('rechaza offsets que solapan o exceden la región de datos', () => {
    const cabecera = JSON.stringify({
      a: { dtype: 'F32', shape: [2], data_offsets: [0, 8] },
      b: { dtype: 'F32', shape: [2], data_offsets: [4, 12] },
    });
    const longitud = new TextEncoder().encode(cabecera).length;
    const bytes = new Uint8Array(8 + longitud + 12);
    new DataView(bytes.buffer).setUint32(0, longitud, true);
    bytes.set(new TextEncoder().encode(cabecera), 8);
    expect(() => analizarEstructura(bytes)).toThrow(/solapa/);
  });

  it('rechaza archivos truncados', () => {
    expect(() => analizarEstructura(new Uint8Array(5))).toThrow(/corto/);
  });
});

describe('paquete .lba — ida y vuelta', () => {
  it('exportar → validar regresa el manifiesto íntegro y la huella', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    expect(paquete.tamano).toBeGreaterThan(1000);
    expect(paquete.sha256).toMatch(/^[0-9a-f]{64}$/);
    const validado = await validarPaqueteLBA(paquete.bytes);
    expect(validado.huellaPaquete).toBe(paquete.sha256);
    expect(validado.manifiesto.agentId).toBe('red-ter-prueba');
    expect(validado.manifiesto.brainVersion).toBe('0.1.0');
    expect(validado.manifiesto.trainingConfig).toEqual(CONFIG_ENTRENAMIENTO);
    expect(validado.archivos.has('training/weights.safetensors')).toBe(true);
    expect(validado.archivos.has('evaluation/summary.json')).toBe(false); // sin evaluación real
  });

  it('la huella cambia si cambia un byte del paquete', async () => {
    const a = await exportarPaqueteLBA(solicitudBase(1));
    const b = await exportarPaqueteLBA(solicitudBase(2));
    expect(a.sha256).not.toBe(b.sha256);
  });
});

describe('paquete .lba — rechazos de seguridad', () => {
  it('paquete vacío → rechazo por tamaño', async () => {
    await expect(validarPaqueteLBA(new Uint8Array(0))).rejects.toMatchObject({
      motivo: 'tamano',
    });
  });

  it('manifiesto corrupto (no JSON) → rechazo', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    const archivos = new Map([...(await validarPaqueteLBA(paquete.bytes)).archivos]);
    archivos.set('manifest.json', new TextEncoder().encode('{esto no es json'));
    await expect(reconstruirYValidar(archivos)).rejects.toMatchObject({ motivo: 'manifiesto' });
  });

  it('un byte manipulado en los pesos → checksum no coincide', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    const pesos = archivos.get('training/weights.safetensors')!; // referencia mutable
    pesos[pesos.length - 1] = (pesos[pesos.length - 1]! + 1) % 256;
    await expect(reconstruirYValidar(archivos)).rejects.toMatchObject({ motivo: 'integridad' });
  });

  it('checksums manipulados (hash falso) → rechazo', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    archivos.set('integrity/checksums.sha256', new TextEncoder().encode('0'.repeat(64) + '  manifest.json\n'));
    await expect(reconstruirYValidar(archivos)).rejects.toMatchObject({ motivo: 'integridad' });
  });

  it('archivo requerido ausente → rechazo', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    archivos.delete('training/lineage.json');
    // Regenerar checksums coherentes SIN ese archivo: el fallo debe ser la
    // ausencia del requerido, no un checksum desincronizado.
    await expect(reconstruirYValidar(archivos, { regenerarChecksums: true, requeridosFuera: ['training/lineage.json'] })).rejects.toMatchObject({ motivo: 'entradas' });
  });

  it('entrada fuera de la lista blanca → rechazo', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    archivos.set('ejecutable_malicioso.exe', new Uint8Array([0x4d, 0x5a]));
    await expect(reconstruirYValidar(archivos, { regenerarChecksums: true })).rejects.toMatchObject({ motivo: 'entradas' });
  });

  it('path traversal (../) → rechazo', async () => {
    const paquete = await exportarPaqueteLBA(solicitudBase());
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    archivos.set('../fuera.txt', new Uint8Array([1]));
    // Sin regenerar checksums: el nombre se detecta al enumerar el ZIP.
    const zip = zipSync(Object.fromEntries(archivos));
    await expect(validarPaqueteLBA(zip)).rejects.toMatchObject({ motivo: 'entradas' });
  });

  it('bomba de descompresión (total declarado enorme) → rechazo antes de descomprimir', async () => {
    // 8 MB de ceros: comprime a ~8 KB pero declara 8 MB descomprimidos.
    const gigante = new Uint8Array(8 * 1024 * 1024);
    const base = await exportarPaqueteLBA(solicitudBase());
    const validado = await validarPaqueteLBA(base.bytes);
    const archivos = Object.fromEntries(validado.archivos);
    archivos['docs/FORMATO.md'] = gigante;
    const zip = zipSync(archivos);
    const limites = { ...LIMITES_POR_DEFECTO, maxTotalDescomprimido: 1024 * 1024 };
    await expect(validarPaqueteLBA(zip, limites)).rejects.toMatchObject({ motivo: 'entradas' });
  });

  it('forma de tensor errónea en los pesos → rechazo', async () => {
    const base = solicitudBase();
    // Reescribir los pesos con una forma incorrecta (conv1.peso [32,3,3,3]).
    const rng = crearRng(99);
    const tabla = tablaArquitectura(ARQ_3X3);
    tabla.set('conv1.peso', [32, 3, 3, 3]);
    const solicitud: SolicitudExportacionLBA = {
      ...base,
      pesosSafetensors: escribirTensores(
        [...tabla.entries()].map(([nombre, forma]) => ({
          nombre,
          forma,
          datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente()),
        })),
      ),
    };
    const paquete = await exportarPaqueteLBA(solicitud);
    await expect(validarPaqueteLBA(paquete.bytes)).rejects.toMatchObject({ motivo: 'pesos' });
  });

  it('tensor extra desconocido → rechazo', async () => {
    const base = solicitudBase();
    const rng = crearRng(98);
    const tabla = tablaArquitectura(ARQ_3X3);
    const tensores = [...tabla.entries()].map(([nombre, forma]) => ({
      nombre,
      forma,
      datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente()),
    }));
    tensores.push({ nombre: 'backdoor.peso', forma: [1], datos: Float32Array.from([1]) });
    const solicitud: SolicitudExportacionLBA = { ...base, pesosSafetensors: escribirTensores(tensores) };
    const paquete = await exportarPaqueteLBA(solicitud);
    await expect(validarPaqueteLBA(paquete.bytes)).rejects.toMatchObject({ motivo: 'pesos' });
  });

  it('juego inexistente en el catálogo → rechazo por compatibilidad', async () => {
    const base = solicitudBase();
    const solicitud: SolicitudExportacionLBA = {
      ...base,
      manifiesto: { ...base.manifiesto, gameId: 'juego-fantasma' },
    };
    const paquete = await exportarPaqueteLBA(solicitud);
    await expect(validarPaqueteLBA(paquete.bytes)).rejects.toMatchObject({ motivo: 'compatibilidad' });
  });

  it('versión de reglas distinta a la del catálogo → rechazo', async () => {
    const base = solicitudBase();
    const solicitud: SolicitudExportacionLBA = {
      ...base,
      manifiesto: { ...base.manifiesto, gameRulesVersion: '999' },
    };
    const paquete = await exportarPaqueteLBA(solicitud);
    await expect(validarPaqueteLBA(paquete.bytes)).rejects.toMatchObject({ motivo: 'compatibilidad' });
  });

  it('dimensiones de observación incoherentes con las acciones → rechazo', async () => {
    // Pesos coherentes con acciones=8: el rechazo llega por compatibilidad
    // (8 acciones ≠ 9 celdas del tablero), no por forma de tensores.
    const base = solicitudBase();
    const arqMal = { ...ARQ_3X3, acciones: 8 };
    const rng = crearRng(97);
    const tabla = tablaArquitectura(arqMal);
    const solicitud: SolicitudExportacionLBA = {
      ...base,
      manifiesto: { ...base.manifiesto, architecture: arqMal },
      pesosSafetensors: escribirTensores(
        [...tabla.entries()].map(([nombre, forma]) => ({
          nombre,
          forma,
          datos: Float32Array.from({ length: forma.reduce((a, b) => a * b, 1) }, () => rng.siguiente()),
        })),
      ),
    };
    const paquete = await exportarPaqueteLBA(solicitud);
    await expect(validarPaqueteLBA(paquete.bytes)).rejects.toMatchObject({ motivo: 'compatibilidad' });
  });

  it('formatVersion futuro (2) → rechazo por esquema', async () => {
    const solicitud = solicitudBase();
    const paquete = await exportarPaqueteLBA(solicitud);
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    const manifiesto = { ...validado.manifiesto, formatVersion: 2 as unknown as 1 };
    archivos.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifiesto)));
    await expect(reconstruirYValidar(archivos, { regenerarChecksums: true })).rejects.toMatchObject({
      motivo: 'manifiesto',
    });
  });

  it('manifiesto.pesos con bytes falsos → rechazo', async () => {
    const solicitud = solicitudBase();
    const paquete = await exportarPaqueteLBA(solicitud);
    const validado = await validarPaqueteLBA(paquete.bytes);
    const archivos = new Map(validado.archivos);
    const manifiesto = {
      ...validado.manifiesto,
      pesos: { 'training/weights.safetensors': { bytes: 12345, sha256: '0'.repeat(64) } },
    };
    archivos.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifiesto)));
    await expect(reconstruirYValidar(archivos, { regenerarChecksums: true })).rejects.toMatchObject({
      motivo: 'manifiesto',
    });
  });
});

describe('config de entrenamiento (esquema compartido)', () => {
  it('la configuración de prueba supera el esquema exacto', () => {
    expect(esquemaConfigEntrenamiento.safeParse(CONFIG_ENTRENAMIENTO).success).toBe(true);
  });
});

/** Reconstruye un ZIP con los archivos dados (y checksums coherentes si se pide). */
async function reconstruirYValidar(
  archivos: Map<string, Uint8Array>,
  opciones: { regenerarChecksums?: boolean; requeridosFuera?: readonly string[] } = {},
): Promise<unknown> {
  const { sha256Hex } = await import('./sha256');
  let finales: Record<string, Uint8Array> = Object.fromEntries(archivos);
  if (opciones.regenerarChecksums === true) {
    const cubrir = [...archivos.keys()]
      .filter((ruta) => ruta !== 'integrity/checksums.sha256')
      .filter((ruta) => !(opciones.requeridosFuera ?? []).includes(ruta))
      .sort();
    const lineas: string[] = [];
    for (const ruta of cubrir) {
      lineas.push(`${await sha256Hex(archivos.get(ruta)!)}  ${ruta}`);
    }
    finales = { ...finales, 'integrity/checksums.sha256': new TextEncoder().encode(lineas.join('\n') + '\n') };
    if ((opciones.requeridosFuera ?? []).length > 0) {
      for (const fuera of opciones.requeridosFuera ?? []) delete finales[fuera];
    }
  }
  const zip = zipSync(finales);
  return validarPaqueteLBA(zip);
}

/** Comprobación adicional: el rechazo es siempre instancia tipada. */
describe('errores .lba', () => {
  it('RechazoLBA clasifica el motivo', () => {
    const error = new RechazoLBA('pesos', 'motivo de prueba');
    expect(error).toBeInstanceOf(RechazoLBA);
    expect(error.motivo).toBe('pesos');
    expect(error.message).toContain('rechazado');
  });
});
