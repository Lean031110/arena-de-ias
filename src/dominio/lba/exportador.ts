/**
 * Exportador de paquetes .lba — docs/LBA-MODELO.md §11.
 * Recibe registros reales y devuelve bytes + huella SHA-256 del paquete.
 * Nunca inventa campos: sin evaluación real no se escribe evaluation/*.
 */

import { zipSync } from 'fflate';
import { establecerJSON } from '../motor/huella';
import type {
  ConfigEntrenamientoLBA,
  LineageDatosLBA,
  ManifiestoLBA,
  ResumenEvaluacionLBA,
} from './esquema';
import { sha256Hex } from './sha256';

export interface LinajeLBA {
  readonly formatVersion: 1;
  readonly agentId: string;
  readonly brainVersion: string;
  readonly parentModelId: string | null;
  readonly parentPackageSha256: string | null;
  readonly motivo: 'entrenamiento-inicial' | 'rama-de-entrenamiento' | 'clon' | 'reentrenamiento';
  readonly notas: string;
  readonly createdAt: string;
}

export interface SolicitudExportacionLBA {
  readonly manifiesto: Omit<ManifiestoLBA, 'pesos'>;
  readonly pesosSafetensors: Uint8Array;
  readonly configEntrenamiento: ConfigEntrenamientoLBA;
  readonly lineageDatos: LineageDatosLBA;
  readonly linaje: LinajeLBA;
  readonly resumenEvaluacion: ResumenEvaluacionLBA | null;
}

export interface PaqueteExportado {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly tamano: number;
}

/** Construye el paquete .lba completo y verificado internamente. */
export async function exportarPaqueteLBA(solicitud: SolicitudExportacionLBA): Promise<PaqueteExportado> {
  if (solicitud.manifiesto.trainingConfig === null || solicitud.manifiesto.datasetLineage === null) {
    throw new Error('la exportación exige trainingConfig y datasetLineage reales');
  }
  if (solicitud.manifiesto.evaluationSummary !== null && solicitud.resumenEvaluacion === null) {
    throw new Error('evaluationSummary declarado sin resumen real');
  }
  if (solicitud.manifiesto.evaluationSummary === null && solicitud.resumenEvaluacion !== null) {
    throw new Error('resumen real sin evaluationSummary en el manifiesto');
  }

  // Archivos base (sin manifest ni checksums todavía).
  const archivos = new Map<string, Uint8Array>();
  const codificar = (texto: string): Uint8Array => new TextEncoder().encode(texto);
  archivos.set('training/weights.safetensors', solicitud.pesosSafetensors);
  archivos.set('training/config.json', codificar(JSON.stringify(solicitud.configEntrenamiento, null, 2) + '\n'));
  archivos.set(
    'training/lineage.json',
    codificar(JSON.stringify(solicitud.linaje, null, 2) + '\n'),
  );
  if (solicitud.resumenEvaluacion !== null) {
    archivos.set('evaluation/summary.json', codificar(JSON.stringify(solicitud.resumenEvaluacion, null, 2) + '\n'));
  }

  // Manifiesto con pesos declarados (bytes + sha256 reales).
  const hashPesos = await sha256Hex(solicitud.pesosSafetensors);
  const manifiesto: ManifiestoLBA = {
    ...solicitud.manifiesto,
    pesos: {
      'training/weights.safetensors': { bytes: solicitud.pesosSafetensors.length, sha256: hashPesos },
    },
  };
  archivos.set('manifest.json', codificar(establecerJSON(manifiesto)));

  // checksums.sha256: todos los archivos menos él mismo, orden lexicográfico.
  const rutas = [...archivos.keys()].sort();
  const lineas: string[] = [];
  for (const ruta of rutas) {
    const hash = await sha256Hex(archivos.get(ruta)!);
    lineas.push(`${hash}  ${ruta}`);
  }
  archivos.set('integrity/checksums.sha256', codificar(lineas.join('\n') + '\n'));

  const contenidoZip: Record<string, Uint8Array> = {};
  for (const [ruta, contenido] of archivos) {
    contenidoZip[ruta] = contenido;
  }
  const bytes = zipSync(contenidoZip, { level: 6 });
  const sha256 = await sha256Hex(bytes);
  return { bytes, sha256, tamano: bytes.length };
}
