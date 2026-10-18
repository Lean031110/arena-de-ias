/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONTRATOS DE INTEGRACIÓN — Arena de IAs (prototipo visual)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Regla de oro: TODO lo que ya existe en el núcleo se REEXPORTA 1:1 desde
 * el motor vendorizado (`src/motor-central`, commit a908319). Nunca se
 * redeclara. Los tipos nuevos de este archivo son proyecciones de vista
 * (resúmenes para la interfaz) o contratos propios del simulador táctico,
 * y cada uno documenta su correspondencia con el núcleo.
 *
 * Objetivo final (Fase de integración): que el núcleo central publique sus
 * propios contratos y este archivo pase a reexportarlos sin cambios.
 *
 * Correspondencia con el núcleo (commit a908319):
 * - Juego, Jugador, VistaTablero, EstadisticasBusqueda … → src/dominio/motor/tipos.ts
 * - RegistroPartida, ConfigPartida …………………… → src/dominio/motor/partida.ts
 * - RegistroEvaluacion, IntervaloWilson …………… → src/dominio/motor/evaluacion.ts
 * - DefinicionAgente, ParametroAgente ………………… → src/dominio/agentes/registro.ts
 * - EntradaJuego …………………………………………… → src/dominio/juegos/registro.ts
 */

/* ─────────────────────────────────────────────────────────────────────
 * 1. Reexportaciones 1:1 del motor central (única fuente de verdad)
 * ───────────────────────────────────────────────────────────────────── */

export type {
  Juego,
  JuegoConcreto,
  Jugador,
  Marca,
  ResultadoTerminal,
  VistaTablero,
  Coordenada,
  Dimensiones,
  ValidacionMovimiento,
  Simetria,
  EstadisticasBusqueda,
  Decision,
  ContextoAgente,
  Agente,
} from '@/motor-central/motor/tipos';

export type {
  ConfigPartida,
  ConfigAgentePartida,
  MovimientoRegistrado,
  RegistroPartida,
  ResumenAgentePartida,
  InfoAgenteRegistrado,
} from '@/motor-central/motor/partida';

export type {
  ConfigEvaluacion,
  RegistroEvaluacion,
  ResumenAgenteEvaluacion,
} from '@/motor-central/motor/evaluacion';

export type { IntervaloWilson } from '@/motor-central/motor/estadistica';
export type { Evento, TipoEvento } from '@/motor-central/motor/eventos';

export type {
  DefinicionAgente,
  ParametroAgente,
} from '@/motor-central/agentes/registro';
export type { EntradaJuego } from '@/motor-central/juegos/registro';

export { MOTOR_ORIGEN } from '@/motor-central/version';

/* ─────────────────────────────────────────────────────────────────────
 * 2. Procedencia de datos (docs/MODELO_DATOS.md del núcleo, §1)
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Origen de un dato mostrado, siguiendo la clasificación del modelo de
 * datos del núcleo: medición directa / cálculo sobre registros /
 * estimación / ausente. Se añade «sintetico-demo» para el sandbox de
 * desarrollo (identificado prominentemente en la interfaz).
 */
export type OrigenDato =
  | 'medicion-directa'
  | 'calculo-sobre-registros'
  | 'estimacion'
  | 'ausente'
  | 'sintetico-demo';

/** Dónde vive el registro que respalda el dato. */
export type FuenteDato =
  | 'motor-local-vendorizado' // motor real, ejecutado en el navegador de este prototipo
  | 'almacen-local-prototipo' // partidas/evaluaciones ejecutadas aquí y guardadas en localStorage
  | 'almacen-central' // registro experimental del núcleo (aún no conectado)
  | 'demo-sandbox'; // estructura sintética de validación de diseño

export interface MetricProvenance {
  readonly origen: OrigenDato;
  /** Método o fórmula en lenguaje humano (p. ej. «IC de Wilson 95 % sobre 40 partidas»). */
  readonly metodo: string;
  readonly fuente: FuenteDato;
  /** Identificador del registro de respaldo (partida, evaluación…), si existe. */
  readonly identificador?: string;
  readonly marcaTemporal?: string;
  /** Commit del motor que produjo el dato, cuando aplique. */
  readonly commitMotor?: string;
}

/** Marca visible que acompaña a cada métrica en la interfaz. */
export const ETIQUETA_ORIGEN: Readonly<Record<OrigenDato, string>> = {
  'medicion-directa': 'Medición directa',
  'calculo-sobre-registros': 'Cálculo sobre registros',
  estimacion: 'Estimación',
  ausente: 'Sin datos',
  'sintetico-demo': 'Datos sintéticos de demostración',
};

/* ─────────────────────────────────────────────────────────────────────
 * 3. Estados de servicio y conexión
 * ───────────────────────────────────────────────────────────────────── */

export type EstadoServicio =
  | 'conectado' // servicio real del núcleo respondiendo
  | 'local' // motor real vendorizado, ejecución en navegador
  | 'desconectado' // integración prevista, aún no disponible
  | 'pendiente' // existe en la hoja de ruta del núcleo (Fase 2+)
  | 'error';

export interface EstadoDeServicio {
  readonly id: string;
  readonly nombre: string;
  readonly estado: EstadoServicio;
  readonly detalle: string;
  /** Fase del núcleo que aporta este servicio, si está planificado. */
  readonly fase?: string;
  readonly commit?: string;
}

/* ─────────────────────────────────────────────────────────────────────
 * 4. AgentSummary — proyección de DefinicionAgente (núcleo) + estado local
 * ───────────────────────────────────────────────────────────────────── */

export interface AgentSummary {
  /** Id estable en el catálogo del núcleo (aleatorio, heuristico, minimax, mcts, neural…). */
  readonly id: string;
  readonly nombre: string;
  readonly nivel: number;
  readonly version: string;
  readonly descripcion: string;
  /** humano / disponible / pendiente según el catálogo real. */
  readonly estadoCatalogo: 'disponible' | 'humano' | 'pendiente';
  readonly parametros: readonly import('@/motor-central/agentes/registro').ParametroAgente[];
  /** Cerebro versionado: para agentes clásicos es su versión de algoritmo; para el neuronal, la versión de pesos (inexistente aún). */
  readonly cerebroVersion: string | null;
  /** Juegos compatibles: los agentes del núcleo son genéricos sobre cualquier Juego<S, M>. */
  readonly juegosCompatibles: 'todos-los-implementados';
  /** Estilo declarado en la descripción del catálogo (no medido). */
  readonly estilo: string;
  /** Personalización local (nombre visible / avatar) — solo existe en este prototipo. */
  readonly personalizacion?: PersonalizacionAgente;
}

export interface PersonalizacionAgente {
  readonly nombreVisible: string;
  readonly colorAvatar: string;
}

/* ─────────────────────────────────────────────────────────────────────
 * 5. MatchSummary — proyección de RegistroPartida (núcleo)
 * ───────────────────────────────────────────────────────────────────── */

export interface MatchSummary {
  readonly id: string;
  readonly fecha: string;
  readonly juegoId: string;
  readonly nombreJuego: string;
  readonly reglasVersion: string;
  readonly agentes: readonly string[];
  readonly resultado: import('@/motor-central/motor/tipos').ResultadoTerminal | null;
  readonly validez: 'verificada' | 'invalida';
  readonly numeroJugadas: number;
  readonly duracionMs: number;
  readonly procedencia: MetricProvenance;
}

/* ─────────────────────────────────────────────────────────────────────
 * 6. LbaManifestSummary — paquete «.lba» (formato previsto en Fase 2)
 * ───────────────────────────────────────────────────────────────────── */

export type EstadoValidacionLba =
  | 'sin-validar' // archivo solo seleccionado
  | 'validando' // validador en curso
  | 'valido' // validador real del núcleo lo aceptó
  | 'invalido' // validador real lo rechazó
  | 'validador-no-disponible'; // la Fase 2 del núcleo aún no expone validador

export interface LbaManifestSummary {
  readonly nombreArchivo: string;
  readonly tamanoBytes: number;
  /** Extensión reconocida (solo inspección de nombre; no valida nada). */
  readonly extension: string;
  readonly estadoValidacion: EstadoValidacionLba;
  readonly mensajes: readonly string[];
  /** Campos que el manifiesto .lba debería declarar; null = aún no se puede leer (validador pendiente). */
  readonly manifiesto: {
    readonly versionFormato: string;
    readonly arquitecturaDeclarada: string;
    readonly juegoCompatible: { readonly juegoId: string; readonly reglasVersion: string };
    readonly runtimeRequerido: string;
    readonly integridad: 'no-verificada' | 'verificada' | 'rota';
  } | null;
  readonly resumenEntrenamiento: null; // Fase 2: aún no existen registros de entrenamiento
  readonly resultadosEvaluacion: null; // Fase 2: aún no existen evaluaciones de cerebros
  readonly procedencia: MetricProvenance;
}

/* ─────────────────────────────────────────────────────────────────────
 * 7. TrainingRunSummary — ejecución de entrenamiento (Fase 2 del núcleo)
 * ───────────────────────────────────────────────────────────────────── */

export type EstadoEntrenamiento =
  | 'pendiente'
  | 'en-cola'
  | 'ejecutando'
  | 'pausado'
  | 'cancelado'
  | 'fallido'
  | 'completado';

export interface TrainingRunSummary {
  readonly id: string;
  readonly estado: EstadoEntrenamiento;
  readonly juegoId: string | null;
  readonly modeloOrigenId: string | null;
  readonly presupuesto: { readonly total: number; readonly consumido: number; readonly unidad: string } | null;
  readonly configuracion: Readonly<Record<string, number | boolean>> | null;
  /** Progreso solo si el motor lo comunica (0-1). */
  readonly progreso: number | null;
  readonly perdidas: readonly { readonly paso: number; readonly valor: number }[] | null;
  readonly duracionMs: number | null;
  readonly checkpoints: readonly { readonly id: string; readonly paso: number; readonly guardado: boolean }[] | null;
  readonly resultadoEvaluacion: null; // Fase 2: sin evaluaciones de cerebros aún
  readonly procedencia: MetricProvenance;
}

/* ─────────────────────────────────────────────────────────────────────
 * 8. CandidateMove y SearchTreeNode — exploración de búsqueda
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Jugada candidata. `visitas`, `politica` y `valorEstimado` solo existen
 * cuando el motor expone estadísticas de búsqueda; el núcleo (a908319)
 * publica por jugada: nodos/simulaciones/profundidad/tiempo y la
 * evaluación heurística `juego.evaluar()` (ESTIMACIÓN, no probabilidad).
 */
export interface CandidateMove {
  readonly notacion: string;
  readonly jugador: import('@/motor-central/motor/tipos').Jugador;
  /** Número de visitas del nodo (MCTS); ausente si no procede. */
  readonly visitas: number | null;
  /** Probabilidad de política (red neuronal); ausente hasta Fase 2. */
  readonly politica: number | null;
  /** Valor de la evaluación heurística en [-1, 1] — siempre ESTIMACIÓN. */
  readonly valorEstimado: number | null;
  readonly esElegida: boolean;
}

/**
 * Nodo del árbol de búsqueda. El núcleo aún no expone el árbol completo
 * (solo estadísticas agregadas por jugada); la estructura queda definida
 * aquí para la futura integración y para el sandbox de validación visual.
 */
export interface SearchTreeNode {
  readonly id: string;
  readonly notacion: string | null;
  readonly visitas: number;
  readonly valorMedio: number | null;
  readonly profundidad: number;
  readonly jugador: import('@/motor-central/motor/tipos').Jugador;
  readonly hijos: readonly SearchTreeNode[];
  readonly eventosTacticos: readonly string[];
}

/* ─────────────────────────────────────────────────────────────────────
 * 9. Contrato del simulador táctico 2D — PROPIO del prototipo (v0.1.0)
 *
 * NO forma parte del motor central. El agente principal deberá aportar
 * modelos y adaptadores compatibles con este contrato cuando la simulación
 * competitiva exista en el núcleo.
 * ───────────────────────────────────────────────────────────────────── */

export const SIMULACION_TACTICA = {
  id: 'arena-tactica-2d',
  versionReglas: '0.1.0-sandbox',
  esquemaObservacion: 'estado-plano-json-v1',
  catalogoAcciones: ['mover', 'atacar', 'capturar', 'mantener'] as const,
} as const;

export type AccionTactica = (typeof SIMULACION_TACTICA.catalogoAcciones)[number];

export type TipoTerreno =
  | 'llanura'
  | 'bosque'
  | 'agua'
  | 'montana'
  | 'carretera'
  | 'ruinas';

export type RolUnidad = 'infanteria' | 'explorador' | 'francotirador' | 'blindado';
export type TipoEdificio = 'base' | 'generador' | 'nodo-recursos' | 'punto-estrategico';

export interface FaccionTactica {
  readonly id: 'auriga' | 'vector';
  readonly nombre: string;
  readonly color: string;
  readonly creditos: number;
  readonly unidadesVivas: number;
  readonly zonasControladas: number;
}

export interface EntidadTactica {
  readonly id: string;
  readonly faccion: 'auriga' | 'vector' | 'neutral';
  readonly tipo: 'unidad';
  readonly rol: RolUnidad;
  readonly fila: number;
  readonly columna: number;
  readonly puntosVida: number;
  readonly puntosVidaMax: number;
  readonly ataque: number;
  readonly rango: number;
  readonly puntosAccion: number;
  readonly puntosAccionMax: number;
  readonly movimiento: number;
}

export interface EdificioTactico {
  readonly id: string;
  readonly faccion: 'auriga' | 'vector' | 'neutral';
  readonly tipo: TipoEdificio;
  readonly fila: number;
  readonly columna: number;
  readonly puntosVida: number;
  readonly puntosVidaMax: number;
}

export interface EventoTactico {
  readonly tick: number;
  readonly tipo: 'movimiento' | 'ataque' | 'captura' | 'produccion' | 'economia' | 'fin';
  readonly descripcion: string;
  readonly faccion?: 'auriga' | 'vector' | 'neutral';
}

export interface SimulationState {
  readonly simulacionId: string;
  readonly versionReglas: string;
  readonly tick: number;
  readonly estado: 'ejecutando' | 'pausada' | 'finalizada';
  readonly ancho: number;
  readonly alto: number;
  readonly terreno: readonly TipoTerreno[];
  readonly facciones: readonly FaccionTactica[];
  readonly unidades: readonly EntidadTactica[];
  readonly edificios: readonly EdificioTactico[];
  readonly eventos: readonly EventoTactico[];
  readonly ganador: 'auriga' | 'vector' | null;
  /** Instancias guardadas por tick para reproducir la partida (sandbox visual). */
  readonly instantaneas: number;
}

export interface OrdenTactica {
  readonly tipo: AccionTactica;
  readonly unidadId: string;
  readonly filaObjetivo?: number;
  readonly columnaObjetivo?: number;
  readonly objetivoId?: string;
}

export type SimulationCommand =
  | { readonly tipo: 'iniciar' }
  | { readonly tipo: 'pausar' }
  | { readonly tipo: 'reanudar' }
  | { readonly tipo: 'velocidad'; readonly valor: number }
  | { readonly tipo: 'reiniciar' }
  | { readonly tipo: 'saltar-a-tick'; readonly tick: number }
  | { readonly tipo: 'orden'; readonly orden: OrdenTactica };

/**
 * Adaptador de simulación: la interfaz consume este contrato, nunca la
 * implementación directa. El sandbox visual lo implementa hoy; el motor
 * de simulación del núcleo lo implementará mañana con esta misma forma.
 */
export interface SimulationAdapter {
  readonly simulacionId: string;
  readonly versionReglas: string;
  readonly esquemaObservacion: string;
  readonly catalogoAcciones: readonly AccionTactica[];
  obtenerEstado(): SimulationState;
  despachar(comando: SimulationCommand): void;
  suscribir(oyente: (estado: SimulationState) => void): () => void;
  /** Órdenes legales para la unidad indicada según las reglas del sandbox. */
  ordenesDisponibles(unidadId: string): readonly OrdenTactica[];
}

/* ─────────────────────────────────────────────────────────────────────
 * 10. Utilidades comunes
 * ───────────────────────────────────────────────────────────────────── */

export function commitMotorActual(): string {
  return 'a908319';
}

export function formatearDuracion(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const minutos = Math.floor(ms / 60000);
  const segundos = Math.round((ms % 60000) / 1000);
  return `${minutos} min ${segundos} s`;
}

export function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
