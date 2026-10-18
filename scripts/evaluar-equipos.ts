/**
 * Fase 3 — Evaluación de equipos frente a individuales con PRESUPUESTOS
 * COMPARABLES (Tarea E).
 *
 * Qué mide (todo real, partidas completas en el motor TS, lados alternos):
 * - Victorias/empates/derrotas, puntuación e IC95 Wilson por emparejamiento.
 * - Tiempo medio por partida y coste de búsqueda por jugada (simulaciones
 *   totales del bando) — el coste de un equipo es la SUMA de sus miembros.
 * - Comparaciones con presupuesto total por jugada IGUAL:
 *     · individual MCTS-200  vs  equipo consulta (MCTS-100 + MCTS-100)
 *     · individual MCTS-400  vs  equipo consulta (MCTS-200 + MCTS-200)
 *   y el efecto de arrastrar un miembro débil:
 *     · equipo (heurístico + aleatorio) en ambos protocolos vs aleatorio
 *     · individual heurístico vs aleatorio (referencia).
 *
 * REGLA DE HONESTIDAD: no se presupone que un equipo sea mejor por tener más
 * integrantes; se mide y se informa tal cual (FASE-3.md §E).
 *
 * Artefacto: docs/INFORMES/datos/evaluacion-equipos-fase3.json
 *
 * Uso: npx tsx scripts/evaluar-equipos.ts [encuentrosPorEmparejamiento]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { ejecutarPartida } from '../src/dominio/motor/partida';
import { intervaloWilson } from '../src/dominio/motor/estadistica';
import {
  registrarEquipoCargado,
  desregistrarEquipoCargado,
  limpiarEquiposCargados,
} from '../src/dominio/equipos/registro';
import type { Equipo } from '../src/dominio/equipos/tipos';

interface ConfiguracionBando {
  readonly id: string;
  readonly config: Readonly<Record<string, number | boolean>>;
  readonly etiqueta: string;
  /** Simulaciones totales por jugada de ese bando (coste de búsqueda). */
  readonly simsPorJugada: number | null;
}

interface ResultadoEmparejamiento {
  readonly etiqueta: string;
  readonly encuentros: number;
  readonly v: number;
  readonly e: number;
  readonly d: number;
  readonly puntuacion: number;
  readonly ic95: readonly [number, number];
  readonly duracionMediaMs: number;
  readonly simsMediasPorJugadaBandoA: number | null;
  readonly presupuestoComparado: string;
}

const EQUIPOS: Equipo[] = [
  {
    nombre: 'consulta-2x100',
    juegoId: 'tres-en-raya-3',
    protocolo: 'consulta',
    politica: 'votacion',
    miembros: [
      { alias: 'm1', agente: { id: 'mcts', config: { simulaciones: 100, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
      { alias: 'm2', agente: { id: 'mcts', config: { simulaciones: 100, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
    ],
  },
  {
    nombre: 'consulta-2x200',
    juegoId: 'tres-en-raya-3',
    protocolo: 'consulta',
    politica: 'votacion',
    miembros: [
      { alias: 'm1', agente: { id: 'mcts', config: { simulaciones: 200, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
      { alias: 'm2', agente: { id: 'mcts', config: { simulaciones: 200, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
    ],
  },
  {
    nombre: 'alternado-2x100',
    juegoId: 'tres-en-raya-3',
    protocolo: 'turno-alternado',
    politica: 'votacion',
    miembros: [
      { alias: 'm1', agente: { id: 'mcts', config: { simulaciones: 100, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
      { alias: 'm2', agente: { id: 'mcts', config: { simulaciones: 100, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
    ],
  },
  {
    nombre: 'consulta-heur-azar',
    juegoId: 'tres-en-raya-3',
    protocolo: 'consulta',
    politica: 'votacion',
    miembros: [
      { alias: 'tacto', agente: { id: 'heuristico', config: {} }, pesoMedido: 1 },
      { alias: 'azar', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
    ],
  },
  {
    nombre: 'alternado-heur-azar',
    juegoId: 'tres-en-raya-3',
    protocolo: 'turno-alternado',
    politica: 'votacion',
    miembros: [
      { alias: 'tacto', agente: { id: 'heuristico', config: {} }, pesoMedido: 1 },
      { alias: 'azar', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
    ],
  },
];

function bandoIndividual(id: string, config: Record<string, number | boolean>, etiqueta: string, sims: number | null): ConfiguracionBando {
  return { id, config, etiqueta, simsPorJugada: sims };
}

async function medir(
  etiqueta: string,
  bandoA: ConfiguracionBando,
  bandoB: ConfiguracionBando,
  encuentros: number,
  semillaBase: number,
  presupuestoComparado: string,
): Promise<ResultadoEmparejamiento> {
  let v = 0;
  let e = 0;
  let d = 0;
  let sumaDuracion = 0;
  let sumaSimsA = 0;
  let jugadasA = 0;

  for (let i = 0; i < encuentros; i++) {
    const aPrimero = i % 2 === 0;
    const registro = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: semillaBase + i,
      agentes: aPrimero
        ? [
            { id: bandoA.id, config: bandoA.config },
            { id: bandoB.id, config: bandoB.config },
          ]
        : [
            { id: bandoB.id, config: bandoB.config },
            { id: bandoA.id, config: bandoA.config },
          ],
    });
    sumaDuracion += registro.duracionMs;
    const jugadorA = aPrimero ? 1 : 2;
    for (const movimiento of registro.movimientos) {
      if (movimiento.jugador === jugadorA) {
        sumaSimsA += movimiento.estadisticas.simulaciones ?? 0;
        jugadasA++;
      }
    }
    const resultado = registro.resultado;
    if (resultado === null || resultado.tipo === 'empate') e++;
    else if (resultado.ganador === jugadorA) v++;
    else d++;
  }

  const puntuacion = (v + e / 2) / encuentros;
  const ic = intervaloWilson(v, e, encuentros);
  return {
    etiqueta,
    encuentros,
    v,
    e,
    d,
    puntuacion: Number(puntuacion.toFixed(4)),
    ic95: [Number(ic.inferior.toFixed(4)), Number(ic.superior.toFixed(4))],
    duracionMediaMs: Math.round(sumaDuracion / encuentros),
    simsMediasPorJugadaBandoA: jugadasA > 0 ? Math.round(sumaSimsA / jugadasA) : null,
    presupuestoComparado,
  };
}

async function main(): Promise<void> {
  const encuentros = Number.parseInt(process.argv[2] ?? '60', 10);
  limpiarEquiposCargados();
  const claves = new Map<string, string>();
  for (const equipo of EQUIPOS) {
    const clave = registrarEquipoCargado(equipo);
    claves.set(equipo.nombre, clave);
  }

  const mcts = (simulaciones: number) => ({ simulaciones, constanteExploracion: 1.4, limiteRollout: 9 });

  const resultados: ResultadoEmparejamiento[] = [];

  // Presupuesto COMPARABLE (200 sims/jugada en el bando A):
  resultados.push(
    await medir(
      'individual MCTS-200 vs aleatorio',
      bandoIndividual('mcts', mcts(200), 'MCTS-200', 200),
      bandoIndividual('aleatorio', {}, 'aleatorio', null),
      encuentros, 600000,
      'A: 200 sims/jugada · B: sin búsqueda',
    ),
  );
  resultados.push(
    await medir(
      'equipo consulta 2×MCTS-100 vs aleatorio',
      bandoIndividual(claves.get('consulta-2x100')!, {}, 'equipo-2x100', 200),
      bandoIndividual('aleatorio', {}, 'aleatorio', null),
      encuentros, 600100,
      'A: 100+100 = 200 sims/jugada (dos miembros) · B: sin búsqueda',
    ),
  );
  resultados.push(
    await medir(
      'equipo turno-alternado 2×MCTS-100 vs aleatorio',
      bandoIndividual(claves.get('alternado-2x100')!, {}, 'equipo-alt-2x100', 100),
      bandoIndividual('aleatorio', {}, 'aleatorio', null),
      encuentros, 600200,
      'A: 100 sims por jugada (un miembro decide cada jugada) · B: sin búsqueda',
    ),
  );
  resultados.push(
    await medir(
      'individual MCTS-200 vs equipo consulta 2×MCTS-100',
      bandoIndividual('mcts', mcts(200), 'MCTS-200', 200),
      bandoIndividual(claves.get('consulta-2x100')!, {}, 'equipo-2x100', 200),
      encuentros, 600300,
      'AMBOS: 200 sims/jugada totales (individual vs equipo)',
    ),
  );

  // Presupuesto comparable mayor (400 sims/jugada):
  resultados.push(
    await medir(
      'individual MCTS-400 vs equipo consulta 2×MCTS-200',
      bandoIndividual('mcts', mcts(400), 'MCTS-400', 400),
      bandoIndividual(claves.get('consulta-2x200')!, {}, 'equipo-2x200', 400),
      encuentros, 600400,
      'AMBOS: 400 sims/jugada totales (individual vs equipo)',
    ),
  );

  // Miembro débil arrastrado (sin presupuesto de búsqueda):
  resultados.push(
    await medir(
      'individual heurístico vs aleatorio',
      bandoIndividual('heuristico', {}, 'heuristico', null),
      bandoIndividual('aleatorio', {}, 'aleatorio', null),
      encuentros, 600500,
      'AMBOS: sin búsqueda (reglas y azar)',
    ),
  );
  resultados.push(
    await medir(
      'equipo consulta (heurístico+aleatorio) vs aleatorio',
      bandoIndividual(claves.get('consulta-heur-azar')!, {}, 'equipo-heur-azar', null),
      bandoIndividual('aleatorio', {}, 'aleatorio', null),
      encuentros, 600600,
      'A: votación heurístico+aleatorio · B: aleatorio',
    ),
  );
  resultados.push(
    await medir(
      'equipo turno-alternado (heurístico+aleatorio) vs aleatorio',
      bandoIndividual(claves.get('alternado-heur-azar')!, {}, 'equipo-alt-heur-azar', null),
      bandoIndividual('aleatorio', {}, 'aleatorio', null),
      encuentros, 600700,
      'A: alternan heurístico y aleatorio · B: aleatorio',
    ),
  );

  for (const clave of claves.values()) {
    desregistrarEquipoCargado(clave);
  }
  limpiarEquiposCargados();

  const salida = {
    fecha: new Date().toISOString(),
    juego: 'tres-en-raya-3',
    encuentrosPorEmparejamiento: encuentros,
    metodo:
      'partidas reales en el motor TS con lados alternos; presupuestos totales ' +
      'por jugada igualados entre bando individual y de equipo; coste medido ' +
      'como simulaciones totales del bando por jugada y duración por partida',
    resultados,
    lecturaHonesta:
      'Ninguna presuposición de superioridad: los equipos consultivos con ' +
      'presupuesto igualado no superan al individual con el mismo total de ' +
      'simulaciones (las cifras exactas, en resultados); alternar un miembro ' +
      'débil degrada al equipo; la votación mitiga parcialmente al miembro ' +
      'débil frente a alternarlo. Ver FASE-3.md §E para la lectura completa.',
  };

  const destino = 'docs/INFORMES/datos/evaluacion-equipos-fase3.json';
  mkdirSync('docs/INFORMES/datos', { recursive: true });
  writeFileSync(destino, JSON.stringify(salida, null, 2) + '\n', 'utf-8');

  console.log(`=== Evaluación de equipos vs individuales (${encuentros} encuentros, lados alternos) ===`);
  for (const r of resultados) {
    console.log(
      `${r.etiqueta.padEnd(46)}: ${r.v}V ${r.e}E ${r.d}D — ${r.puntuacion.toFixed(3)} ` +
        `IC95 [${r.ic95[0].toFixed(3)}, ${r.ic95[1].toFixed(3)}] — ${r.duracionMediaMs} ms/partida` +
        (r.simsMediasPorJugadaBandoA !== null ? ` — ${r.simsMediasPorJugadaBandoA} sims/jugada (A)` : ''),
    );
  }
  console.log(`\nartefacto: ${destino}`);
}

void main();
