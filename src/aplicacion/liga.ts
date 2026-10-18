/**
 * Liga de versiones y examen de promoción (Tarea E, ADR-007/ADR-015).
 *
 * EXAMEN DE PROMOCIÓN v1 — protocolo FIJADO ANTES de cualquier examen
 * (los criterios no se ajustan a posteriori):
 *
 * 1. La candidata juega contra la REFERENCIA CONGELADA del juego (para
 *    tres-en-raya-3: agente heurístico del catálogo, versión 1) un mínimo
 *    de 200 partidas con alternancia de lados.
 * 2. Si existe CAMPEONA vigente, la candidata juga contra ella otras
 *    ≥ 200 partidas con alternancia de lados.
 * 3. Cada componente se aprueba con: puntuación ≥ 0,60 y límite inferior
 *    del IC de Wilson 95 % > 0,55 (ADR-007).
 * 4. El examen solo se aprueba si TODOS los componentes superan los
 *    umbrales. En caso contrario queda registrado como «no aprobado» y la
 *    campeona (si la hay) se conserva intacta: JAMÁS se sobrescribe.
 *
 * Cada examen registra: ids de modelos, configuraciones, presupuestos,
 * semillas, número de partidas, V/E/D, puntuación, IC95, duraciones,
 * versión de reglas y fecha — todo medido, nada estimado.
 */

import { ejecutarPartida } from '../dominio/motor/partida';
import { intervaloWilson, type IntervaloWilson } from '../dominio/motor/estadistica';
import { obtenerJuego } from '../dominio/juegos/registro';
import type { RegistroCerebros } from './registroCerebros';

/** Criterios de promoción congelados (ADR-007). No ajustar tras ver datos. */
export interface CriteriosPromocion {
  readonly partidasMinimas: number;
  readonly puntuacionMinima: number;
  readonly ic95InferiorMinimo: number;
}

export const CRITERIOS_PROMOCION_V1: CriteriosPromocion = {
  partidasMinimas: 200,
  puntuacionMinima: 0.6,
  ic95InferiorMinimo: 0.55,
};

/** Referencia congelada por juego (no cambia al ver resultados). */
export const REFERENCIAS_CONGELADAS: Readonly<Record<string, { id: string; config: Record<string, number | boolean>; etiqueta: string }>> = {
  'tres-en-raya-3': { id: 'heuristico', config: {}, etiqueta: 'Heurístico (catálogo, v1)' },
};

export interface ComponenteExamen {
  readonly etiqueta: string;
  readonly rivales: readonly { id: string; config: Readonly<Record<string, number | boolean>> }[];
  readonly victorias: number;
  readonly empates: number;
  readonly derrotas: number;
  readonly partidas: number;
  readonly puntuacion: number;
  readonly ic95: IntervaloWilson;
  readonly semillas: readonly number[];
  readonly duracionMs: number;
  readonly aprobado: boolean;
}

export interface ResultadoExamen {
  readonly aprobado: boolean;
  readonly fecha: string;
  readonly juegoId: string;
  readonly gameRulesVersion: string;
  readonly candidata: { agentId: string; brainVersion: string; simulaciones: number };
  readonly componentes: readonly ComponenteExamen[];
  readonly criterios: CriteriosPromocion;
  readonly conclusion: string;
}

/** ¿Un componente (V/E/D medidos) supera los criterios congelados? */
export function evaluarCriterios(
  victorias: number,
  empates: number,
  partidas: number,
  criterios: CriteriosPromocion = CRITERIOS_PROMOCION_V1,
): { aprobado: boolean; puntuacion: number; ic95: IntervaloWilson } {
  const ic95 = intervaloWilson(victorias, empates, partidas);
  const puntuacion = partidas > 0 ? (victorias + empates / 2) / partidas : 0;
  const aprobado =
    partidas >= criterios.partidasMinimas &&
    puntuacion >= criterios.puntuacionMinima &&
    ic95.inferior > criterios.ic95InferiorMinimo;
  return { aprobado, puntuacion, ic95 };
}

export interface OpcionesExamen {
  readonly juegoId: string;
  readonly semillaBase: number;
  readonly encuentros: number;
  readonly simulacionesCandidata: number;
  readonly criterios?: CriteriosPromocion;
}

/** Ejecuta el examen completo (partidas reales) y registra el resultado. */
export async function examinarCandidata(
  registro: RegistroCerebros,
  candidata: { agentId: string; brainVersion: string },
  opciones: OpcionesExamen,
): Promise<ResultadoExamen> {
  const criterios = opciones.criterios ?? CRITERIOS_PROMOCION_V1;
  const claveCandidata = await registro.cargar(candidata.agentId, candidata.brainVersion);
  const juego = obtenerJuego(opciones.juegoId);
  const referencia = REFERENCIAS_CONGELADAS[opciones.juegoId];
  if (referencia === undefined) {
    throw new Error(`no hay referencia congelada definida para «${opciones.juegoId}» (examen no configurado)`);
  }

  // Componente 1: vs referencia congelada. Componente 2: vs campeona, si la hay.
  const lista = await registro.listar();
  const campeon = lista.find((c) => c.estado === 'campeon' && c.registro.manifiesto.gameId === opciones.juegoId);
  const componentes: ComponenteExamen[] = [];

  const rivalesPosibles: Array<{ etiqueta: string; rivales: { id: string; config: Record<string, number | boolean> }[] }> = [
    {
      etiqueta: `referencia-congelada:${referencia.id}`,
      rivales: [{ id: referencia.id, config: referencia.config }],
    },
  ];
  if (campeon !== undefined) {
    const claveCampeona = await registro.cargar(campeon.registro.agentId, campeon.registro.brainVersion);
    rivalesPosibles.push({
      etiqueta: `campeona:${campeon.registro.agentId}@${campeon.registro.brainVersion}`,
      rivales: [{ id: claveCampeona, config: { simulaciones: opciones.simulacionesCandidata } }],
    });
  }

  for (const rival of rivalesPosibles) {
    let victorias = 0;
    let empates = 0;
    let derrotas = 0;
    const semillas: number[] = [];
    const inicio = Date.now();
    for (let i = 0; i < opciones.encuentros; i++) {
      const semilla = opciones.semillaBase + i;
      semillas.push(semilla);
      const candidataPrimera = i % 2 === 0; // alternancia de lados
      const registroPartida = await ejecutarPartida({
        juegoId: opciones.juegoId,
        semilla,
        agentes: candidataPrimera
          ? [
              { id: claveCandidata, config: { simulaciones: opciones.simulacionesCandidata } },
              { id: rival.rivales[0]!.id, config: rival.rivales[0]!.config },
            ]
          : [
              { id: rival.rivales[0]!.id, config: rival.rivales[0]!.config },
              { id: claveCandidata, config: { simulaciones: opciones.simulacionesCandidata } },
            ],
      });
      if (registroPartida.validez !== 'verificada') {
        throw new Error(`partida ${i} del examen resultó inválida: ${registroPartida.errores.join('; ')}`);
      }
      const resultado = registroPartida.resultado;
      if (resultado === null || resultado.tipo === 'empate') empates++;
      else if (resultado.ganador === (candidataPrimera ? 1 : 2)) victorias++;
      else derrotas++;
    }
    const evaluacion = evaluarCriterios(victorias, empates, opciones.encuentros, criterios);
    componentes.push({
      etiqueta: rival.etiqueta,
      rivales: rival.rivales,
      victorias,
      empates,
      derrotas,
      partidas: opciones.encuentros,
      puntuacion: evaluacion.puntuacion,
      ic95: evaluacion.ic95,
      semillas,
      duracionMs: Date.now() - inicio,
      aprobado: evaluacion.aprobado,
    });
  }

  const aprobado = componentes.every((c) => c.aprobado);
  const resultado: ResultadoExamen = {
    aprobado,
    fecha: new Date().toISOString(),
    juegoId: opciones.juegoId,
    gameRulesVersion: juego.reglasVersion,
    candidata: {
      agentId: candidata.agentId,
      brainVersion: candidata.brainVersion,
      simulaciones: opciones.simulacionesCandidata,
    },
    componentes,
    criterios,
    conclusion: aprobado
      ? 'Examen aprobado: todos los componentes superan los criterios congelados (ADR-007). La candidata se promueve a campeona; la campeona anterior queda archivada por evento, nunca sobrescrita.'
      : 'Examen NO aprobado: la evidencia no alcanza los criterios congelados (ADR-007). No hay promoción; la campeona existente (si la hay) se conserva intacta.',
  };

  await registro.registrarExamen(candidata.agentId, candidata.brainVersion, aprobado, {
    juegoId: opciones.juegoId,
    reglas: juego.reglasVersion,
    semillaBase: opciones.semillaBase,
    encuentros: opciones.encuentros,
    simulaciones: opciones.simulacionesCandidata,
    criterios,
    componentes: componentes.map((c) => ({
      etiqueta: c.etiqueta,
      victorias: c.victorias,
      empates: c.empates,
      derrotas: c.derrotas,
      partidas: c.partidas,
      puntuacion: c.puntuacion,
      ic95: [c.ic95.inferior, c.ic95.superior],
      aprobado: c.aprobado,
    })),
    conclusion: resultado.conclusion,
  });

  return resultado;
}
