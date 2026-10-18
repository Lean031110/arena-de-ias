/**
 * Registro de agentes: catálogo con niveles, parámetros validables y
 * creación controlada. El agente humano se maneja desde la interfaz
 * (no hay decisión automática) y el neural está pendiente (Fase 2).
 */

import type { Agente } from '../motor/tipos';
import { ErrorConfiguracionInvalida } from '../motor/errores';
import { agenteAleatorio } from './aleatorio';
import { crearAgenteHeuristico } from './heuristico';
import { crearAgenteMinimax, validarConfigMinimax } from './minimax';
import { crearAgenteMCTS, validarConfigMCTS } from './mcts';
import { ID_AGENTE_NEURAL, crearAgenteNeural, validarConfigNeural, type CerebroCargado } from './neural';
import {
  esEquipoCargado,
  equipoCargado,
  registrarEquipoCargado,
  desregistrarEquipoCargado,
  equiposCargados,
  validarEquipo,
} from '../equipos/registro';
import { crearAgenteEquipo } from '../equipos/agenteEquipo';

// Reexportaciones de Fase 3 (equipos) para un solo punto de entrada.
export {
  esEquipoCargado,
  equipoCargado,
  registrarEquipoCargado,
  desregistrarEquipoCargado,
  equiposCargados,
  validarEquipo,
};

export interface ParametroAgente {
  readonly clave: string;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly min: number;
  readonly max: number;
  readonly paso: number;
  readonly defecto: number;
}

export interface DefinicionAgente {
  readonly id: string;
  readonly nombre: string;
  readonly nivel: number;
  readonly version: string;
  readonly descripcion: string;
  readonly estado: 'disponible' | 'humano' | 'pendiente';
  readonly parametros: readonly ParametroAgente[];
}

export const ID_AGENTE_HUMANO = 'humano';

export const CATALOGO_AGENTES: readonly DefinicionAgente[] = [
  {
    id: 'humano',
    nombre: 'Humano',
    nivel: 0,
    version: '1',
    descripcion: 'Tú controlas las jugadas de este bando en partidas interactivas.',
    estado: 'humano',
    parametros: [],
  },
  {
    id: 'aleatorio',
    nombre: 'Agente Aleatorio',
    nivel: 1,
    version: '1',
    descripcion:
      'Referencia mínima: elige uniformemente entre las jugadas legales. ' +
      'Sirve de línea base para todas las comparaciones.',
    estado: 'disponible',
    parametros: [],
  },
  {
    id: 'heuristico',
    nombre: 'Agente Heurístico',
    nivel: 2,
    version: '1',
    descripcion:
      'Gana si puede, bloquea la amenaza inmediata del rival y, en el resto de ' +
      'casos, maximiza la evaluación posicional del juego (estimación).',
    estado: 'disponible',
    parametros: [],
  },
  {
    id: 'minimax',
    nombre: 'Agente Minimax α-β',
    nivel: 3,
    version: '1',
    descripcion:
      'Búsqueda exhaustiva negamax con poda alfa-beta, ordenación de jugadas por ' +
      'evaluación estática y presupuestos estrictos de profundidad, nodos y tiempo.',
    estado: 'disponible',
    parametros: [
      {
        clave: 'profundidad',
        etiqueta: 'Profundidad',
        descripcion: 'Profundidad máxima de la búsqueda negamax.',
        min: 1,
        max: 12,
        paso: 1,
        defecto: 4,
      },
      {
        clave: 'nodoLimite',
        etiqueta: 'Límite de nodos',
        descripcion: 'Techo duro de nodos explorados por jugada.',
        min: 100,
        max: 5000000,
        paso: 100,
        defecto: 60000,
      },
      {
        clave: 'tiempoLimiteMs',
        etiqueta: 'Tiempo límite (ms)',
        descripcion: 'Techo blando de tiempo de búsqueda por jugada.',
        min: 50,
        max: 60000,
        paso: 50,
        defecto: 2000,
      },
    ],
  },
  {
    id: 'mcts',
    nombre: 'Agente MCTS',
    nivel: 4,
    version: '1',
    descripcion:
      'Búsqueda de árbol Monte Carlo con UCT y rollouts aleatorios acotados. ' +
      'El presupuesto de simulaciones se respeta con exactitud.',
    estado: 'disponible',
    parametros: [
      {
        clave: 'simulaciones',
        etiqueta: 'Simulaciones',
        descripcion: 'Número exacto de simulaciones por jugada.',
        min: 1,
        max: 200000,
        paso: 50,
        defecto: 1000,
      },
      {
        clave: 'constanteExploracion',
        etiqueta: 'Constante de exploración',
        descripcion: 'Factor UCT (√2 por defecto); mayor = más exploración.',
        min: 0.1,
        max: 5,
        paso: 0.1,
        defecto: 1.4,
      },
      {
        clave: 'limiteRollout',
        etiqueta: 'Límite de rollout',
        descripcion: 'Máximo de jugadas aleatorias por simulación (0 = automático).',
        min: 0,
        max: 2000,
        paso: 10,
        defecto: 0,
      },
    ],
  },
  {
    id: ID_AGENTE_NEURAL,
    nombre: 'Agente Neuronal',
    nivel: 5,
    version: '1',
    descripcion:
      'Red de política y valor con MCTS-PUCT guiado (estilo AlphaZero). ' +
      'Requiere un cerebro .lba importado y cargado: aparece al cargar uno compatible.',
    estado: 'pendiente',
    parametros: [
      {
        clave: 'simulaciones',
        etiqueta: 'Simulaciones PUCT',
        descripcion: 'Número exacto de simulaciones guiadas por jugada.',
        min: 1,
        max: 100000,
        paso: 50,
        defecto: 200,
      },
      {
        clave: 'cPuct',
        etiqueta: 'Constante PUCT',
        descripcion: 'Peso del prior de política frente al valor.',
        min: 0.1,
        max: 10,
        paso: 0.1,
        defecto: 1.5,
      },
      {
        clave: 'temperatura',
        etiqueta: 'Temperatura',
        descripcion: '0 = determinista (máx. visitas); >0 muestrea visitas^(1/T).',
        min: 0,
        max: 10,
        paso: 0.1,
        defecto: 0,
      },
    ],
  },
];

export function obtenerDefinicionAgente(id: string): DefinicionAgente {
  if (esCerebroCargado(id)) {
    const dinamica = definicionCerebroCargado(id);
    if (dinamica !== null) return dinamica;
  }
  if (esEquipoCargado(id)) {
    const equipo = equipoCargado(id);
    if (equipo !== null) {
      return {
        id,
        nombre: `Equipo ${equipo.nombre}`,
        nivel: 6,
        version: '1',
        descripcion:
          `Equipo de ${equipo.miembros.length} miembros (${equipo.protocolo}, ` +
          `${equipo.politica}) para «${equipo.juegoId}».`,
        estado: 'disponible',
        parametros: [],
      };
    }
  }
  const definicion = CATALOGO_AGENTES.find((agente) => agente.id === id);
  if (definicion === undefined) {
    throw new ErrorConfiguracionInvalida(`no existe el agente «${id}»`);
  }
  return definicion;
}

/** Valida una configuración de agente contra su definición. */
export function validarConfigAgente(
  id: string,
  config: Readonly<Record<string, number | boolean>>,
): string[] {
  if (esCerebroCargado(id)) {
    return validarConfigCerebroCargado(id, config);
  }
  if (esEquipoCargado(id)) {
    // La identidad del equipo (miembros, protocolo, política) vive en su
    // definición registrada; la config de partida no añade nada. Cualquier
    // clave extra es un error de configuración.
    return Object.keys(config).map(
      (clave) => `parámetro desconocido «${clave}» para el equipo «${id}»`,
    );
  }
  const definicion = obtenerDefinicionAgente(id);
  const errores: string[] = [];
  const clavesConocidas = new Set(definicion.parametros.map((parametro) => parametro.clave));
  for (const clave of Object.keys(config)) {
    if (!clavesConocidas.has(clave)) {
      errores.push(`parámetro desconocido «${clave}» para el agente «${id}»`);
    }
  }
  for (const parametro of definicion.parametros) {
    const valor = config[parametro.clave];
    if (valor === undefined) continue;
    if (typeof valor !== 'number') {
      errores.push(`«${parametro.clave}» debe ser numérico`);
      continue;
    }
    if (valor < parametro.min || valor > parametro.max) {
      errores.push(
        `«${parametro.clave}» debe estar en [${parametro.min}, ${parametro.max}] (recibido ${valor})`,
      );
    }
  }
  if (id === 'minimax') errores.push(...validarConfigMinimax(config));
  if (id === 'mcts') errores.push(...validarConfigMCTS(config));
  return errores;
}

/** Configuración por defecto de un agente (de sus parámetros). */
export function configPorDefecto(id: string): Record<string, number | boolean> {
  const definicion = obtenerDefinicionAgente(id);
  const config: Record<string, number | boolean> = {};
  for (const parametro of definicion.parametros) {
    config[parametro.clave] = parametro.defecto;
  }
  return config;
}

/**
 * Crea el agente automático a partir de su id y configuración validada.
 * El RNG por jugada llega dentro del contexto (ver motor/tipos.ts); aquí no
 * hace falta. El humano y el neural no crean agente automático (errores
 * explícitos).
 */
export function crearAgente(
  id: string,
  config: Readonly<Record<string, number | boolean>>,
): Agente {
  if (esCerebroCargado(id)) {
    const errores = validarConfigCerebroCargado(id, config);
    if (errores.length > 0) {
      throw new ErrorConfiguracionInvalida(errores.join('; '));
    }
    const cerebro = cerebrosCargados().find((c) => c.idAgente === id)!.cerebro;
    return crearAgenteNeural(cerebro, {
      simulaciones: config['simulaciones'] as number | undefined,
      cPuct: config['cPuct'] as number | undefined,
      temperatura: config['temperatura'] as number | undefined,
    });
  }
  if (esEquipoCargado(id)) {
    const errores = validarConfigAgente(id, config);
    if (errores.length > 0) {
      throw new ErrorConfiguracionInvalida(errores.join('; '));
    }
    const equipo = equipoCargado(id);
    if (equipo === null) {
      throw new ErrorConfiguracionInvalida(`«${id}» no es un equipo cargado`);
    }
    return crearAgenteEquipo(equipo);
  }
  const errores = validarConfigAgente(id, config);
  if (errores.length > 0) {
    throw new ErrorConfiguracionInvalida(errores.join('; '));
  }
  switch (id) {
    case 'aleatorio':
      return agenteAleatorio;
    case 'heuristico':
      return crearAgenteHeuristico();
    case 'minimax':
      return crearAgenteMinimax({
        profundidad: config['profundidad'] as number | undefined,
        nodoLimite: config['nodoLimite'] as number | undefined,
        tiempoLimiteMs: config['tiempoLimiteMs'] as number | undefined,
      });
    case 'mcts':
      return crearAgenteMCTS({
        simulaciones: config['simulaciones'] as number | undefined,
        constanteExploracion: config['constanteExploracion'] as number | undefined,
        limiteRollout:
          (config['limiteRollout'] as number | undefined) === 0
            ? undefined
            : (config['limiteRollout'] as number | undefined),
      });
    case ID_AGENTE_HUMANO:
      throw new ErrorConfiguracionInvalida(
        'el agente humano se controla desde la interfaz; no tiene decisión automática',
      );
    default:
      throw new ErrorConfiguracionInvalida(
        `el agente «${id}» está pendiente de implementación (Fase 2)`,
      );
  }
}

/** Agentes automáticos disponibles (para selectores). */
export function agentesDisponibles(): readonly DefinicionAgente[] {
  return CATALOGO_AGENTES.filter(
    (agente) => agente.estado === 'disponible' || agente.estado === 'humano',
  );
}

/* ------- Cerebros neuronales cargados en runtime (Fase 2, ADR-015) ------- */

/** Cerebro neural disponible para partidas, con su identidad completa. */
export interface CerebroEnRegistro {
  /** Clave de agente usable en configs de partida/evaluación. */
  readonly idAgente: string; // «neural:<agentId>@<brainVersion>»
  readonly cerebro: CerebroCargado;
}

const CEREBROS_CARGADOS = new Map<string, CerebroCargado>();

/** Registra un cerebro cargado; devuelve la clave de agente resultante. */
export function registrarCerebroCargado(cerebro: CerebroCargado): string {
  const clave = `${ID_AGENTE_NEURAL}:${cerebro.agentId}@${cerebro.brainVersion}`;
  CEREBROS_CARGADOS.set(clave, cerebro);
  return clave;
}

/** Da de baja un cerebro cargado (la persistencia no se toca aquí). */
export function desregistrarCerebroCargado(clave: string): boolean {
  return CEREBROS_CARGADOS.delete(clave);
}

/** Lista de cerebros cargados actualmente. */
export function cerebrosCargados(): readonly CerebroEnRegistro[] {
  return [...CEREBROS_CARGADOS.entries()].map(([idAgente, cerebro]) => ({ idAgente, cerebro }));
}

/** ¿La clave corresponde a un cerebro neural cargado? */
export function esCerebroCargado(id: string): boolean {
  return CEREBROS_CARGADOS.has(id);
}

/** Definición dinámica de un agente neural cargado (para la interfaz). */
export function definicionCerebroCargado(id: string): DefinicionAgente | null {
  const cerebro = CEREBROS_CARGADOS.get(id);
  if (cerebro === undefined) return null;
  const base = CATALOGO_AGENTES.find((a) => a.id === ID_AGENTE_NEURAL);
  return {
    id,
    nombre: `${base?.nombre ?? 'Agente Neuronal'} ${cerebro.agentId}@${cerebro.brainVersion}`,
    nivel: 5,
    version: cerebro.brainVersion,
    descripcion: `Cerebro .lba cargado para «${cerebro.gameId}» (arquitectura ${cerebro.architecture.tipo}).`,
    estado: 'disponible',
    parametros: base?.parametros ?? [],
  };
}

/** Valida la configuración de un agente neural cargado. */
export function validarConfigCerebroCargado(
  id: string,
  config: Readonly<Record<string, number | boolean>>,
): string[] {
  const cerebro = CEREBROS_CARGADOS.get(id);
  if (cerebro === undefined) {
    return [`«${id}» no es un cerebro cargado`];
  }
  return validarConfigNeural(config);
}
