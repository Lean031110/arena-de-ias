/**
 * Nivel 5 — Contrato del agente neuronal (política + valor).
 *
 * ESTADO: PENDIENTE DE IMPLEMENTACIÓN (Fase 2, ADR-008).
 * No existe ninguna instancia con pesos, ni datos de entrenamiento, ni
 * métricas. Este módulo define únicamente el contrato que la Fase 2 debe
 * cumplir; no se incluye ninguna función que simule estar entrenada.
 */

import type { Agente } from '../motor/tipos';

/**
 * Salida de inferencia de una red de política y valor.
 * `politica` son puntajes por movimiento legal (softmax de la red) y
 * `valor` es la estimación del resultado desde el jugador con turno.
 * Ambos son ESTIMACIONES, no probabilidades garantizadas.
 */
export interface InferenciaNeural {
  readonly politica: readonly number[];
  readonly valor: number;
}

/**
 * Agente con cerebro versionado. La Fase 2 implementará:
 * - red de política y valor (TensorFlow.js con degradación a TypeScript
 *   puro/WASM según capacidades),
 * - MCTS guiado por la política,
 * - entrenamiento por autojuego con buffer y simetrías,
 * - versionado y promoción según docs/CRITERIOS_ACEPTACION.md.
 */
export interface AgenteNeural extends Agente {
  readonly cerebroVersion: string;
  inferir(estado: unknown): InferenciaNeural;
}

/** Identificador reservado del agente neuronal en el catálogo. */
export const ID_AGENTE_NEURAL = 'neural';
