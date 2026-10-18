/**
 * Almacén local del PROTOTIPO.
 *
 * Guarda partidas y evaluaciones REALES ejecutadas por el motor
 * vendorizado en este navegador, más los eventos de sesión y las
 * personalizaciones locales. NO es el registro experimental del núcleo
 * (IndexedDB con validación Zod): todo lo guardado aquí se muestra en la
 * interfaz con la marca «almacén local del prototipo».
 *
 * Degradación: si localStorage no existe, funciona en memoria durante
 * la sesión (y se declara en Ajustes → Diagnóstico).
 */

import type { RegistroPartida } from '@/motor-central/motor/partida';
import type { RegistroEvaluacion } from '@/motor-central/motor/evaluacion';
import type { PersonalizacionAgente } from '@/lib/contratos';

export interface EventoSesion {
  readonly id: string;
  readonly fecha: string;
  readonly tipo: 'partida-local' | 'evaluacion-local' | 'sistema' | 'importacion' | 'ajuste';
  readonly resumen: string;
  readonly detalle?: string;
}

export interface DatosAlmacen {
  readonly version: 1;
  readonly partidas: readonly RegistroPartida[];
  readonly evaluaciones: readonly RegistroEvaluacion[];
  readonly eventos: readonly EventoSesion[];
  readonly personas: Readonly<Record<string, PersonalizacionAgente>>;
  readonly paquetesLba: readonly {
    readonly id: string;
    readonly fecha: string;
    readonly nombreArchivo: string;
    readonly tamanoBytes: number;
    readonly resultado: string;
  }[];
}

const CLAVE = 'arena-prototipo-v1';
const MAX_PARTIDAS = 60;
const MAX_EVALUACIONES = 12;
const MAX_EVENTOS = 80;

export const VACIO: DatosAlmacen = {
  version: 1,
  partidas: [],
  evaluaciones: [],
  eventos: [],
  personas: {},
  paquetesLba: [],
};

function generarIdLocal(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/* ── Estado interno con caché (referencia estable para useSyncExternalStore) ── */

let caché: DatosAlmacen | null = null;
let respaldoMemoria: DatosAlmacen = VACIO;
const oyentes = new Set<() => void>();

function leerCrudo(): DatosAlmacen | null {
  if (typeof window === 'undefined') return null;
  try {
    const bruto = window.localStorage.getItem(CLAVE);
    if (bruto === null) return VACIO;
    const datos = JSON.parse(bruto) as Partial<DatosAlmacen> | null;
    if (datos === null || typeof datos !== 'object') return VACIO;
    return {
      version: 1,
      partidas: Array.isArray(datos.partidas) ? datos.partidas : [],
      evaluaciones: Array.isArray(datos.evaluaciones) ? datos.evaluaciones : [],
      eventos: Array.isArray(datos.eventos) ? datos.eventos : [],
      personas: datos.personas && typeof datos.personas === 'object' ? datos.personas : {},
      paquetesLba: Array.isArray(datos.paquetesLba) ? datos.paquetesLba : [],
    };
  } catch {
    return null; // datos corruptos: no se mezclan con nada, se ignora el contenido
  }
}

function persistir(datos: DatosAlmacen): void {
  respaldoMemoria = datos;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CLAVE, JSON.stringify(datos));
    }
  } catch {
    // cuota agotada o almacenamiento bloqueado: se conserva en memoria
  }
  caché = datos;
  for (const oyente of oyentes) oyente();
}

export function almacenDisponible(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const prueba = '__arena_prueba__';
    window.localStorage.setItem(prueba, prueba);
    window.localStorage.removeItem(prueba);
    return true;
  } catch {
    return false;
  }
}

/** Instantánea con referencia estable (para useSyncExternalStore). */
export function obtenerAlmacen(): DatosAlmacen {
  if (caché !== null) return caché;
  const leído = leerCrudo();
  caché = leído ?? respaldoMemoria;
  return caché;
}

export function suscribirAlmacen(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/* ── Operaciones ── */

export function guardarPartidaLocal(registro: RegistroPartida): void {
  const actual = obtenerAlmacen();
  persistir({
    ...actual,
    partidas: [registro, ...actual.partidas].slice(0, MAX_PARTIDAS),
    eventos: [
      {
        id: generarIdLocal(),
        fecha: new Date().toISOString(),
        tipo: 'partida-local' as const,
        resumen: `Partida ${registro.juego.id} · ${registro.agentes[0]?.nombre ?? '?'} vs ${registro.agentes[1]?.nombre ?? '?'}`,
        detalle:
          registro.resultado === null
            ? 'Partida inválida (ver errores del registro)'
            : registro.resultado.tipo === 'victoria'
              ? `Victoria del jugador ${registro.resultado.ganador} en ${registro.movimientos.length} jugadas`
              : `Empate en ${registro.movimientos.length} jugadas`,
      },
      ...actual.eventos,
    ].slice(0, MAX_EVENTOS),
  });
}

export function guardarEvaluacionLocal(registro: RegistroEvaluacion): void {
  const actual = obtenerAlmacen();
  persistir({
    ...actual,
    evaluaciones: [registro, ...actual.evaluaciones].slice(0, MAX_EVALUACIONES),
    eventos: [
      {
        id: generarIdLocal(),
        fecha: new Date().toISOString(),
        tipo: 'evaluacion-local' as const,
        resumen: `Evaluación round-robin · ${registro.juego.id}`,
        detalle: `${registro.agentes.length} agentes · ${registro.partidas.length} partidas`,
      },
      ...actual.eventos,
    ].slice(0, MAX_EVENTOS),
  });
}

export function registrarImportacionLba(nombreArchivo: string, tamanoBytes: number, resultado: string): void {
  const actual = obtenerAlmacen();
  persistir({
    ...actual,
    paquetesLba: [
      {
        id: generarIdLocal(),
        fecha: new Date().toISOString(),
        nombreArchivo,
        tamanoBytes,
        resultado,
      },
      ...actual.paquetesLba,
    ].slice(0, 20),
    eventos: [
      {
        id: generarIdLocal(),
        fecha: new Date().toISOString(),
        tipo: 'importacion' as const,
        resumen: `Paquete «${nombreArchivo}» inspeccionado`,
        detalle: resultado,
      },
      ...actual.eventos,
    ].slice(0, MAX_EVENTOS),
  });
}

export function registrarEventoSistema(resumen: string, detalle?: string): void {
  const actual = obtenerAlmacen();
  persistir({
    ...actual,
    eventos: [
      {
        id: generarIdLocal(),
        fecha: new Date().toISOString(),
        tipo: 'sistema' as const,
        resumen,
        detalle,
      },
      ...actual.eventos,
    ].slice(0, MAX_EVENTOS),
  });
}

export function guardarPersona(idAgente: string, persona: PersonalizacionAgente): void {
  const actual = obtenerAlmacen();
  persistir({
    ...actual,
    personas: { ...actual.personas, [idAgente]: persona },
  });
}

export function borrarPersona(idAgente: string): void {
  const actual = obtenerAlmacen();
  const personas = { ...actual.personas };
  delete personas[idAgente];
  persistir({ ...actual, personas });
}

export function borrarAlmacenCompleto(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CLAVE);
    }
  } catch {
    /* ignorar */
  }
  persistir(VACIO);
}

export function usoAlmacen(): { bytes: number; cuotaEstimada: number | null } {
  try {
    if (typeof window === 'undefined') return { bytes: 0, cuotaEstimada: null };
    const bruto = window.localStorage.getItem(CLAVE) ?? '';
    const bytes = new Blob([bruto]).size;
    let cuotaEstimada: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      void navigator.storage.estimate().then((estimacion) => {
        cuotaEstimada = estimacion.quota ?? null;
      });
    }
    return { bytes, cuotaEstimada };
  } catch {
    return { bytes: 0, cuotaEstimada: null };
  }
}
