/**
 * Benchmark de latencia de inferencia del runtime neuronal «ts-puro»
 * (revisión de la Tarea 3: la cifra «inferencia < 1 ms» debe sustituirse por
 * una medición documentada y reproducible).
 *
 * Qué mide: `adelante()` de `src/dominio/neural/red.ts` sobre
 * `conv-politica-valor-v1` con los pesos REALES de un cerebro .lba versionado
 * (red-ter-3@1.0.1), sobre entradas generadas a partir de posiciones reales
 * de partidas (no datos sintéticos arbitrarios).
 *
 * Documenta: hardware (modelo de CPU, núcleos, carga), versiones (Node, SO),
 * número de ejecuciones, calentamiento, latencia mediana, percentiles
 * (p90/p95/p99), mínimo y máximo, y condiciones (un solo hilo, proceso
 * Node, entradas rotadas para no medir un único caso de caché).
 *
 * Artefacto: docs/INFORMES/datos/latencia-inferencia-ter3.json
 *
 * Uso: npx tsx scripts/medir-latencia-inferencia.ts [cerebro.lba]
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, hostname, loadavg, platform, release } from 'node:os';
import { crearRng } from '../src/dominio/motor/rng';
import { obtenerJuego } from '../src/dominio/juegos/registro';
import { agenteAleatorio } from '../src/dominio/agentes/aleatorio';
import { validarPaqueteLBA } from '../src/dominio/lba/validador';
import { leerTensores } from '../src/dominio/lba/safetensors';
import { adelante, cargarPesos, contarParametros } from '../src/dominio/neural/red';
import { observarTablero } from '../src/dominio/neural/observacion';

const CALENTAMIENTO = 2000;
const EJECUCIONES = 5000;

function percentil(muestras: number[], p: number): number {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  const indice = Math.min(
    ordenadas.length - 1,
    Math.max(0, Math.ceil((p / 100) * ordenadas.length) - 1),
  );
  return ordenadas[indice] ?? 0;
}

async function main(): Promise<void> {
  const rutaCerebro = process.argv[2] ?? 'modelos/versionados/red-ter-3@1.0.1.lba';
  const bytes = new Uint8Array(readFileSync(rutaCerebro));
  const paquete = await validarPaqueteLBA(bytes);
  const tensores = leerTensores(paquete.pesosSafetensors);
  const pesos = cargarPesos(tensores);
  const parametros = contarParametros(paquete.manifiesto.architecture);

  // Posiciones de entrada: tableros REALES alcanzados en partidas entre
  // agentes aleatorios (distribución representativa de autojuego).
  const juego = obtenerJuego('tres-en-raya-3');
  const aleatorio = agenteAleatorio;
  const entradas: Float32Array[] = [];
  for (let i = 0; i < 200; i++) {
    let estado = juego.crearEstadoInicial();
    const jugadas = i % 9;
    for (let j = 0; j < jugadas; j++) {
      if (juego.esTerminal(estado)) break;
      const decision = aleatorio.elegirMovimiento(juego, estado, {
        rng: crearRng(1000 + i * 10 + j),
        config: {},
        indiceJugada: j,
        semilla: 1000 + i,
      });
      estado = juego.aplicarMovimiento(estado, decision.movimiento);
    }
    if (!juego.esTerminal(estado)) {
      entradas.push(observarTablero(estado as never, 3, 3));
    }
  }

  if (entradas.length === 0) {
    throw new Error('no se generaron entradas para el benchmark');
  }

  // Medición: una inferencia completa (política+valor) por muestra; se rota
  // la entrada para no medir un único caso favorable de caché.
  const muestras: number[] = [];
  for (let i = 0; i < CALENTAMIENTO + EJECUCIONES; i++) {
    const entrada = entradas[i % entradas.length] as Float32Array;
    const inicio = performance.now();
    adelante(pesos, paquete.manifiesto.architecture, entrada);
    const fin = performance.now();
    if (i >= CALENTAMIENTO) {
      muestras.push(fin - inicio);
    }
  }

  const muestrasOrdenadas = [...muestras].sort((a, b) => a - b);

  let modeloCpu = 'desconocido';
  try {
    const salida = execSync(
      platform() === 'linux'
        ? "grep -m1 'model name' /proc/cpuinfo | cut -d: -f2"
        : 'sysctl -n machdep.cpu.brand_string',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    modeloCpu = salida || modeloCpu;
  } catch {
    /* sin etiqueta de CPU disponible: queda «desconocido» */
  }

  const salida = {
    fecha: new Date().toISOString(),
    que: 'latencia de UNA inferencia completa (política+valor) del runtime ts-puro',
    runtime: {
      tipo: 'TypeScript puro (sin librerías externas), función adelante()',
      arquitectura: 'conv-politica-valor-v1',
      juego: 'tres-en-raya-3',
      parametros,
      cerebro: `${paquete.manifiesto.agentId}@${paquete.manifiesto.brainVersion}`,
      archivo: rutaCerebro,
    },
    condiciones: {
      ejecuciones: EJECUCIONES,
      calentamiento: CALENTAMIENTO,
      entradasDistintas: entradas.length,
      origenEntradas:
        'posiciones reales de partidas entre agentes aleatorios (semillas fijas 1000+i*10+j)',
      hilo: 'hilo principal de Node (un solo hilo)',
      ejecucion: 'tsx (TypeScript ejecutado directamente, JIT de V8 tras calentamiento)',
    },
    hardware: {
      modeloCpu,
      nucleosLogicos: cpus().length,
      cargaMedia1m: Number(loadavg()[0]?.toFixed(2)),
      plataforma: `${platform()} ${release()}`,
      host: hostname().replace(/\d+/g, 'X'),
      node: process.version,
    },
    resultados: {
      medianaMs: Number(percentil(muestras, 50).toFixed(4)),
      mediaMs: Number((muestras.reduce((a, b) => a + b, 0) / muestras.length).toFixed(4)),
      p90Ms: Number(percentil(muestras, 90).toFixed(4)),
      p95Ms: Number(percentil(muestras, 95).toFixed(4)),
      p99Ms: Number(percentil(muestras, 99).toFixed(4)),
      minimoMs: Number((muestrasOrdenadas[0] ?? 0).toFixed(4)),
      maximoMs: Number((muestrasOrdenadas[muestrasOrdenadas.length - 1] ?? 0).toFixed(4)),
    },
    reproducibilidad:
      'npx tsx scripts/medir-latencia-inferencia.ts (entradas con semillas fijas; las ' +
      'latencias absolutas varían con la carga de la máquina: citar hardware y fecha)',
  };

  const destino = 'docs/INFORMES/datos/latencia-inferencia-ter3.json';
  mkdirSync('docs/INFORMES/datos', { recursive: true });
  writeFileSync(destino, JSON.stringify(salida, null, 2) + '\n', 'utf-8');

  console.log(`=== Latencia de inferencia ts-puro (${salida.runtime.cerebro}, ${parametros} parámetros) ===`);
  console.log(
    `ejecuciones: ${EJECUCIONES} (+${CALENTAMIENTO} de calentamiento) sobre ${entradas.length} entradas reales`,
  );
  console.log(`CPU: ${modeloCpu} · ${cpus().length} núcleos · Node ${process.version} · ${platform()}`);
  console.log(
    `mediana: ${salida.resultados.medianaMs} ms · media: ${salida.resultados.mediaMs} ms`,
  );
  console.log(
    `p90: ${salida.resultados.p90Ms} ms · p95: ${salida.resultados.p95Ms} ms · p99: ${salida.resultados.p99Ms} ms`,
  );
  console.log(
    `min: ${salida.resultados.minimoMs} ms · max: ${salida.resultados.maximoMs} ms`,
  );
  console.log(`artefacto: ${destino}`);
}

void main();
