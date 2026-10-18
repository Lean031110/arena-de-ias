/**
 * Esquema Zod del manifiesto .lba v1 — única fuente de la verdad del contrato
 * (docs/LBA-MODELO.md §3). El exportador Python genera JSON conforme a este
 * mismo contrato; cualquier divergencia la detecta la importación.
 */

import { z } from 'zod';

const hex64 = /^[0-9a-f]{64}$/;
const hex8 = /^[0-9a-f]{8}$/;
const idAgente = /^[a-z0-9][a-z0-9-]{0,63}$/;
const versionCerebro = /^\d+\.\d+\.\d+$/;
const iso8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Arquitecturas soportadas por el runtime local (catálogo de red.ts). */
export const ARQUITECTURAS_SOPORTADAS = ['conv-politica-valor-v1'] as const;

export const esquemaArquitectura = z
  .object({
    tipo: z.enum(ARQUITECTURAS_SOPORTADAS),
    entrada: z
      .object({
        alto: z.number().int().min(1).max(15),
        ancho: z.number().int().min(1).max(15),
        canales: z.literal(2),
      })
      .strict(),
    acciones: z.number().int().min(1).max(225),
  })
  .strict();

export const esquemaConfigEntrenamiento = z
  .object({
    tipo: z.literal('autojuego-supervisado-v1'),
    semilla: z.number().int().min(0),
    iteraciones: z.number().int().min(0),
    partidasPorIteracion: z.number().int().min(1),
    simulacionesMCTS: z.number().int().min(1),
    temperatura: z.number().min(0),
    dirichletAlfa: z.number().positive(),
    dirichletEpsilon: z.number().min(0).max(1),
    tamanoLote: z.number().int().min(1),
    tasaAprendizaje: z.number().positive(),
    pasosPorIteracion: z.number().int().min(1),
    bufferCapacidad: z.number().int().min(1),
    dispositivo: z.string().min(1),
    versionCodigo: z.string().min(1),
  })
  .strict();

export const esquemaLineageDatos = z
  .object({
    origen: z.enum(['autojuego', 'partidas-importadas']),
    partidas: z.number().int().min(0),
    ejemplos: z.number().int().min(0),
    semilla: z.number().int().min(0),
    rival: z.string().nullable(),
    buffer: z.string().min(1),
  })
  .strict();

export const esquemaResumenEvaluacion = z
  .object({
    fecha: z.string().regex(iso8601),
    juegoId: z.string().min(1),
    gameRulesVersion: z.string().min(1),
    oponentes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            descripcion: z.string().min(1),
            presupuesto: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    partidasPorOponente: z.number().int().min(1),
    resultados: z
      .array(
        z
          .object({
            oponenteId: z.string().min(1),
            victorias: z.number().int().min(0),
            empates: z.number().int().min(0),
            derrotas: z.number().int().min(0),
            puntuacion: z.number().min(0).max(1),
            ic95: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
          })
          .strict(),
      )
      .min(1),
    conclusion: z.string().min(1),
  })
  .strict();

export const esquemaEntradaPesos = z
  .object({
    bytes: z.number().int().min(1),
    sha256: z.string().regex(hex64),
  })
  .strict();

export const esquemaManifiestoLBA = z
  .object({
    formatVersion: z.literal(1),
    agentId: z.string().regex(idAgente),
    brainVersion: z.string().regex(versionCerebro),
    parentModelId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}@\d+\.\d+\.\d+$/).nullable(),
    createdAt: z.string().regex(iso8601),
    gameId: z.string().min(1),
    gameRulesVersion: z.string().min(1),
    gameRulesHash: z.string().regex(hex8),
    observationSchemaVersion: z.number().int().min(1),
    actionSpaceVersion: z.number().int().min(1),
    architecture: esquemaArquitectura,
    weightsFormat: z.literal('safetensors'),
    runtimeTargets: z.array(z.enum(['ts-puro', 'onnx'])).min(1),
    trainingRunId: z.string().min(1).nullable(),
    trainingConfig: esquemaConfigEntrenamiento.nullable(),
    datasetLineage: esquemaLineageDatos.nullable(),
    evaluationRunIds: z.array(z.string().min(1)),
    evaluationSummary: esquemaResumenEvaluacion.nullable(),
    pesos: z.record(z.string(), esquemaEntradaPesos),
  })
  .strict();

export type ManifiestoLBA = z.infer<typeof esquemaManifiestoLBA>;
export type ConfigEntrenamientoLBA = z.infer<typeof esquemaConfigEntrenamiento>;
export type LineageDatosLBA = z.infer<typeof esquemaLineageDatos>;
export type ResumenEvaluacionLBA = z.infer<typeof esquemaResumenEvaluacion>;
export type ArquitecturaLBA = z.infer<typeof esquemaArquitectura>;

/** Reglas semánticas que el esquema no puede expresar (docs/LBA-MODELO.md §3). */
export function validarSemanticaManifiesto(m: ManifiestoLBA): string[] {
  const problemas: string[] = [];
  if (!m.runtimeTargets.includes('ts-puro') && m.runtimeTargets.includes('onnx')) {
    // v1: permitido declararlo, el importador informará de la disponibilidad real.
    problemas.push('runtimeTargets no incluye «ts-puro»: ningún runtime local garantizado');
  }
  if (m.trainingRunId === null && m.trainingConfig !== null) {
    problemas.push('trainingConfig presente sin trainingRunId');
  }
  if (m.evaluationRunIds.length === 0 && m.evaluationSummary !== null) {
    problemas.push('evaluationSummary presente sin evaluationRunIds');
  }
  if (m.evaluationSummary !== null && m.evaluationSummary.juegoId !== m.gameId) {
    problemas.push('evaluationSummary.juegoId difiere del gameId del manifiesto');
  }
  return problemas;
}
