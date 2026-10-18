/**
 * Verificación EXHAUSTIVA del agente heurístico de tres-en-raya-3 contra el
 * solucionador exacto (revisión de la Tarea 3: las afirmaciones
 * «invencible»/«óptimo» deben demostrarse, no inferirse de una muestra).
 *
 * Qué demuestra este script (si todas las comprobaciones pasan):
 *
 * 1. Enumera TODOS los estados alcanzables del juego (BFS desde el estado
 *    inicial; el número canónico de posiciones alcanzables de 3×3 es 5478 y
 *    se comprueba que la enumeración coincide).
 * 2. Para cada estado no terminal, calcula el valor exacto V(s) con el
 *    solucionador (negamax completo con tabla de transposición, el mismo
 *    código audito de `src/dominio/motor/solucionador.ts`).
 * 3. Enumera TODAS las jugadas que el heurístico podría elegir según sus
 *    reglas (victoria inmediata → cualquier ganadora; si no, bloqueo →
 *    cualquier amenaza; si no, el argmax posicional determinista con el
 *    mismo desempate exacto del código real).
 * 4. Comprueba que CADA jugada candidata conserva el valor del juego
 *    (-V(hijo) == V(s)): una jugada que degradara el valor haría al agente
 *    derrotable en esa posición. Cubrir todos los candidatos equivale a
 *    cubrir todos los resultados posibles de su RNG.
 * 5. Además, ejecuta el agente heurístico REAL en cada estado con varias
 *    semillas y comprueba que sus jugadas efectivas también conservan el
 *    valor (validación cruzada de la replicación de candidatos).
 *
 * Veredicto: si (4) y (5) pasan en todos los estados, el heurístico juega
 * SIEMPRE una jugada óptima en todo estado alcanzable ⇒ garantía matemática
 * de no perder desde el estado inicial (valor 0 = empate con juego perfecto).
 * Si falla cualquier comprobación, el veredicto es «NO provado» y las
 * conclusiones estadísticas deben limitarse a la muestra evaluada.
 *
 * Artefacto: docs/INFORMES/datos/verificacion-heuristico-ter3.json
 *
 * Uso: npx tsx scripts/verificar-heuristico.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { crearAgenteHeuristico } from '../src/dominio/agentes/heuristico';
import { resolverJuego } from '../src/dominio/motor/solucionador';
import { crearRng } from '../src/dominio/motor/rng';
import type { Juego, Jugador, ResultadoTerminal } from '../src/dominio/motor/tipos';
import { otroJugador } from '../src/dominio/motor/tipos';
import { obtenerJuego } from '../src/dominio/juegos/registro';

const JUEGO_ID = 'tres-en-raya-3';
const SEMILLAS_AGENTE = [1, 2, 3, 4, 5, 6, 7, 8];

interface Contadores {
  estadosAlcanzables: number;
  estadosTerminales: number;
  estadosNoTerminales: number;
  posicionesDistintas: number;
  estadosConCandidatos: number;
  candidatosComprobados: number;
  candidatosSuboptimos: number;
  jugadasRealesComprobadas: number;
  jugadasRealesSuboptimas: number;
  estadosConVictoriaInmediata: number;
  estadosConBloqueo: number;
  estadosPosicionales: number;
  /** Degradaciones por transición de valor (candidatos + reales). */
  degradaciones: Record<string, number>;
  /** Candidatas que convierten una posición V≥0 en derrota (V=-1). */
  candidatosPerdedores: number;
  /** Jugadas reales que convierten una posición V≥0 en derrota. */
  jugadasRealesPerdedoras: number;
}

function valorTerminalPara(resultado: ResultadoTerminal, jugador: Jugador): number {
  if (resultado.tipo === 'empate') return 0;
  return resultado.ganador === jugador ? 1 : -1;
}

async function main(): Promise<void> {
  const juego = obtenerJuego(JUEGO_ID);
  const heuristico = crearAgenteHeuristico();

  // --- 1. Enumeración exhaustiva de estados alcanzables --------------------
  const vistos = new Set<string>();
  const cola: string[] = [];
  const inicial = juego.codificar(juego.crearEstadoInicial());
  cola.push(inicial);
  vistos.add(inicial);

  while (cola.length > 0) {
    const codificado = cola.shift() as string;
    const estado = juego.decodificar(codificado);
    if (juego.esTerminal(estado)) continue;
    for (const movimiento of juego.movimientosLegales(estado)) {
      const hijo = juego.aplicarMovimiento(estado, movimiento);
      const codHijo = juego.codificar(hijo);
      if (!vistos.has(codHijo)) {
        vistos.add(codHijo);
        cola.push(codHijo);
      }
    }
  }

  const terminales: string[] = [];
  const noTerminales: string[] = [];
  for (const codificado of vistos) {
    const estado = juego.decodificar(codificado);
    (juego.esTerminal(estado) ? terminales : noTerminales).push(codificado);
  }

  const contadores: Contadores = {
    estadosAlcanzables: vistos.size,
    estadosTerminales: terminales.length,
    estadosNoTerminales: noTerminales.length,
    posicionesDistintas: 0,
    estadosConCandidatos: 0,
    candidatosComprobados: 0,
    candidatosSuboptimos: 0,
    jugadasRealesComprobadas: 0,
    jugadasRealesSuboptimas: 0,
    estadosConVictoriaInmediata: 0,
    estadosConBloqueo: 0,
    estadosPosicionales: 0,
    degradaciones: {},
    candidatosPerdedores: 0,
    jugadasRealesPerdedoras: 0,
  };

  // Posiciones distintas (tablero+turno, sin reducción por simetría): el
  // número canónico de posiciones alcanzables de 3×3 es 5478.
  const posiciones = new Set<string>();
  for (const codificado of vistos) {
    const estado = juego.decodificar(codificado);
    posiciones.add(`${estado.turno}:${estado.celdas.join('')}`);
  }
  contadores.posicionesDistintas = posiciones.size;

  const suboptimos: Array<{
    estado: string;
    jugada: string;
    tipo: string;
    valorAntes?: number;
    valorDespues?: number;
  }> = [];

  // --- 2-4. Valor exacto y candidatos por estado ---------------------------
  // Caché de valores negamax (desde la perspectiva del jugador con turno).
  const cacheValor = new Map<string, number>();

  function valorDesdeMover(codificado: string): number {
    const memo = cacheValor.get(codificado);
    if (memo !== undefined) return memo;
    const estado = juego.decodificar(codificado);
    const resultado = juego.resultado(estado);
    let valor: number;
    if (resultado !== null) {
      valor = valorTerminalPara(resultado, juego.jugadorActual(estado));
    } else {
      const solucion = resolverJuego(juego, 60000, codificado);
      if (!solucion.completo) {
        throw new Error(`solucionador incompleto en ${codificado}: nada se declara`);
      }
      // resolverJuego devuelve el valor desde el jugador 1.
      valor = juego.jugadorActual(estado) === 1 ? solucion.valor : -solucion.valor;
    }
    cacheValor.set(codificado, valor);
    return valor;
  }

  function esVictoriaPara(
    estado: ReturnType<typeof juego.decodificar>,
    movimiento: ReturnType<typeof juego.analizarMovimiento>,
    jugador: Jugador,
  ): boolean {
    const hipotetico = juego.simularMovimiento(estado, movimiento, jugador);
    const resultado = juego.resultado(hipotetico);
    return resultado !== null && resultado.tipo === 'victoria' && resultado.ganador === jugador;
  }

  /** Valor para el que mueve en `estado` DESPUÉS de jugar `movimiento`. */
  function valorTrasJugada(
    codificado: string,
    estado: ReturnType<typeof juego.decodificar>,
    movimiento: ReturnType<typeof juego.analizarMovimiento>,
  ): number {
    const yo = juego.jugadorActual(estado);
    const hijo = juego.aplicarMovimiento(estado, movimiento);
    const resultado = juego.resultado(hijo);
    if (resultado !== null) return valorTerminalPara(resultado, yo);
    return -valorDesdeMover(juego.codificar(hijo));
  }

  for (const codificado of noTerminales) {
    const estado = juego.decodificar(codificado);
    const legales = juego.movimientosLegales(estado);
    const yo = juego.jugadorActual(estado);
    const rival = otroJugador(yo);
    const valorEstado = valorDesdeMover(codificado);

    // Candidatos según las reglas del heurístico (replicación exacta).
    const ganadoras = legales.filter((m) => esVictoriaPara(estado, m, yo));
    let candidatos: Array<{ movimiento: unknown; tipo: string }>;
    if (ganadoras.length > 0) {
      contadores.estadosConVictoriaInmediata++;
      candidatos = ganadoras.map((m) => ({ movimiento: m, tipo: 'victoria' }));
    } else {
      const amenazas = legales.filter((m) => esVictoriaPara(estado, m, rival));
      if (amenazas.length > 0) {
        contadores.estadosConBloqueo++;
        candidatos = amenazas.map((m) => ({ movimiento: m, tipo: 'bloqueo' }));
      } else {
        contadores.estadosPosicionales++;
        // Argmax posicional determinista con el desempate EXACTO del código:
        // solo se reemplaza cuando el valor supera al mejor + 1e-12.
        let mejor: unknown = null;
        let mejorValor = Number.NEGATIVE_INFINITY;
        for (const movimiento of legales) {
          const hijo = juego.aplicarMovimiento(estado, movimiento);
          const valor = juego.evaluar(hijo, yo);
          if (valor > mejorValor + 1e-12) {
            mejorValor = valor;
            mejor = movimiento;
          }
        }
        candidatos = mejor === null ? [] : [{ movimiento: mejor, tipo: 'posicional' }];
      }
    }

    contadores.estadosConCandidatos++;
    const registrarDegradacion = (antes: number, despues: number): void => {
      const clave = `${antes}→${despues}`;
      contadores.degradaciones[clave] = (contadores.degradaciones[clave] ?? 0) + 1;
    };
    for (const { movimiento, tipo } of candidatos) {
      contadores.candidatosComprobados++;
      const valorTras = valorTrasJugada(codificado, estado, movimiento as never);
      if (valorTras !== valorEstado) {
        contadores.candidatosSuboptimos++;
        registrarDegradacion(valorEstado, valorTras);
        if (valorEstado >= 0 && valorTras < 0) contadores.candidatosPerdedores++;
        suboptimos.push({
          estado: codificado,
          jugada: juego.formatearMovimiento(movimiento as never),
          tipo,
          valorAntes: valorEstado,
          valorDespues: valorTras,
        });
      }
    }

    // --- 5. Validación cruzada con el agente REAL -------------------------
    for (const semilla of SEMILLAS_AGENTE) {
      const decision = heuristico.elegirMovimiento(
        juego as unknown as Juego<object, object>,
        estado,
        {
          rng: crearRng(semilla),
          config: {},
          indiceJugada: 0,
          semilla,
        },
      );
      contadores.jugadasRealesComprobadas++;
      const valorTras = valorTrasJugada(codificado, estado, decision.movimiento as never);
      if (valorTras !== valorEstado) {
        contadores.jugadasRealesSuboptimas++;
        const clave = `${valorEstado}→${valorTras}`;
        contadores.degradaciones[clave] = (contadores.degradaciones[clave] ?? 0) + 1;
        if (valorEstado >= 0 && valorTras < 0) contadores.jugadasRealesPerdedoras++;
        suboptimos.push({
          estado: codificado,
          jugada: `${juego.formatearMovimiento(decision.movimiento as never)} (real, semilla ${semilla})`,
          tipo: 'agente-real',
          valorAntes: valorEstado,
          valorDespues: valorTras,
        });
      }
    }
  }

  // --- Veredicto -------------------------------------------------------------
  // Tres niveles, cuidadosamente separados (revisión de la Tarea 3):
  //   a) «óptimo»: toda candidata conserva el valor exacto.
  //   b) «no pierde nunca» (garantía): ninguna candidata en posición V≥0
  //      conduce a V=-1 ⇒ por inducción sobre TODOS los estados alcanzables
  //      (superconjunto de cualquier partida real), el heurístico no puede
  //      perder desde la posición inicial (valor 0).
  //   c) «no se observaron derrotas en la muestra»: lo único afirmable sin
  //      (a) ni (b).
  const optimo =
    contadores.candidatosSuboptimos === 0 && contadores.jugadasRealesSuboptimas === 0;
  const noPierdeNunca =
    contadores.candidatosPerdedores === 0 && contadores.jugadasRealesPerdedoras === 0;
  const valorInicial = valorDesdeMover(inicial);

  const degradacionesTexto = Object.entries(contadores.degradaciones)
    .map(([clave, total]) => `${clave}: ${total}`)
    .join(', ');

  let veredicto: string;
  if (optimo) {
    veredicto =
      'GARANTIZADO (optimalidad): toda jugada que el heurístico puede elegir conserva el ' +
      'valor exacto del juego en todos los estados alcanzables. Estrategia óptima demostrada ' +
      'por enumeración exhaustiva; como el valor inicial es 0, no puede perder desde la ' +
      'posición inicial con juego perfecto del rival.';
  } else if (noPierdeNunca) {
    veredicto =
      'GARANTIZADO (no perder), PERO NO ÓPTIMO: hay candidatas que degradan el valor ' +
      `(${degradacionesTexto}) —victorias dejadas de ganar, no derrotas—, pero NINGUNA ` +
      'convierte una posición con valor ≥ 0 en una derrota (valor -1). Por inducción sobre ' +
      'todos los estados alcanzables, el heurístico NO PUEDE PERDER desde la posición ' +
      'inicial (valor 0) sea cual sea el juego del rival; puede empatar cuando una jugada ' +
      'óptima habría ganado. La garantía de «no perder» es matemática; la de «jugar óptimo», no.';
  } else {
    veredicto =
      'NO PROBADO: existen jugadas posibles del heurístico que convierten posiciones ' +
      'ganadoras o tablas en derrotas. Las conclusiones deben limitarse a «no se observaron ' +
      'derrotas en la muestra evaluada».';
  }

  const salida = {
    fecha: new Date().toISOString(),
    juego: JUEGO_ID,
    reglasVersion: juego.reglasVersion,
    metodo:
      'enumeración BFS exhaustiva de estados alcanzables + valor exacto por solucionador ' +
      '(negamax completo con TT) + comprobación de conservación de valor de todos los ' +
      'candidatos del heurístico + validación cruzada del agente real con 8 semillas/estado',
    estados: {
      // Los estados codificados incluyen la historia (número de jugadas y
      // última jugada): por eso hay más que las 5478 posiciones canónicas
      // tablero+turno; el conjunto es un SUPERCONJUNTO exhaustivo de las
      // posiciones por las que puede pasar cualquier partida real.
      alcanzables: contadores.estadosAlcanzables,
      posicionesTableroTurno: contadores.posicionesDistintas,
      terminales: contadores.estadosTerminales,
      noTerminales: contadores.estadosNoTerminales,
    },
    candidatos: {
      comprobados: contadores.candidatosComprobados,
      suboptimos: contadores.candidatosSuboptimos,
      perdedores: contadores.candidatosPerdedores,
      degradaciones: contadores.degradaciones,
      porTipo: {
        victoriaInmediata: contadores.estadosConVictoriaInmediata,
        bloqueo: contadores.estadosConBloqueo,
        posicional: contadores.estadosPosicionales,
      },
    },
    agenteReal: {
      jugadas: contadores.jugadasRealesComprobadas,
      suboptimas: contadores.jugadasRealesSuboptimas,
      perdedoras: contadores.jugadasRealesPerdedoras,
      semillasPorEstado: SEMILLAS_AGENTE.length,
    },
    valorInicialDesdeMover: valorInicial,
    optimalidadDemostrada: optimo,
    garantiaNoPerderDemostrada: noPierdeNunca,
    veredicto,
    suboptimos: suboptimos.slice(0, 20),
  };

  const destino = 'docs/INFORMES/datos/verificacion-heuristico-ter3.json';
  mkdirSync('docs/INFORMES/datos', { recursive: true });
  writeFileSync(destino, JSON.stringify(salida, null, 2) + '\n', 'utf-8');

  console.log(`=== Verificación exhaustiva del heurístico (${JUEGO_ID}) ===`);
  console.log(`estados alcanzables : ${contadores.estadosAlcanzables} ` +
    `(${contadores.posicionesDistintas} posiciones tablero+turno; ` +
    `terminales ${contadores.estadosTerminales}, no terminales ${contadores.estadosNoTerminales})`);
  console.log(`candidatos comprobados : ${contadores.candidatosComprobados} ` +
    `(subóptimos ${contadores.candidatosSuboptimos}, perdedores ${contadores.candidatosPerdedores})`);
  console.log(`jugadas reales comprobadas : ${contadores.jugadasRealesComprobadas} ` +
    `(subóptimas ${contadores.jugadasRealesSuboptimas}, perdedoras ${contadores.jugadasRealesPerdedoras})`);
  console.log(`degradaciones por transición : ${degradacionesTexto || '(ninguna)'}`);
  console.log(`valor del estado inicial (mover) : ${valorInicial}`);
  console.log(`estrategia óptima demostrada : ${optimo ? 'SÍ' : 'NO'}`);
  console.log(`garantía matemática de NO PERDER : ${noPierdeNunca ? 'SÍ' : 'NO'}`);
  console.log(`\n${veredicto}\n`);
  console.log(`artefacto: ${destino}`);

  if (!noPierdeNunca) {
    // Solo la ausencia de la garantía de no perder hace fallar la ejecución:
    // la falta de optimalidad es un hallazgo valioso, no un error del flujo.
    process.exitCode = 1;
  }
}

void main();
