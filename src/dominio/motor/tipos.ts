/**
 * Contratos centrales del motor de juegos por turnos.
 *
 * Principios:
 * - El dominio es puro TypeScript: sin React, sin DOM (regla de arquitectura).
 * - Las operaciones son deterministas ante el mismo estado y acción.
 * - La interfaz NUNCA decide legalidad ni resultados: estos contratos son
 *   la única autoridad (ver docs/ARQUITECTURA.md §3).
 */

import type { Rng } from './rng';

export type Jugador = 1 | 2;

/** 0 = vacía; 1 = jugador 1; 2 = jugador 2. */
export type Marca = 0 | 1 | 2;

export interface ResultadoTerminal {
  readonly tipo: 'victoria' | 'empate';
  /** Presente solo cuando tipo = 'victoria'. */
  readonly ganador?: Jugador;
}

export interface Coordenada {
  readonly fila: number;
  readonly columna: number;
}

/** Vista plana del tablero para la presentación (sin lógica de reglas). */
export interface VistaTablero {
  readonly celdas: readonly Marca[];
  readonly turno: Jugador;
  readonly ultima: Coordenada | null;
}

export interface Simetria {
  readonly id: string;
  readonly descripcion: string;
}

/**
 * Posición de referencia para pruebas: el estado se construye reproduciendo
 * `secuencia` (notaciones) o se proporciona ya codificado en `estadoCodificado`.
 */
export interface PosicionPrueba {
  readonly nombre: string;
  readonly descripcion: string;
  readonly estadoCodificado: string;
  /** Número esperado de jugadas legales (si se conoce). */
  readonly legalesEsperadas?: number;
  /** Resultado esperado si la posición es terminal. */
  readonly resultadoEsperado?: ResultadoTerminal;
  /** Notación de la mejor jugada táctica (ganar o bloquear) si existe. */
  readonly mejorMovimiento?: string;
}

export interface Dimensiones {
  readonly ancho: number;
  readonly alto: number;
}

/** Validación de un movimiento sin excepciones. */
export interface ValidacionMovimiento {
  readonly valido: boolean;
  readonly motivo?: string;
}

/**
 * Contrato que cumple todo juego por turnos del motor.
 * S = tipo del estado, M = tipo del movimiento (ambos objetos planos
 * serializables con JSON).
 */
export interface Juego<S extends object, M extends object> {
  /** Identificador estable (p. ej. `tres-en-raya-3`). */
  readonly id: string;
  /** Versión de las reglas; cambia ante cualquier modificación de reglas. */
  readonly reglasVersion: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly dimensiones: Dimensiones;
  /** Cómo se elige la jugada en la interfaz: por celda o por columna. */
  readonly familia: 'celda' | 'columna';

  crearEstadoInicial(): S;
  jugadorActual(estado: S): Jugador;
  movimientosLegales(estado: S): readonly M[];
  validarMovimiento(estado: S, movimiento: M): ValidacionMovimiento;
  /** Inmutable: devuelve un nuevo estado. Lanza ErrorMovimientoIlegal. */
  aplicarMovimiento(estado: S, movimiento: M): S;
  /**
   * Aplica `movimiento` como si el turno fuera de `jugador` (legalidad
   * independiente del turno en estos juegos). Para análisis hipotéticos
   * (amenazas del rival, mentoría futura).
   */
  simularMovimiento(estado: S, movimiento: M, jugador: Jugador): S;
  esTerminal(estado: S): boolean;
  /** null si el estado no es terminal. */
  resultado(estado: S): ResultadoTerminal | null;
  /** Heurística en [-1, 1] desde la perspectiva de `jugador` (ESTIMACIÓN). */
  evaluar(estado: S, jugador: Jugador): number;
  codificar(estado: S): string;
  decodificar(datos: string): S;
  /** Clave canónica del estado (incluye el turno). */
  claveEstado(estado: S): string;

  /** Simetrías declaradas del juego (índice 0 = identidad). */
  readonly simetrias: readonly Simetria[];
  aplicarSimetria(estado: S, indiceSimetria: number): S;
  aplicarSimetriaAMovimiento(movimiento: M, indiceSimetria: number): M;

  /** Notación textual y su inversa exacta. */
  formatearMovimiento(movimiento: M): string;
  analizarMovimiento(texto: string): M | null;

  /** Vista plana para la interfaz (solo presentación). */
  vista(estado: S): VistaTablero;

  posicionesPrueba(): readonly PosicionPrueba[];
}

/** El rival del jugador indicado. */
export function otroJugador(jugador: Jugador): Jugador {
  return jugador === 1 ? 2 : 1;
}

/* ------------------------------------------------------------------------- */
/* Agentes                                                                    */
/* ------------------------------------------------------------------------- */

export interface ContextoAgente {
  /** RNG con semilla derivada y reproducible para esta jugada. */
  readonly rng: Rng;
  /** Parámetros del agente validados. */
  readonly config: Readonly<Record<string, number | boolean>>;
  /** Índice 0-based de la jugada dentro de la partida. */
  readonly indiceJugada: number;
  /** Semilla raíz de la partida. */
  readonly semilla: number;
}

export interface EstadisticasBusqueda {
  /** Nodos explorados (minimax / solucionador). */
  nodos?: number;
  /** Simulaciones ejecutadas (MCTS). */
  simulaciones?: number;
  /** Profundidad máxima alcanzada. */
  profundidad?: number;
  /** true si el presupuesto de nodos/tiempo limitó la búsqueda. */
  presupuestoAgotado?: boolean;
  /** Tiempo de búsqueda medido (medición directa). */
  tiempoMs: number;
}

export interface Decision<M> {
  readonly movimiento: M;
  readonly estadisticas: EstadisticasBusqueda;
}

/**
 * Agente genérico: funciona sobre cualquier `Juego` sin código por juego.
 */
export interface Agente {
  elegirMovimiento<S extends object, M extends object>(
    juego: Juego<S, M>,
    estado: S,
    contexto: ContextoAgente,
  ): Decision<M>;
}

/**
 * Punto único de borrado de tipos para los catálogos heterogéneos
 * (ADR-002): los registros manejan juegos/agentes de distintos S y M.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ADR-002: borrado confinado a este alias.
export type JuegoConcreto = Juego<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ADR-002.
export type MovimientoConcreto = any;

/** Medición de tiempo robusta (navegador y Node). */
export function ahoraMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
