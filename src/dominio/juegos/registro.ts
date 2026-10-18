/**
 * Registro de juegos: catálogo completo de las 15 variantes exigidas,
 * con estado real de implementación (honestidad de catálogo: lo pendiente
 * se declara pendiente y no es jugable).
 */

import type { JuegoConcreto } from '../motor/tipos';
import { ErrorJuegoNoDisponible } from '../motor/errores';
import { tresEnRaya3, tresEnRaya4 } from './tresEnRaya';
import { gomoku15, gomoku7, gomoku9 } from './gomoku';
import { cuatroEnRaya7x6 } from './cuatroEnRaya7x6';

export interface EntradaJuego {
  readonly id: string;
  readonly nombre: string;
  readonly estado: 'implementado' | 'pendiente';
  readonly notas: string;
  readonly juego?: JuegoConcreto;
}

export const CATALOGO_JUEGOS: readonly EntradaJuego[] = [
  {
    id: 'tres-en-raya-3',
    nombre: 'Tres en raya 3×3',
    estado: 'implementado',
    notas: '3 en línea; resuelto localmente (empate con juego perfecto).',
    juego: tresEnRaya3,
  },
  {
    id: 'tres-en-raya-4',
    nombre: 'Tres en raya 4×4 (cuatro en línea)',
    estado: 'implementado',
    notas: 'Condición de victoria documentada: 4 en línea.',
    juego: tresEnRaya4,
  },
  {
    id: 'gomoku-7',
    nombre: 'Gomoku 7×7',
    estado: 'implementado',
    notas: 'Estilo libre: 5 o más consecutivas.',
    juego: gomoku7,
  },
  {
    id: 'gomoku-9',
    nombre: 'Gomoku 9×9',
    estado: 'implementado',
    notas: 'Estilo libre: 5 o más consecutivas.',
    juego: gomoku9,
  },
  {
    id: 'gomoku-15',
    nombre: 'Gomoku 15×15',
    estado: 'implementado',
    notas: 'Estilo libre: 5 o más consecutivas; presupuestos moderados.',
    juego: gomoku15,
  },
  {
    id: 'cuatro-en-raya-7x6',
    nombre: 'Cuatro en raya 7×6',
    estado: 'implementado',
    notas: 'Gravedad por columna; no resuelto localmente.',
    juego: cuatroEnRaya7x6,
  },
  {
    id: 'othello-4',
    nombre: 'Othello 4×4',
    estado: 'pendiente',
    notas: 'Planificado para Fase 5 (reglas previstas en docs/JUEGOS.md).',
  },
  {
    id: 'othello-6',
    nombre: 'Othello 6×6',
    estado: 'pendiente',
    notas: 'Planificado para Fase 5.',
  },
  {
    id: 'othello-8',
    nombre: 'Othello 8×8',
    estado: 'pendiente',
    notas: 'Variante adicional de Othello con configuración explícita (Fase 5).',
  },
  {
    id: 'damas-reducida',
    nombre: 'Damas reducida',
    estado: 'pendiente',
    notas: 'Variante exacta pendiente de decisión documentada (Fase 5).',
  },
  {
    id: 'hex-5',
    nombre: 'Hex 5×5',
    estado: 'pendiente',
    notas: 'Conexión entre lados propios; sin empates (Fase 5).',
  },
  {
    id: 'breakthrough-5',
    nombre: 'Breakthrough 5×5',
    estado: 'pendiente',
    notas: 'Peones que avanzan y capturan en diagonal (Fase 5).',
  },
  {
    id: 'ajedrez-5',
    nombre: 'Ajedrez reducido 5×5',
    estado: 'pendiente',
    notas: 'Candidato: Minichess de Gardner; especificación completa al implementar (Fase 5).',
  },
  {
    id: 'ajedrez-6',
    nombre: 'Ajedrez reducido 6×6',
    estado: 'pendiente',
    notas: 'Variante 6×6 con alfil de distinto color (Fase 5).',
  },
  {
    id: 'cuatro-en-raya-8x7',
    nombre: 'Cuatro en raya 8×7',
    estado: 'pendiente',
    notas: 'Variante adicional con dimensiones documentadas (Fase 5).',
  },
];

/** Juegos implementados (para selectores de la interfaz). */
export function juegosImplementados(): readonly EntradaJuego[] {
  return CATALOGO_JUEGOS.filter((entrada) => entrada.estado === 'implementado');
}

/** Devuelve el juego implementado por id; lanza si no existe o está pendiente. */
export function obtenerJuego(id: string): JuegoConcreto {
  const entrada = CATALOGO_JUEGOS.find((e) => e.id === id);
  if (entrada === undefined) {
    throw new ErrorJuegoNoDisponible(`no existe ningún juego con id «${id}»`);
  }
  if (entrada.estado !== 'implementado' || entrada.juego === undefined) {
    throw new ErrorJuegoNoDisponible(`«${entrada.nombre}» está pendiente de implementación (Fase 5)`);
  }
  return entrada.juego;
}

/** ¿El id corresponde a un juego implementado? */
export function esJuegoImplementado(id: string): boolean {
  return CATALOGO_JUEGOS.some((e) => e.id === id && e.estado === 'implementado');
}
