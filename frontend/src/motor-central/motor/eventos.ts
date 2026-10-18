/**
 * Registro experimental central: eventos con id único, marca temporal y
 * huella de integridad. La deduplicación por id se aplica en el almacén
 * (docs/MODELO_DATOS.md §4).
 */

import { huellaJSON } from './huella';

export type TipoEvento =
  | 'partida'
  | 'evaluacion'
  | 'evaluacion-cancelada'
  | 'validacion'
  | 'error'
  | 'sistema'
  | 'almacenamiento';

export interface Evento {
  readonly id: string;
  readonly tipo: TipoEvento;
  /** Marca temporal ISO-8601 UTC. */
  readonly fecha: string;
  /** Línea legible en español. */
  readonly resumen: string;
  /** Carga útil opcional (registro completo, detalle del fallo…). */
  readonly datos?: unknown;
  /** FNV-1a sobre { tipo, resumen, datos } (limitaciones documentadas). */
  readonly huella: string;
}

/** UUID v4 con degradación determinista razonable si crypto no existe. */
export function generarId(): string {
  const cryptoGlobal = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof cryptoGlobal.crypto?.randomUUID === 'function') {
    return cryptoGlobal.crypto.randomUUID();
  }
  // Respaldo: 128 bits de Date + Math.random (solo entornos sin crypto).
  const parte = (): string => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${Date.now().toString(16)}-${parte()}-${parte()}-${parte()}-${parte()}${Date.now().toString(16).slice(0, 4)}`;
}

export function ahoraISO(): string {
  return new Date().toISOString();
}

export interface EntornoEjecucion {
  readonly plataforma: 'navegador' | 'node';
  readonly descripcion: string;
}

/** Detección del entorno real (navegador vs Node) para los registros. */
export function detectarEntorno(): EntornoEjecucion {
  const globalThis_ = globalThis as {
    process?: { versions?: { node?: string }; version?: string };
    navigator?: { userAgent: string };
  };
  // Node ≥ 21 también define `navigator`; por eso comprobamos `process`
  // primero (los navegadores no lo tienen).
  if (
    typeof globalThis_.process !== 'undefined' &&
    typeof globalThis_.process.versions?.node === 'string'
  ) {
    return {
      plataforma: 'node',
      descripcion: `Node ${globalThis_.process.versions.node}`,
    };
  }
  if (typeof globalThis_.navigator !== 'undefined' && typeof globalThis_.navigator?.userAgent === 'string') {
    return { plataforma: 'navegador', descripcion: globalThis_.navigator.userAgent };
  }
  return { plataforma: 'node', descripcion: 'entorno desconocido sin navigator ni process' };
}

export function crearEvento(
  tipo: TipoEvento,
  resumen: string,
  datos?: unknown,
): Evento {
  const nucleo = datos === undefined ? { tipo, resumen } : { tipo, resumen, datos };
  return {
    id: generarId(),
    tipo,
    fecha: ahoraISO(),
    resumen,
    datos,
    huella: huellaJSON(nucleo),
  };
}
