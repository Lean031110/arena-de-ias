/**
 * Fase 3 — Registro de equipos cargados en runtime (espejo del patrón de
 * cerebros cargados, ADR-015: la identidad vive en el registro, la
 * configuración de partida es plana).
 *
 * Reglas duras de incorporación (validadas ANTES de registrar):
 * - 2..8 miembros, alias únicos y no vacíos.
 * - Cada miembro referencia un agente EXISTENTE: del catálogo (estado
 *   «disponible») o un cerebro cargado (clave «neural:…»).
 * - COMPATIBILIDAD: los cerebros pertenecen a un juego concreto; un equipo
 *   de «tres-en-raya-3» no puede integrar un cerebro de otro juego. Los
 *   agentes de catálogo son genéricos (el motor los valida por partida).
 * - La configuración de cada miembro se valida contra su definición.
 * - Los pesos medidos (política «ponderado») deben ser ≥ 0 finitos.
 * - Nombre de equipo único en el registro.
 *
 * La clave resultante es «equipo:<nombre>» y es usable como id de agente en
 * cualquier config de partida/evaluación: el registro de agentes la resuelve
 * (ver agentes/registro.ts).
 */

import type { Equipo, MiembroEquipo } from './tipos';
import {
  CATALOGO_AGENTES,
  esCerebroCargado,
  validarConfigAgente,
  cerebrosCargados,
} from '../agentes/registro';
import { ErrorConfiguracionInvalida } from '../motor/errores';

const EQUIPOS_CARGADOS = new Map<string, Equipo>();

export const ID_AGENTE_EQUIPO = 'equipo';

export const LIMITES_EQUIPO = {
  miembrosMinimo: 2,
  miembrosMaximo: 8,
  aliasMaximo: 32,
  nombreMaximo: 48,
} as const;

/** Valida un equipo completo; devuelve la lista de errores (vacía = válido). */
export function validarEquipo(equipo: unknown): string[] {
  const errores: string[] = [];
  if (typeof equipo !== 'object' || equipo === null) {
    return ['el equipo debe ser un objeto'];
  }
  const e = equipo as Partial<Equipo>;
  if (typeof e.nombre !== 'string' || e.nombre.trim().length < 2) {
    errores.push('el nombre del equipo debe tener al menos 2 caracteres');
  } else if (e.nombre.length > LIMITES_EQUIPO.nombreMaximo) {
    errores.push(`el nombre no puede superar ${LIMITES_EQUIPO.nombreMaximo} caracteres`);
  }
  if (typeof e.juegoId !== 'string' || e.juegoId.trim() === '') {
    errores.push('falta el juego del equipo (juegoId)');
  }
  if (e.protocolo !== 'consulta' && e.protocolo !== 'turno-alternado') {
    errores.push('protocolo inválido: «consulta» o «turno-alternado»');
  }
  if (e.politica !== 'votacion' && e.politica !== 'ponderado') {
    errores.push('política de agregación inválida: «votacion» o «ponderado»');
  }
  if (!Array.isArray(e.miembros) || e.miembros.length < LIMITES_EQUIPO.miembrosMinimo) {
    errores.push(`un equipo exige al menos ${LIMITES_EQUIPO.miembrosMinimo} miembros`);
    return errores;
  }
  if (e.miembros.length > LIMITES_EQUIPO.miembrosMaximo) {
    errores.push(`un equipo no puede superar ${LIMITES_EQUIPO.miembrosMaximo} miembros`);
  }

  const alias = new Set<string>();
  const cerebros = new Map(cerebrosCargados().map((c) => [c.idAgente, c.cerebro]));
  for (const [indice, miembro] of (e.miembros as MiembroEquipo[]).entries()) {
    const donde = `miembro ${indice + 1}`;
    if (typeof miembro !== 'object' || miembro === null) {
      errores.push(`${donde}: debe ser un objeto`);
      continue;
    }
    if (typeof miembro.alias !== 'string' || miembro.alias.trim().length < 1) {
      errores.push(`${donde}: falta el alias`);
    } else if (miembro.alias.length > LIMITES_EQUIPO.aliasMaximo) {
      errores.push(`${donde}: alias demasiado largo`);
    } else if (alias.has(miembro.alias)) {
      errores.push(`${donde}: alias duplicado («${miembro.alias}»)`);
    } else {
      alias.add(miembro.alias);
    }
    if (
      typeof miembro.agente !== 'object' ||
      miembro.agente === null ||
      typeof miembro.agente.id !== 'string'
    ) {
      errores.push(`${donde}: falta el agente (id)`);
      continue;
    }
    // Existencia del agente: catálogo o cerebro cargado.
    const esCerebro = esCerebroCargado(miembro.agente.id);
    if (!esCerebro && !CATALOGO_AGENTES.some((a) => a.id === miembro.agente.id)) {
      errores.push(`${donde}: el agente «${miembro.agente.id}» no existe`);
      continue;
    }
    if (
      !esCerebro &&
      CATALOGO_AGENTES.find((a) => a.id === miembro.agente.id)?.estado !== 'disponible'
    ) {
      errores.push(`${donde}: el agente «${miembro.agente.id}» no es automático disponible`);
      continue;
    }
    // Compatibilidad dura: cerebro de OTRO juego, rechazado.
    if (esCerebro) {
      const cerebro = cerebros.get(miembro.agente.id);
      if (cerebro !== undefined && cerebro.gameId !== e.juegoId) {
        errores.push(
          `${donde}: el cerebro «${miembro.agente.id}» es de «${cerebro.gameId}», ` +
            `no de «${e.juegoId}» (compatibilidad dura)`,
        );
        continue;
      }
    }
    // Config del miembro válida contra su definición.
    const config = miembro.agente.config ?? {};
    errores.push(
      ...validarConfigAgente(miembro.agente.id, config).map((m) => `${donde}: ${m}`),
    );
    if (typeof miembro.pesoMedido !== 'number' || !Number.isFinite(miembro.pesoMedido)) {
      errores.push(`${donde}: el peso medido debe ser un número finito`);
    } else if (miembro.pesoMedido < 0) {
      errores.push(`${donde}: el peso medido no puede ser negativo`);
    }
  }
  return errores;
}

/** Registra un equipo validado; devuelve su clave de agente. */
export function registrarEquipoCargado(equipo: Equipo): string {
  const errores = validarEquipo(equipo);
  if (errores.length > 0) {
    throw new ErrorConfiguracionInvalida(errores.join('; '));
  }
  const clave = `${ID_AGENTE_EQUIPO}:${equipo.nombre}`;
  const previo = EQUIPOS_CARGADOS.get(clave);
  if (previo !== undefined && JSON.stringify(previo) !== JSON.stringify(equipo)) {
    throw new ErrorConfiguracionInvalida(
      `ya existe un equipo distinto con el nombre «${equipo.nombre}»`,
    );
  }
  EQUIPOS_CARGADOS.set(clave, equipo);
  return clave;
}

/** Da de baja un equipo (la persistencia no se toca aquí). */
export function desregistrarEquipoCargado(clave: string): boolean {
  return EQUIPOS_CARGADOS.delete(clave);
}

/** Equipos cargados actualmente. */
export function equiposCargados(): readonly Equipo[] {
  return [...EQUIPOS_CARGADOS.values()];
}

/** ¿La clave corresponde a un equipo cargado? */
export function esEquipoCargado(id: string): boolean {
  return EQUIPOS_CARGADOS.has(id);
}

/** Equipo cargado por clave (null si no existe). */
export function equipoCargado(id: string): Equipo | null {
  return EQUIPOS_CARGADOS.get(id) ?? null;
}

/** Limpia el registro (pruebas). */
export function limpiarEquiposCargados(): void {
  EQUIPOS_CARGADOS.clear();
}
