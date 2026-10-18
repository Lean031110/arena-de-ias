/**
 * Fase 3 — Plantel: registro creciente de IAs incorporables a equipos.
 *
 * Reglas de integridad (duras):
 * - Toda entrada procede de una fuente REAL: un agente del catálogo (validado
 *   contra CATALOGO_AGENTES) o un CEREBRO .lba importado y validado (la capa
 *   de aplicación exige el paquete real con huella; aquí se exige que la
 *   identidad declare esa huella). NINGÚN modelo «preentrenado» sin artefacto
 *   verificable puede entrar al plantel: la entrada de cerebro sin huella se
 *   rechaza.
 * - El linaje se conserva: cada cerebro declara su padre (parentModelId) y el
 *   historial de versiones se RECONSTRUYE desde las entradas reales (no se
 *   declara).
 * - Las evaluaciones son MEDIDAS: se añaden como resúmenes con fecha, rival,
 *   tamaño de muestra y puntuación; nunca se inventan. El peso de agregación
 *   «ponderado» se DERIVA de ellas (sin evaluaciones → peso 0: propone pero
 *   no pesa — ningún número inventado).
 */

import { CATALOGO_AGENTES } from '../agentes/registro';

/** Identidad de una entrada del plantel. */
export type IdentidadPlantel =
  | {
      readonly tipo: 'catalogo';
      readonly agenteId: string;
      readonly config: Readonly<Record<string, number | boolean>>;
    }
  | {
      readonly tipo: 'cerebro';
      readonly agentId: string;
      readonly brainVersion: string;
      readonly gameId: string;
      /** Huella sha256 del paquete .lba real del que procede (obligatoria). */
      readonly huella: string;
      /** Padre declarado por el manifiesto («—» si es raíz). */
      readonly parentModelId: string | null;
      /** Run de entrenamiento que lo produjo (trazabilidad). */
      readonly trainingRunId: string | null;
    };

/** Resumen MEDIDO de una evaluación (nunca declarado sin datos). */
export interface ResumenEvaluacion {
  readonly fechaISO: string;
  readonly rival: string;
  readonly partidas: number;
  readonly victorias: number;
  readonly empates: number;
  readonly derrotas: number;
  readonly puntuacion: number;
  readonly ic95Inferior: number;
  readonly ic95Superior: number;
}

/** Entrada del plantel. */
export interface EntradaPlantel {
  /** Identificador determinista de la identidad (ver idDeIdentidad). */
  readonly id: string;
  readonly alias: string;
  /** Juego al que se incorpora (ancla de compatibilidad de equipos). */
  readonly juegoId: string;
  readonly identidad: IdentidadPlantel;
  readonly incorporadoISO: string;
  readonly evaluaciones: readonly ResumenEvaluacion[];
}

const FORMATO_HUELLA = /^[0-9a-f]{64}$/;

/** Valida una incorporación de catálogo; devuelve errores. */
export function erroresEntradaCatalogo(
  alias: string,
  agenteId: string,
  juegoId: string,
): string[] {
  const errores: string[] = [];
  if (alias.trim().length < 1) errores.push('falta el alias');
  if (alias.length > 32) errores.push('alias demasiado largo (máx. 32)');
  if (juegoId.trim() === '') errores.push('falta el juego');
  const definicion = CATALOGO_AGENTES.find((a) => a.id === agenteId);
  if (definicion === undefined) {
    errores.push(`el agente «${agenteId}» no existe en el catálogo`);
  } else if (definicion.estado !== 'disponible') {
    errores.push(`el agente «${agenteId}» no es automático disponible`);
  }
  return errores;
}

/** Valida una incorporación de cerebro; devuelve errores. */
export function erroresEntradaCerebro(
  alias: string,
  ident: {
    agentId: string;
    brainVersion: string;
    gameId: string;
    huella: string;
  },
  juegoId: string,
): string[] {
  const errores: string[] = [];
  if (alias.trim().length < 1) errores.push('falta el alias');
  if (alias.length > 32) errores.push('alias demasiado largo (máx. 32)');
  if (juegoId.trim() === '') errores.push('falta el juego');
  if (ident.agentId.trim() === '') errores.push('falta el agentId del cerebro');
  if (!/^\d+\.\d+\.\d+$/.test(ident.brainVersion)) {
    errores.push(`versión de cerebro inválida: «${ident.brainVersion}» (X.Y.Z)`);
  }
  if (!FORMATO_HUELLA.test(ident.huella)) {
    errores.push('huella sha256 ausente o mal formada: sin artefacto real no hay entrada');
  }
  if (ident.gameId !== juegoId) {
    errores.push(
      `el cerebro es de «${ident.gameId}» y se intenta incorporar a «${juegoId}»`,
    );
  }
  return errores;
}

/** Identificador determinista de una identidad (mismo cerebro = mismo id). */
export function idDeIdentidad(identidad: IdentidadPlantel): string {
  const datos = JSON.stringify(
    identidad.tipo === 'catalogo'
      ? { tipo: 'catalogo', agenteId: identidad.agenteId }
      : {
          tipo: 'cerebro',
          agentId: identidad.agentId,
          brainVersion: identidad.brainVersion,
          huella: identidad.huella,
        },
  );
  // FNV-1a de 32 bits sobre la identidad canónica (id corta y estable).
  let hash = 0x811c9dc5;
  for (let i = 0; i < datos.length; i++) {
    hash ^= datos.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${identidad.tipo}:${hash.toString(16).padStart(8, '0')}`;
}

/** Crea una entrada de catálogo (validada); lanza con los errores. */
export function crearEntradaCatalogo(
  alias: string,
  agenteId: string,
  config: Readonly<Record<string, number | boolean>>,
  juegoId: string,
  incorporadoISO: string,
): EntradaPlantel {
  const errores = erroresEntradaCatalogo(alias, agenteId, juegoId);
  if (errores.length > 0) {
    throw new Error(errores.join('; '));
  }
  const identidad: IdentidadPlantel = { tipo: 'catalogo', agenteId, config };
  return {
    id: idDeIdentidad(identidad),
    alias,
    juegoId,
    identidad,
    incorporadoISO,
    evaluaciones: [],
  };
}

/** Crea una entrada de cerebro (validada); lanza con los errores. */
export function crearEntradaCerebro(
  alias: string,
  ident: {
    agentId: string;
    brainVersion: string;
    gameId: string;
    huella: string;
    parentModelId: string | null;
    trainingRunId: string | null;
  },
  juegoId: string,
  incorporadoISO: string,
): EntradaPlantel {
  const errores = erroresEntradaCerebro(alias, ident, juegoId);
  if (errores.length > 0) {
    throw new Error(errores.join('; '));
  }
  const identidad: IdentidadPlantel = { tipo: 'cerebro', ...ident };
  return {
    id: idDeIdentidad(identidad),
    alias,
    juegoId,
    identidad,
    incorporadoISO,
    evaluaciones: [],
  };
}

/**
 * Historial de versiones de un agentId de cerebro RECONSTRUIDO desde las
 * entradas reales del plantel: cadena por parentModelId, de la raíz a la
 * versión más reciente. Las entradas huérfanas (padre no presente) se
 * devuelven aparte.
 */
export function historialVersiones(
  entradas: readonly EntradaPlantel[],
  agentId: string,
): { cadena: EntradaPlantel[]; huerfanas: EntradaPlantel[] } {
  const cerebros = entradas.filter(
    (e) => e.identidad.tipo === 'cerebro' && e.identidad.agentId === agentId,
  );
  const porModelo = new Map<string, EntradaPlantel>();
  for (const entrada of cerebros) {
    if (entrada.identidad.tipo === 'cerebro') {
      porModelo.set(`${agentId}@${entrada.identidad.brainVersion}`, entrada);
    }
  }
  const huerfanas: EntradaPlantel[] = [];
  for (const entrada of cerebros) {
    if (entrada.identidad.tipo !== 'cerebro') continue;
    const padre = entrada.identidad.parentModelId;
    if (padre !== null && !porModelo.has(padre)) {
      huerfanas.push(entrada);
    }
  }
  // Raíz EXACTA: padre nulo (las de padre ausente son huérfanas, no raíces).
  const raices = cerebros.filter((e) => {
    if (e.identidad.tipo !== 'cerebro') return false;
    return e.identidad.parentModelId === null;
  });
  // Hijos por padre (solo aristas hacia padres PRESENTES).
  const hijosDe = new Map<string, EntradaPlantel[]>();
  for (const entrada of cerebros) {
    if (entrada.identidad.tipo !== 'cerebro') continue;
    const padre = entrada.identidad.parentModelId;
    if (padre === null || !porModelo.has(padre)) continue;
    const lista = hijosDe.get(padre) ?? [];
    lista.push(entrada);
    hijosDe.set(padre, lista);
  }
  const compararVersion = (a: EntradaPlantel, b: EntradaPlantel): number => {
    const va = (a.identidad as { brainVersion: string }).brainVersion
      .split('.')
      .map((x) => Number.parseInt(x, 10));
    const vb = (b.identidad as { brainVersion: string }).brainVersion
      .split('.')
      .map((x) => Number.parseInt(x, 10));
    for (let i = 0; i < 3; i++) {
      if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (va[i] ?? 0) - (vb[i] ?? 0);
    }
    return 0;
  };
  const versionDe = (e: EntradaPlantel): string =>
    (e.identidad as { brainVersion: string }).brainVersion;
  const cadena: EntradaPlantel[] = [];
  const vistas = new Set<string>();
  const recorrer = (entrada: EntradaPlantel, profundidad: number): void => {
    if (profundidad > 64) return; // defensa ante ciclos corruptos
    if (vistas.has(versionDe(entrada))) return;
    vistas.add(versionDe(entrada));
    cadena.push(entrada);
    const clave = `${agentId}@${versionDe(entrada)}`;
    const hijos = [...(hijosDe.get(clave) ?? [])].sort(compararVersion);
    for (const hijo of hijos) {
      recorrer(hijo, profundidad + 1);
    }
  };
  for (const raiz of [...raices].sort(compararVersion)) {
    recorrer(raiz, 0);
  }
  // Las huérfanas EXISTEN: al final del historial, ordenadas por versión.
  for (const huerfana of [...huerfanas].sort(compararVersion)) {
    if (!vistas.has(versionDe(huerfana))) {
      vistas.add(versionDe(huerfana));
      cadena.push(huerfana);
    }
  }
  return { cadena, huerfanas };
}

/**
 * Peso medido para la política «ponderado» de equipos: MEDIA de las
 * puntuaciones registradas (todas reales). Sin evaluaciones → 0 (propone
 * pero no pesa: ningún número inventado). Documentado en FASE-3.md.
 */
export function pesoMedido(entrada: EntradaPlantel): number {
  if (entrada.evaluaciones.length === 0) return 0;
  const suma = entrada.evaluaciones.reduce((total, e) => total + e.puntuacion, 0);
  return Number((suma / entrada.evaluaciones.length).toFixed(4));
}

/** Añade un resumen MEDIDO de evaluación (entrada inmutable: copia). */
export function conEvaluacion(
  entrada: EntradaPlantel,
  resumen: ResumenEvaluacion,
): EntradaPlantel {
  if (resumen.partidas <= 0) {
    throw new Error('una evaluación registrada exige al menos una partida real');
  }
  if (resumen.victorias + resumen.empates + resumen.derrotas !== resumen.partidas) {
    throw new Error('el desglose V/E/D no cuadra con el total de partidas');
  }
  return { ...entrada, evaluaciones: [...entrada.evaluaciones, resumen] };
}
