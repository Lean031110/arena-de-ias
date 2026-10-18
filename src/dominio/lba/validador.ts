/**
 * Validador de paquetes .lba — docs/LBA-MODELO.md §10 (orden obligatorio).
 * Un paquete son DATOS: nunca se ejecuta código procedente de él.
 * Cualquier fallo produce RechazoLBA tipado y ninguna escritura en registro.
 */

import { unzipSync } from 'fflate';
import { z } from 'zod';
import { CATALOGO_JUEGOS } from '../juegos/registro';
import { huellaJSON } from '../motor/huella';
import { analizarEstructura, comprobarTablaArquitectura } from './safetensors';
import { tablaArquitectura } from '../neural/red';
import { esquemaManifiestoLBA, validarSemanticaManifiesto, type ManifiestoLBA } from './esquema';
import { RechazoLBA } from './errores';
import { sha256Hex } from './sha256';

/** Lista blanca exacta de entradas (docs/LBA-MODELO.md §1). */
export const LISTA_BLANCA = [
  'manifest.json',
  'training/weights.safetensors',
  'training/config.json',
  'training/lineage.json',
  'evaluation/summary.json',
  'integrity/checksums.sha256',
  'model.onnx',
  'docs/FORMATO.md',
  'LICENSE.txt',
] as const;

const REQUERIDAS = ['manifest.json', 'training/weights.safetensors', 'training/config.json', 'training/lineage.json', 'integrity/checksums.sha256'] as const;

export interface LimitesLBA {
  readonly maxBytesPaquete: number;
  readonly maxEntradas: number;
  readonly maxTotalDescomprimido: number;
  readonly maxEntradaDescomprimida: number;
}

export const LIMITES_POR_DEFECTO: LimitesLBA = {
  maxBytesPaquete: 64 * 1024 * 1024,
  maxEntradas: 64,
  maxTotalDescomprimido: 256 * 1024 * 1024,
  maxEntradaDescomprimida: 128 * 1024 * 1024,
};

const REGEX_RUTA = /^[A-Za-z0-9._/-]+$/;

export interface PaqueteValidado {
  readonly manifiesto: ManifiestoLBA;
  readonly archivos: Map<string, Uint8Array>;
  readonly huellaPaquete: string; // SHA-256 del .lba completo
  readonly pesosSafetensors: Uint8Array;
}

interface EntradaRegistrada {
  readonly nombre: string;
  readonly originalSize: number;
  readonly enListaBlanca: boolean;
  readonly violacion?: string;
}

function rutaSegura(nombre: string): string | null {
  if (nombre.length === 0) return 'ruta vacía';
  if (nombre.endsWith('/')) return 'entrada de directorio (no permitida)';
  if (!REGEX_RUTA.test(nombre)) return 'caracteres no permitidos en la ruta';
  if (nombre.startsWith('/')) return 'ruta absoluta';
  if (nombre.includes('\\')) return 'barra invertida';
  if (nombre.split('/').includes('..')) return 'segmento «..» (path traversal)';
  if (!LISTA_BLANCA.includes(nombre as (typeof LISTA_BLANCA)[number])) {
    return 'ruta fuera de la lista blanca';
  }
  return null;
}

const LINEA_CHECKSUM = /^([0-9a-f]{64}) {2}([A-Za-z0-9._/-]+)$/;

function analizarChecksums(texto: string): Map<string, string> {
  const lineas = texto.split('\n');
  if (lineas.length > 0 && lineas[lineas.length - 1] === '') lineas.pop();
  const mapa = new Map<string, string>();
  for (const linea of lineas) {
    const coincidencia = LINEA_CHECKSUM.exec(linea);
    if (coincidencia === null) {
      throw new RechazoLBA('integridad', `línea de checksums malformada: «${linea.slice(0, 80)}»`);
    }
    const [, hash, ruta] = coincidencia;
    if (mapa.has(ruta!)) {
      throw new RechazoLBA('integridad', `ruta duplicada en checksums: «${ruta}»`);
    }
    mapa.set(ruta!, hash!);
  }
  return mapa;
}

/**
 * Validación completa de un paquete .lba (bytes). Async por SHA-256.
 * @throws RechazoLBA en el primer fallo (orden §10 de la especificación).
 */
export async function validarPaqueteLBA(
  bytes: Uint8Array,
  limites: LimitesLBA = LIMITES_POR_DEFECTO,
): Promise<PaqueteValidado> {
  // 1. Tamaño del paquete.
  if (bytes.length === 0) {
    throw new RechazoLBA('tamano', 'el paquete está vacío');
  }
  if (bytes.length > limites.maxBytesPaquete) {
    throw new RechazoLBA(
      'tamano',
      `el paquete pesa ${bytes.length} bytes y el límite es ${limites.maxBytesPaquete}`,
    );
  }

  // 2-5. Estructura del contenedor: enumerar ANTES de descomprimir nada.
  const registradas: EntradaRegistrada[] = [];
  const vistas: Set<string> = new Set();
  let totalDeclarado = 0;
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes, {
      filter: (info) => {
        const violacion = rutaSegura(info.name);
        if (vistas.has(info.name)) {
          registradas.push({ nombre: info.name, originalSize: info.originalSize, enListaBlanca: false, violacion: 'ruta duplicada' });
          return false;
        }
        vistas.add(info.name);
        if (violacion !== null) {
          registradas.push({ nombre: info.name, originalSize: info.originalSize, enListaBlanca: false, violacion });
          return false;
        }
        if (info.originalSize > limites.maxEntradaDescomprimida) {
          registradas.push({ nombre: info.name, originalSize: info.originalSize, enListaBlanca: true, violacion: 'entrada descomprimida demasiado grande' });
          return false;
        }
        totalDeclarado += info.originalSize;
        registradas.push({ nombre: info.name, originalSize: info.originalSize, enListaBlanca: true });
        return true; // dentro de lista blanca y límites: descomprimir
      },
    });
  } catch (error) {
    throw new RechazoLBA('contenedor', `ZIP ilegible o compresión no soportada (${String(error)})`);
  }

  if (registradas.length === 0) {
    throw new RechazoLBA('contenedor', 'el ZIP no contiene entradas');
  }
  if (registradas.length > limites.maxEntradas) {
    throw new RechazoLBA('entradas', ` ${registradas.length} entradas superan el límite de ${limites.maxEntradas}`);
  }
  if (totalDeclarado > limites.maxTotalDescomprimido) {
    throw new RechazoLBA(
      'entradas',
      `total descomprimido declarado (${totalDeclarado} bytes) supera el límite (${limites.maxTotalDescomprimido})`,
    );
  }
  for (const entrada of registradas) {
    if (entrada.violacion !== undefined) {
      throw new RechazoLBA('entradas', `entrada «${entrada.nombre}»: ${entrada.violacion}`);
    }
  }

  // Archivos requeridos presentes.
  for (const requerida of REQUERIDAS) {
    if (archivos[requerida] === undefined) {
      throw new RechazoLBA('entradas', `falta el archivo requerido «${requerida}»`);
    }
  }

  // 6. Manifiesto: UTF-8 + JSON + esquema Zod + semántica.
  const textoManifiesto = new TextDecoder('utf-8', { fatal: true }).decode(archivos['manifest.json']!);
  let manifiestoJSON: unknown;
  try {
    manifiestoJSON = JSON.parse(textoManifiesto);
  } catch (error) {
    throw new RechazoLBA('manifiesto', `manifest.json no es JSON válido (${String(error)})`);
  }
  const analisis = esquemaManifiestoLBA.safeParse(manifiestoJSON);
  if (!analisis.success) {
    const detalles = analisis.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
    throw new RechazoLBA('manifiesto', `esquema del manifiesto inválido: ${detalles}`);
  }
  const manifiesto: ManifiestoLBA = analisis.data;
  const problemasSemanticos = validarSemanticaManifiesto(manifiesto);
  if (problemasSemanticos.length > 0) {
    throw new RechazoLBA('manifiesto', `regla semántica: ${problemasSemanticos.join('; ')}`);
  }

  // model.onnx solo si runtimeTargets lo declara.
  if (archivos['model.onnx'] !== undefined && !manifiesto.runtimeTargets.includes('onnx')) {
    throw new RechazoLBA('manifiesto', 'model.onnx presente sin «onnx» en runtimeTargets');
  }

  // 7. Formato y cobertura de checksums.
  const textoChecksums = new TextDecoder().decode(archivos['integrity/checksums.sha256']!);
  const checksums = analizarChecksums(textoChecksums);
  const archivosACubrir = Object.keys(archivos).filter((ruta) => ruta !== 'integrity/checksums.sha256').sort();
  const rutasDeclaradas = [...checksums.keys()].sort();
  if (rutasDeclaradas.length !== archivosACubrir.length || rutasDeclaradas.some((r, i) => r !== archivosACubrir[i])) {
    throw new RechazoLBA(
      'integridad',
      `checksums.sha256 debe cubrir exactamente los archivos del paquete: cubre [${rutasDeclaradas.join(', ')}], el paquete tiene [${archivosACubrir.join(', ')}]`,
    );
  }

  // 8. Recalcular y comparar todos los SHA-256.
  for (const [ruta, hashDeclarado] of checksums) {
    const hashReal = await sha256Hex(archivos[ruta]!);
    if (hashReal !== hashDeclarado) {
      throw new RechazoLBA('integridad', `SHA-256 de «${ruta}» no coincide (declarado ${hashDeclarado.slice(0, 12)}…, real ${hashReal.slice(0, 12)}…)`);
    }
  }

  // Coherencia del manifiesto con los pesos declarados.
  for (const [ruta, declarado] of Object.entries(manifiesto.pesos)) {
    const contenido = archivos[ruta];
    if (contenido === undefined) {
      throw new RechazoLBA('manifiesto', `manifiesto.pesos declara «${ruta}» pero el archivo no está en el paquete`);
    }
    if (contenido.length !== declarado.bytes) {
      throw new RechazoLBA('manifiesto', `«${ruta}»: manifiesto declara ${declarado.bytes} bytes, el archivo tiene ${contenido.length}`);
    }
    const hashReal = checksums.get(ruta);
    if (hashReal !== undefined && hashReal !== declarado.sha256) {
      throw new RechazoLBA('manifiesto', `«${ruta}»: sha256 del manifiesto difiere del de checksums.sha256`);
    }
  }
  if (manifiesto.pesos['training/weights.safetensors'] === undefined) {
    throw new RechazoLBA('manifiesto', 'manifiesto.pesos debe declarar training/weights.safetensors');
  }

  // 9. Estructura de pesos vs arquitectura.
  const pesos = archivos['training/weights.safetensors']!;
  let estructura;
  try {
    estructura = analizarEstructura(pesos);
  } catch (error) {
    throw new RechazoLBA('pesos', `weights.safetensors inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
  comprobarTablaArquitectura(estructura, tablaArquitectura(manifiesto.architecture));

  // 9b. Espejos: training/config.json == trainingConfig; linaje coherente.
  const textoConfig = new TextDecoder().decode(archivos['training/config.json']!);
  let configJSON: unknown;
  try {
    configJSON = JSON.parse(textoConfig);
  } catch (error) {
    throw new RechazoLBA('manifiesto', `training/config.json no es JSON válido (${String(error)})`);
  }
  if (manifiesto.trainingConfig === null) {
    throw new RechazoLBA('manifiesto', 'training/config.json presente pero trainingConfig es null');
  }
  if (huellaJSON(configJSON) !== huellaJSON(manifiesto.trainingConfig)) {
    throw new RechazoLBA('manifiesto', 'trainingConfig del manifiesto no es espejo exacto de training/config.json');
  }
  const textoLineage = new TextDecoder().decode(archivos['training/lineage.json']!);
  let linaje: { agentId?: unknown; brainVersion?: unknown; parentModelId?: unknown };
  try {
    linaje = JSON.parse(textoLineage) as typeof linaje;
  } catch (error) {
    throw new RechazoLBA('manifiesto', `training/lineage.json no es JSON válido (${String(error)})`);
  }
  if (linaje.agentId !== manifiesto.agentId || linaje.brainVersion !== manifiesto.brainVersion) {
    throw new RechazoLBA('manifiesto', 'training/lineage.json no coincide con la identidad del manifiesto');
  }
  if (linaje.parentModelId !== manifiesto.parentModelId) {
    throw new RechazoLBA('manifiesto', 'training/lineage.json y manifiesto declaran padres distintos');
  }
  if (manifiesto.evaluationSummary !== null && archivos['evaluation/summary.json'] === undefined) {
    throw new RechazoLBA('manifiesto', 'evaluationSummary declarado sin evaluation/summary.json');
  }
  if (archivos['evaluation/summary.json'] !== undefined) {
    const textoEval = new TextDecoder().decode(archivos['evaluation/summary.json']!);
    let evalJSON: unknown;
    try {
      evalJSON = JSON.parse(textoEval);
    } catch (error) {
      throw new RechazoLBA('manifiesto', `evaluation/summary.json no es JSON válido (${String(error)})`);
    }
    if (huellaJSON(evalJSON) !== huellaJSON(manifiesto.evaluationSummary)) {
      throw new RechazoLBA('manifiesto', 'evaluationSummary del manifiesto no es espejo exacto de evaluation/summary.json');
    }
  }

  // 10. Compatibilidad con el catálogo local de juegos.
  comprobarCompatibilidad(manifiesto);

  const huellaPaquete = await sha256Hex(bytes);
  const mapaArchivos = new Map(Object.entries(archivos));
  return { manifiesto, archivos: mapaArchivos, huellaPaquete, pesosSafetensors: pesos };
}

/** Compatibilidad dura juego⇄modelo (docs/LBA-MODELO.md §8). */
export function comprobarCompatibilidad(manifiesto: ManifiestoLBA): void {
  const entrada = CATALOGO_JUEGOS.find((j) => j.id === manifiesto.gameId);
  if (entrada === undefined) {
    throw new RechazoLBA('compatibilidad', `el juego «${manifiesto.gameId}» no existe en el catálogo local`);
  }
  if (entrada.estado !== 'implementado' || entrada.juego === undefined) {
    throw new RechazoLBA('compatibilidad', `«${entrada.nombre}» está pendiente de implementación en el catálogo local`);
  }
  const juego = entrada.juego;
  if (juego.reglasVersion !== manifiesto.gameRulesVersion) {
    throw new RechazoLBA(
      'compatibilidad',
      `reglas del juego «${manifiesto.gameId}»: el paquete declara versión ${manifiesto.gameRulesVersion}, el catálogo local tiene ${juego.reglasVersion}`,
    );
  }
  const hashEsperado = huellaJSON({
    id: juego.id,
    reglasVersion: juego.reglasVersion,
    dimensiones: juego.dimensiones,
    familia: juego.familia,
  });
  if (hashEsperado !== manifiesto.gameRulesHash) {
    throw new RechazoLBA(
      'compatibilidad',
      `gameRulesHash no coincide: paquete ${manifiesto.gameRulesHash}, catálogo local ${hashEsperado}`,
    );
  }
  const { alto, ancho } = manifiesto.architecture.entrada;
  if (alto !== juego.dimensiones.alto || ancho !== juego.dimensiones.ancho) {
    throw new RechazoLBA(
      'compatibilidad',
      `dimensiones de observación [${alto}×${ancho}] no coinciden con el juego [${juego.dimensiones.alto}×${juego.dimensiones.ancho}]`,
    );
  }
  if (manifiesto.architecture.acciones !== alto * ancho) {
    throw new RechazoLBA(
      'compatibilidad',
      `espacio de acciones (${manifiesto.architecture.acciones}) no coincide con las celdas del tablero (${alto * ancho})`,
    );
  }
}

/** Tipado de salida para pruebas y diagnóstico (esquema del casete de paridad). */
export const esquemaCaseteParidad = z.object({
  descripcion: z.string(),
  arquitectura: esquemaManifiestoLBA.shape.architecture,
  entradas: z.array(z.array(z.number())),
  politicaEsperada: z.array(z.array(z.number())),
  valorEsperado: z.array(z.number()),
});

export type CaseteParidad = z.infer<typeof esquemaCaseteParidad>;
