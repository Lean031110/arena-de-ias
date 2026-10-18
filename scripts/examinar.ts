/**
 * Examen de promoción REAL de una candidata .lba (Tarea E).
 *
 * Ejecuta el protocolo congelado (ADR-007): ≥ 200 partidas contra la
 * referencia congelada del juego (y contra la campeona vigente si existe),
 * con alternancia de lados, umbrales puntuación ≥ 0,60 e IC95 inf > 0,55.
 * Escribe el artefacto JSON con TODOS los números medidos.
 *
 * Nota: usa IndexedDB efímero (fake-indexeddb) como registro local del
 * script; la persistencia real del navegador la gestiona la aplicación.
 *
 * Uso: npx tsx scripts/examinar.ts <ruta-al-.lba> [encuentros] [simulaciones]
 */

import 'fake-indexeddb/auto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAlmacenamiento } from '../src/aplicacion/almacen';
import { RegistroCerebros } from '../src/aplicacion/registroCerebros';
import { examinarCandidata } from '../src/aplicacion/liga';

const AQUI = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const ruta = process.argv[2] ?? 'modelos/candidatas/red-ter-3@1.0.0.lba';
  const encuentros = Number.parseInt(process.argv[3] ?? '240', 10);
  const simulaciones = Number.parseInt(process.argv[4] ?? '200', 10);
  const bytes = new Uint8Array(readFileSync(ruta));

  const almacen = crearAlmacenamiento();
  await almacen.abrir();
  const registro = new RegistroCerebros(almacen);

  const importado = await registro.importarPaquete(bytes);
  console.log(`=== Importación: ${importado.mensaje}`);
  if (importado.resultado === 'colision') process.exit(1);
  const { agentId, brainVersion } = importado.cerebro!;

  console.log(`=== Examen de promoción (criterios ADR-007 congelados) ===`);
  console.log(`    candidata: ${agentId}@${brainVersion}`);
  console.log(`    encuentros: ${encuentros} (lados alternos), simulaciones PUCT: ${simulaciones}`);
  const inicio = Date.now();
  const resultado = await examinarCandidata(registro, { agentId, brainVersion }, {
    juegoId: 'tres-en-raya-3',
    semillaBase: 20261101,
    encuentros,
    simulacionesCandidata: simulaciones,
  });
  const duracion = (Date.now() - inicio) / 1000;

  for (const componente of resultado.componentes) {
    console.log(
      `    vs ${componente.etiqueta}: ${componente.victorias}V ${componente.empates}E ${componente.derrotas}D — puntuación ${componente.puntuacion.toFixed(3)} IC95 [${componente.ic95.inferior.toFixed(3)}, ${componente.ic95.superior.toFixed(3)}] ${componente.aprobado ? '✓ supera' : '✗ NO supera'}`,
    );
  }
  console.log(`    ${resultado.aprobado ? 'APROBADO → promoción registrada' : 'NO APROBADO → sin promoción (la versión anterior se conserva)'}`);
  console.log(`    duración total: ${duracion.toFixed(1)} s`);

  // Artefacto de medición real (todo reproducible con las semillas registradas).
  const destino = resolve(AQUI, '../docs/INFORMES/datos/examen-entrenamiento-fase2.json');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, JSON.stringify({ ...resultado, duracionTotalS: Number(duracion.toFixed(2)) }, null, 2) + '\n', 'utf-8');
  console.log(`    artefacto: ${destino}`);

  await almacen.borrarTodo();
}

await main();
