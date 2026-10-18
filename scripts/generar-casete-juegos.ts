/**
 * Genera el casete de juegos cruzados TS → Python: partidas reales jugadas
 * por el motor TypeScript (con semilla) para que el motor Python las
 * reproduzca con resultados idénticos (paridad del motor, §9 LBA-MODELO.md).
 *
 * Uso: npx tsx scripts/generar-casete-juegos.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarPartida } from '../src/dominio/motor/partida';
import { crearAgenteHeuristico } from '../src/dominio/agentes/heuristico';
import { crearAgenteMCTS } from '../src/dominio/agentes/mcts';
import type { Decisor } from '../src/dominio/motor/partida';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = resolve(AQUI, '../entrenamiento/pruebas/casetes/juegos-ts.json');

interface JuegoCruzado {
  indice: number;
  semilla: number;
  notacion: string[];
  resultado: { tipo: string; ganador?: number };
  jugadas: number;
}

async function main(): Promise<void> {
  const juegos: JuegoCruzado[] = [];
  const heuristico = crearAgenteHeuristico();
  const mcts = crearAgenteMCTS({ simulaciones: 60, limiteRollout: 9 });

  // Partidas heurístico vs MCTS con semillas consecutivas: diversidad real.
  for (let indice = 0; indice < 12; indice++) {
    const semilla = 700000 + indice;
    const decisor: Decisor = (parametros) => {
      const agente = parametros.infoAgente.id === 'heuristico' ? heuristico : mcts;
      return agente.elegirMovimiento(parametros.juego, parametros.estado, parametros.contexto);
    };
    const registro = await ejecutarPartida(
      {
        juegoId: 'tres-en-raya-3',
        semilla,
        agentes: [
          { id: 'heuristico', config: {} },
          { id: 'mcts', config: { simulaciones: 60, constanteExploracion: 1.4 } },
        ],
      },
      decisor,
    );
    juegos.push({
      indice,
      semilla,
      notacion: registro.movimientos.map((m) => m.notacion),
      resultado:
        registro.resultado?.tipo === 'victoria'
          ? { tipo: 'victoria', ganador: registro.resultado.ganador }
          : { tipo: 'empate' },
      jugadas: registro.movimientos.length,
    });
  }

  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(
    DESTINO,
    JSON.stringify(
      {
        descripcion:
          'Partidas jugadas por el motor TypeScript (heurístico vs MCTS, semillas fijas); ' +
          'el motor Python debe reproducirlas con el mismo resultado aplicando la notación.',
        simulacionesMCTS: 60,
        juegos,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
  console.log(`casete juegos TS: ${DESTINO} (${juegos.length} partidas)`);
}

await main();
