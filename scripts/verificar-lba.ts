/**
 * Verificación local de un paquete .lba entrenado (Tarea D→E):
 * 1. Valida el paquete con el validador TS COMPLETO.
 * 2. Carga el cerebro en el runtime ts-puro (clave «neural:…»).
 * 3. Ejecuta partidas REALES contra rivales del catálogo con lados alternos
 *    (el decisor automático del motor resuelve la clave del cerebro).
 *
 * Uso: npx tsx scripts/verificar-lba.ts <ruta-al-.lba> [partidasPorRival]
 */

import { readFileSync } from 'node:fs';
import { ejecutarPartida } from '../src/dominio/motor/partida';
import { validarPaqueteLBA } from '../src/dominio/lba/validador';
import { leerTensores } from '../src/dominio/lba/safetensors';
import { cargarCerebro } from '../src/dominio/agentes/neural';
import { registrarCerebroCargado } from '../src/dominio/agentes/registro';

async function main(): Promise<void> {
  const ruta = process.argv[2] ?? 'modelos/candidatas/red-ter-3@1.0.0.lba';
  const partidasPorRival = Number.parseInt(process.argv[3] ?? '20', 10);
  const bytes = new Uint8Array(readFileSync(ruta));

  console.log(`=== Verificación de ${ruta} (${bytes.length} bytes) ===`);
  const paquete = await validarPaqueteLBA(bytes);
  console.log('✓ paquete VÁLIDO para el validador TS completo');
  console.log(`  huella sha256 : ${paquete.huellaPaquete}`);
  console.log(`  cerebro       : ${paquete.manifiesto.agentId}@${paquete.manifiesto.brainVersion}`);
  console.log(`  juego         : ${paquete.manifiesto.gameId} (reglas ${paquete.manifiesto.gameRulesVersion}, hash ${paquete.manifiesto.gameRulesHash})`);
  console.log(`  arquitectura  : ${paquete.manifiesto.architecture.tipo} entrada ${paquete.manifiesto.architecture.entrada.alto}×${paquete.manifiesto.architecture.entrada.ancho}×${paquete.manifiesto.architecture.entrada.canales}`);
  console.log(`  entrenamiento : run ${paquete.manifiesto.trainingRunId}, ${paquete.manifiesto.datasetLineage?.ejemplos} ejemplos de ${paquete.manifiesto.datasetLineage?.partidas} partidas`);

  const tensores = leerTensores(paquete.pesosSafetensors);
  const cerebro = cargarCerebro(
    paquete.manifiesto.agentId,
    paquete.manifiesto.brainVersion,
    paquete.manifiesto.gameId,
    paquete.manifiesto.architecture,
    tensores,
  );
  const clave = registrarCerebroCargado(cerebro);
  console.log(`✓ cerebro cargado en runtime ts-puro → clave «${clave}»`);

  const rivales: Array<{ etiqueta: string; id: string; config: Record<string, number | boolean> }> = [
    { etiqueta: 'aleatorio', id: 'aleatorio', config: {} },
    { etiqueta: 'heuristico', id: 'heuristico', config: {} },
    { etiqueta: 'minimax-d4', id: 'minimax', config: { profundidad: 4, nodoLimite: 60000, tiempoLimiteMs: 2000 } },
    { etiqueta: 'mcts-500', id: 'mcts', config: { simulaciones: 500, constanteExploracion: 1.4, limiteRollout: 9 } },
  ];

  console.log(`\n=== Partidas reales en el motor TS (${partidasPorRival} por rival, lados alternos, 200 sims PUCT) ===`);
  for (const rival of rivales) {
    let v = 0;
    let e = 0;
    let d = 0;
    const duraciones: number[] = [];
    for (let i = 0; i < partidasPorRival; i++) {
      const neuralPrimero = i % 2 === 0;
      const registro = await ejecutarPartida({
        juegoId: 'tres-en-raya-3',
        semilla: 900000 + i,
        agentes: neuralPrimero
          ? [{ id: clave, config: { simulaciones: 200 } }, { id: rival.id, config: rival.config }]
          : [{ id: rival.id, config: rival.config }, { id: clave, config: { simulaciones: 200 } }],
      });
      duraciones.push(registro.duracionMs);
      const resultado = registro.resultado;
      if (resultado === null || resultado.tipo === 'empate') e++;
      else if (resultado.ganador === (neuralPrimero ? 1 : 2)) v++;
      else d++;
    }
    const n = partidasPorRival;
    const media = duraciones.reduce((a, b) => a + b, 0) / n;
    console.log(
      `  vs ${rival.etiqueta.padEnd(12)}: ${v}V ${e}E ${d}D — puntuación ${((v + e / 2) / n).toFixed(3)} — ${media.toFixed(0)} ms/partida`,
    );
  }
}

await main();
