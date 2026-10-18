/**
 * Fase 3 — Equipos de IAs: tipos del dominio.
 *
 * Un EQUIPO es un conjunto de miembros que juegan en un mismo bando bajo un
 * PROTOCOLO explícito de toma de decisiones:
 *
 * - «consulta»: en cada jugada del bando, TODOS los miembros analizan la
 *   posición y presentan su propuesta; la decisión final sale de una
 *   POLÍTICA DE AGREGACIÓN documentada (votación, ponderación por resultados
 *   medidos u otra futura). Los desacuerdos se resuelven así, de forma
 *   determinista y trazable.
 * - «turno-alternado»: los miembros alternan la DECISIÓN completa de cada
 *   jugada del bando (el miembro A decide las jugadas impares del bando —
 *   1.ª, 3.ª, 5.ª…— y el B las pares). No hay desacuerdo posible por
 *   construcción; el estado de la partida es el del motor, compartido.
 *
 * Presupuestos: cada miembro declara su propio presupuesto de pensamiento
 * (config del agente: simulaciones, profundidad…). El presupuesto TOTAL del
 * equipo es la suma de los de sus miembros por jugada (o por jugada que le
 * toca decidir, en turno-alternado): la comparación individual-vs-equipo con
 * presupuestos COMPARABLES usa esa suma (ver scripts/evaluar-equipos.ts).
 */

import type { ConfigAgentePartida } from '../motor/partida';
import type { EstadisticasBusqueda } from '../motor/tipos';

/** Protocolo de decisión del equipo (documentado arriba). */
export type ProtocoloEquipo = 'consulta' | 'turno-alternado';

/**
 * Política de agregación de propuestas (solo protocolo «consulta»).
 * - «votacion»: cada propuesta vale un voto; gana el movimiento más votado.
 * - «ponderado»: cada propuesta vale su PESO (derivado de resultados MEDIDOS
 *   del miembro: puntuación contra una referencia común); gana el movimiento
 *   con mayor peso acumulado.
 * Los empates se rompen de forma DETERMINISTA: menor notación canónica
 * (orden lexicográfico) — documentado y probado.
 */
export type PoliticaAgregacion = 'votacion' | 'ponderado';

/** Miembro de un equipo: identidad de agente + presupuesto + peso medido. */
export interface MiembroEquipo {
  readonly alias: string;
  /** Agente del catálogo o cerebro cargado (clave «neural:…»). */
  readonly agente: ConfigAgentePartida;
  /**
   * Peso para la política «ponderado»: DEBE provenir de resultados medidos
   * (puntuación real contra una referencia común). Se valida ≥ 0; 0 = el
   * miembro propone pero no pesa (útil para observadores).
   */
  readonly pesoMedido: number;
}

/** Definición completa de un equipo. */
export interface Equipo {
  readonly nombre: string;
  readonly juegoId: string;
  readonly protocolo: ProtocoloEquipo;
  readonly politica: PoliticaAgregacion;
  readonly miembros: readonly [MiembroEquipo, MiembroEquipo, ...MiembroEquipo[]];
}

/** Propuesta de un miembro sobre una posición concreta. */
export interface PropuestaMiembro {
  readonly alias: string;
  /** Clave de agente usada (p. ej. «mcts» o «neural:red-ter-3@1.0.1»). */
  readonly agenteId: string;
  /** Versión del cerebro cuando el miembro es neuronal («—» si no). */
  readonly versionCerebro: string;
  /** Movimiento propuesto, formateado por el juego. */
  readonly notacion: string;
  /** Presupuesto realmente consumido (nodos/simulaciones/tiempo medido). */
  readonly estadisticas: EstadisticasBusqueda;
}

/** Decisión final del equipo para una posición. */
export interface DecisionEquipo {
  readonly notacion: string;
  readonly politica: PoliticaAgregacion;
  readonly protocolo: ProtocoloEquipo;
  /** Detalle del recuento (votos o peso acumulado por notación). */
  readonly recuento: readonly RecuentoNotacion[];
  /** Miembros cuya propuesta coincide con la decisión. */
  readonly elegidoPor: readonly string[];
  readonly estadisticas: EstadisticasBusqueda;
}

export interface RecuentoNotacion {
  readonly notacion: string;
  /** Votos (votacion) o peso acumulado (ponderado). */
  readonly valor: number;
  readonly votantes: readonly string[];
}

/** Registro completo de una consulta sobre una posición. */
export interface RegistroConsulta {
  readonly juegoId: string;
  readonly estadoCodificado: string;
  readonly equipo: string;
  readonly protocolo: ProtocoloEquipo;
  readonly politica: PoliticaAgregacion;
  readonly propuestas: readonly PropuestaMiembro[];
  readonly decision: DecisionEquipo;
  /** Presupuesto total de pensamiento consumido por la consulta. */
  readonly presupuestoTotal: {
    readonly nodos: number;
    readonly simulaciones: number;
    readonly tiempoMs: number;
    readonly miembrosQueDecidieron: number;
  };
  readonly fechaISO: string;
}

/** Opciones de la consulta (inyectables para pruebas). */
export interface OpcionesConsulta {
  /** Semilla base para derivar el RNG de cada miembro (reproducible). */
  readonly semilla: number;
  /** Índice de jugada dentro de la partida (para derivar semillas). */
  readonly indiceJugada: number;
  /**
   * Índice relativo de la jugada DEL BANDO (turno-alternado decide quién
   * juega): 1.ª jugada del bando = 0, 2.ª = 1, etc.
   */
  readonly indiceJugadaDelBando: number;
}
