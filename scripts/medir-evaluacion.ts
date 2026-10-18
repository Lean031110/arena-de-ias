/**
 * Medición REAL de la evaluación de Fase 1 (no forma parte de la suite de
 * CI: los benchmarks van separados de las pruebas unitarias).
 *
 * Ejecuta evaluaciones round-robin con presupuestos declarados y escribe el
 * artefacto docs/INFORMES/datos/evaluacion-fase1.json con TODO el registro
 * (configuraciones, semillas, partidas completas con sus jugadas y huellas).
 *
 * Uso: npm run medir:evaluacion
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarEvaluacion } from '../src/dominio/motor/evaluacion';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = resolve(AQUI, '../docs/INFORMES/datos/evaluacion-fase1.json');

interface Experimento {
  readonly nombre: string;
  readonly hipotesis: string;
  readonly juegoId: string;
  readonly encuentrosPorPar: number;
  readonly agentes: ReadonlyArray<{ id: string; config: Record<string, number | boolean> }>;
}

const EXPERIMENTOS: readonly Experimento[] = [
  {
    nombre: 'tres-en-raya-3-niveles',
    hipotesis:
      'En 3×3 la fuerza crece con el nivel: heurístico > aleatorio y minimax(d4) ≈ MCTS(500) ≈ invictos entre sí.',
    juegoId: 'tres-en-raya-3',
    encuentrosPorPar: 40,
    agentes: [
      { id: 'aleatorio', config: {} },
      { id: 'heuristico', config: {} },
      { id: 'minimax', config: { profundidad: 4, nodoLimite: 60000, tiempoLimiteMs: 2000 } },
      { id: 'mcts', config: { simulaciones: 500, constanteExploracion: 1.4, limiteRollout: 0 } },
    ],
  },
  {
    nombre: 'tres-en-raya-4-niveles',
    hipotesis:
      'En 4×4 (4 en línea) el patrón se repite con presupuestos ajustados (minimax d3, MCTS 500).',
    juegoId: 'tres-en-raya-4',
    encuentrosPorPar: 16,
    agentes: [
      { id: 'aleatorio', config: {} },
      { id: 'heuristico', config: {} },
      { id: 'minimax', config: { profundidad: 3, nodoLimite: 40000, tiempoLimiteMs: 2000 } },
      { id: 'mcts', config: { simulaciones: 500, constanteExploracion: 1.4, limiteRollout: 0 } },
    ],
  },
  {
    nombre: 'cuatro-en-raya-7x6-niveles',
    hipotesis:
      'En cuatro en raya, minimax(d3) y MCTS(300) superan claramente al aleatorio; entre sí la diferencia es pequeña con estos presupuestos.',
    juegoId: 'cuatro-en-raya-7x6',
    encuentrosPorPar: 16,
    agentes: [
      { id: 'aleatorio', config: {} },
      { id: 'heuristico', config: {} },
      { id: 'minimax', config: { profundidad: 3, nodoLimite: 30000, tiempoLimiteMs: 2000 } },
      { id: 'mcts', config: { simulaciones: 300, constanteExploracion: 1.4, limiteRollout: 0 } },
    ],
  },
  {
    nombre: 'gomoku-7-niveles',
    hipotesis:
      'En gomoku 7×7 con presupuestos modestos (minimax d2, MCTS 200) ambos superan al aleatorio.',
    juegoId: 'gomoku-7',
    encuentrosPorPar: 12,
    agentes: [
      { id: 'aleatorio', config: {} },
      { id: 'heuristico', config: {} },
      { id: 'minimax', config: { profundidad: 2, nodoLimite: 20000, tiempoLimiteMs: 2000 } },
      { id: 'mcts', config: { simulaciones: 200, constanteExploracion: 1.4, limiteRollout: 0 } },
    ],
  },
];

async function main(): Promise<void> {
  const inicioTotal = Date.now();
  const resultados: unknown[] = [];

  for (const experimento of EXPERIMENTOS) {
    const inicio = Date.now();
    console.log(`▶ ${experimento.nombre} (${experimento.juegoId}, ${experimento.encuentrosPorPar} encuentros por par)…`);
    const semillaBase = 20261018;
    const registro = await ejecutarEvaluacion({
      juegoId: experimento.juegoId,
      semillaBase,
      encuentrosPorPar: experimento.encuentrosPorPar,
      agentes: experimento.agentes,
    });
    if ('cancelada' in registro) {
      throw new Error(`la evaluación ${experimento.nombre} se canceló inesperadamente`);
    }
    const duracionS = (Date.now() - inicio) / 1000;
    console.log(`  completada en ${duracionS.toFixed(1)} s`);
    for (const resumen of registro.resumenPorAgente) {
      console.log(
        `    ${resumen.nombre.padEnd(18)} V${resumen.victorias} E${resumen.empates} D${resumen.derrotas}  puntuación ${resumen.puntuacion.toFixed(3)}  IC95 [${resumen.ic95.inferior.toFixed(3)}, ${resumen.ic95.superior.toFixed(3)}]`,
      );
    }
    resultados.push({
      experimento: experimento.nombre,
      hipotesis: experimento.hipotesis,
      metodo:
        'Ejecución real de ejecutarEvaluacion (round-robin, alternancia de lados por encuentro, ' +
        'puntuación = (V + E/2)/n, IC de Wilson 95 %). Presupuestos declarados en la configuración de cada agente.',
      semillaBase,
      encuentrosPorPar: experimento.encuentrosPorPar,
      agentes: registro.agentes,
      duracionSegundos: Number(duracionS.toFixed(2)),
      resumenPorAgente: registro.resumenPorAgente,
      invalidas: registro.invalidas,
      errores: registro.errores,
      partidas: registro.partidas.map((partida) => ({
        id: partida.id,
        semilla: partida.semilla,
        agentes: [partida.agentes[0]?.id, partida.agentes[1]?.id],
        movimientos: partida.movimientos.map((movimiento) => movimiento.notacion),
        resultado: partida.resultado,
        validez: partida.validez,
        jugadas: partida.movimientos.length,
        duracionMs: Number(partida.duracionMs.toFixed(2)),
        huella: partida.huella,
      })),
      huellaEvaluacion: registro.huella,
    });
  }

  const artefacto = {
    titulo: 'Evaluación real de la Fase 1 de Arena de IAs',
    fecha: new Date().toISOString(),
    entorno: `Node ${process.versions.node} (${process.arch})`,
    advertencia:
      'Datos medidos directamente (tiempos con performance.now, resultados decididos por las reglas del motor). ' +
      'Ninguna cifra de este artefacto es simulada. Reproducible con las semillas y configuraciones registradas.',
    duracionTotalSegundos: Number(((Date.now() - inicioTotal) / 1000).toFixed(2)),
    experimentos: resultados,
  };

  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, JSON.stringify(artefacto, null, 2), 'utf8');
  console.log(`\nArtefacto escrito en ${DESTINO}`);
}

void main();
