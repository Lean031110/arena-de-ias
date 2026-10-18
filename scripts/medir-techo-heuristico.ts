/**
 * Medición: techo empírico contra el heurístico en tres-en-raya-3.
 * Ejecuta partidas reales minimax-d4 (búsqueda casi exacta) contra el
 * heurístico con alternancia de lados, para establecer qué puntuación es
 * alcanzable contra la referencia congelada del examen v1.
 *
 * Uso: npx tsx scripts/medir-techo-heuristico.ts [encuentros]
 */

import { ejecutarPartida } from '../src/dominio/motor/partida';

async function main(): Promise<void> {
  const encuentros = Number.parseInt(process.argv[2] ?? '200', 10);
  let v = 0;
  let e = 0;
  let d = 0;
  for (let i = 0; i < encuentros; i++) {
    const minimaxPrimero = i % 2 === 0;
    const registro = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 300000 + i,
      agentes: minimaxPrimero
        ? [
            { id: 'minimax', config: { profundidad: 6, nodoLimite: 200000, tiempoLimiteMs: 4000 } },
            { id: 'heuristico', config: {} },
          ]
        : [
            { id: 'heuristico', config: {} },
            { id: 'minimax', config: { profundidad: 6, nodoLimite: 200000, tiempoLimiteMs: 4000 } },
          ],
    });
    const resultado = registro.resultado;
    if (resultado === null || resultado.tipo === 'empate') e++;
    else if (resultado.ganador === (minimaxPrimero ? 1 : 2)) v++;
    else d++;
  }
  console.log(`minimax-d6 vs heuristico (${encuentros} partidas, lados alternos):`);
  console.log(`  minimax: ${v}V ${e}E ${d}D — puntuación ${((v + e / 2) / encuentros).toFixed(3)}`);
  console.log(`  heuristico: ${d}V ${e}E ${v}D — puntuación ${((d + e / 2) / encuentros).toFixed(3)}`);
}

await main();
