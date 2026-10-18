/**
 * Esquemas Zod para validar los registros en los bordes de confianza
 * (lectura de IndexedDB, entradas de la interfaz). La decisión de validar
 * aquí y no en el camino caliente del dominio está documentada en
 * docs/MODELO_DATOS.md §6.
 */

import { z } from 'zod';
import type { RegistroEvaluacion } from '../dominio/motor/evaluacion';
import type { RegistroPartida } from '../dominio/motor/partida';
import type { RegistroEventoExterno } from './tipos';

const esquemaJugador = z.union([z.literal(1), z.literal(2)]);

export const esquemaEstadisticas = z.object({
  nodos: z.number().optional(),
  simulaciones: z.number().optional(),
  profundidad: z.number().optional(),
  presupuestoAgotado: z.boolean().optional(),
  tiempoMs: z.number(),
});

export const esquemaResultado = z.union([
  z.object({ tipo: z.literal('victoria'), ganador: esquemaJugador }),
  z.object({ tipo: z.literal('empate') }),
]);

const esquemaInfoAgente = z.object({
  id: z.string().min(1),
  nombre: z.string(),
  version: z.string(),
  config: z.record(z.string(), z.union([z.number(), z.boolean()])),
});

const esquemaResumenAgente = z.object({
  jugadas: z.number().int().nonnegative(),
  nodosTotales: z.number().optional(),
  simulacionesTotales: z.number().optional(),
  profundidadMaxima: z.number().optional(),
  tiempoTotalMs: z.number(),
  presupuestoAgotado: z.boolean(),
});

export const esquemaRegistroPartida = z.object({
  id: z.string().min(1),
  fecha: z.string().min(1),
  entorno: z.object({
    plataforma: z.enum(['navegador', 'node']),
    descripcion: z.string(),
  }),
  juego: z.object({ id: z.string().min(1), reglasVersion: z.string().min(1) }),
  semilla: z.number().int().nonnegative(),
  agentes: z.tuple([esquemaInfoAgente, esquemaInfoAgente]),
  movimientos: z.array(
    z.object({
      indice: z.number().int().nonnegative(),
      jugador: esquemaJugador,
      notacion: z.string().min(1),
      estadisticas: esquemaEstadisticas,
    }),
  ),
  resultado: esquemaResultado.nullable(),
  validez: z.enum(['verificada', 'invalida']),
  errores: z.array(z.string()),
  duracionMs: z.number().nonnegative(),
  resumenAgentes: z.tuple([esquemaResumenAgente, esquemaResumenAgente]),
  huella: z.string().min(8),
});

const esquemaIntervalo = z.object({
  disponible: z.boolean(),
  inferior: z.number(),
  superior: z.number(),
  n: z.number().int().nonnegative(),
  puntuacion: z.number(),
});

export const esquemaRegistroEvaluacion = z.object({
  id: z.string().min(1),
  fecha: z.string().min(1),
  entorno: z.object({
    plataforma: z.enum(['navegador', 'node']),
    descripcion: z.string(),
  }),
  juego: z.object({ id: z.string().min(1), reglasVersion: z.string().min(1) }),
  encuentrosPorPar: z.number().int().positive(),
  semillaBase: z.number().int().nonnegative(),
  agentes: z.array(
    z.object({
      id: z.string().min(1),
      config: z.record(z.string(), z.union([z.number(), z.boolean()])),
    }),
  ),
  asignaciones: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
  partidas: z.array(esquemaRegistroPartida),
  resumenPorAgente: z.array(
    z.object({
      agenteId: z.string().min(1),
      nombre: z.string(),
      victorias: z.number().int().nonnegative(),
      empates: z.number().int().nonnegative(),
      derrotas: z.number().int().nonnegative(),
      partidas: z.number().int().nonnegative(),
      invalidas: z.number().int().nonnegative(),
      puntuacion: z.number(),
      ic95: esquemaIntervalo,
      tiempoMedioMs: z.number().nullable(),
      nodosMedios: z.number().nullable(),
      simulacionesMedias: z.number().nullable(),
    }),
  ),
  invalidas: z.number().int().nonnegative(),
  errores: z.array(z.string()),
  huella: z.string().min(8),
});

export const esquemaEvento = z.object({
  id: z.string().min(1),
  tipo: z.enum([
    'partida',
    'evaluacion',
    'evaluacion-cancelada',
    'validacion',
    'error',
    'sistema',
    'almacenamiento',
  ]),
  fecha: z.string().min(1),
  resumen: z.string().min(1),
  datos: z.unknown().optional(),
  huella: z.string().min(8),
});

export function validarRegistroPartida(valor: unknown): RegistroPartida | null {
  const analisis = esquemaRegistroPartida.safeParse(valor);
  return analisis.success ? (analisis.data as RegistroPartida) : null;
}

export function validarRegistroEvaluacion(valor: unknown): RegistroEvaluacion | null {
  const analisis = esquemaRegistroEvaluacion.safeParse(valor);
  return analisis.success ? (analisis.data as RegistroEvaluacion) : null;
}

export function validarEvento(valor: unknown): RegistroEventoExterno | null {
  const analisis = esquemaEvento.safeParse(valor);
  return analisis.success ? (analisis.data as RegistroEventoExterno) : null;
}

/* ------------------------- Cerebros .lba (Fase 2) ------------------------- */

import type { EventoCerebro, RegistroCerebro } from './almacen';
import { esquemaManifiestoLBA } from '../dominio/lba/esquema';

export const esquemaRegistroCerebro = z.object({
  agentId: z.string().min(1),
  brainVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifiesto: esquemaManifiestoLBA,
  paquete: z.instanceof(Uint8Array),
  huellaPaquete: z.string().regex(/^[0-9a-f]{64}$/),
  importadoEn: z.string().min(1),
});

export const esquemaEventoCerebro = z.object({
  id: z.string().min(1),
  fecha: z.string().min(1),
  tipo: z.enum([
    'importado',
    'clonado',
    'rama',
    'examen',
    'promocion',
    'archivado',
    'incompatible',
  ]),
  agentId: z.string().min(1),
  brainVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  datos: z.record(z.string(), z.unknown()).optional(),
});

export function validarRegistroCerebro(valor: unknown): RegistroCerebro | null {
  const analisis = esquemaRegistroCerebro.safeParse(valor);
  return analisis.success ? (analisis.data as RegistroCerebro) : null;
}

export function validarEventoCerebro(valor: unknown): EventoCerebro | null {
  const analisis = esquemaEventoCerebro.safeParse(valor);
  return analisis.success ? (analisis.data as EventoCerebro) : null;
}
