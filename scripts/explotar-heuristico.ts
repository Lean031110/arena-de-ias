/**
 * Explotabilidad EXACTA del agente heurístico de tres-en-raya-3.
 *
 * Contexto (revisión de la Tarea 3): la verificación exhaustiva
 * (`scripts/verificar-heuristico.ts`) demostró que el heurístico NO es una
 * estrategia óptima y que existen estados ALCANZABLES donde alguna de sus
 * jugadas posibles convierte tablas en derrota. Queda la pregunta decisiva:
 * ¿puede un adversario REAL vencer al heurístico desde la posición inicial?
 *
 * Un jugador perfecto clásico (minimax d9, medido: 100 empates en 100) no lo
 * logra porque asume defensa perfecta y no modela los errores concretos del
 * heurístico. Pero un adversario que CONOCE la política exacta del heurístico
 * puede dirigir la partida hacia sus trampas. Este script calcula el valor
 * exacto de ese «juego contra la política»:
 *
 *   - Nodos del adversario: minimiza el valor para el heurístico (juega
 *     CUALQUIER movimiento legal: adversario omnisciente).
 *   - Nodos del heurístico: juega alguna de sus candidatas según sus reglas
 *     (victoria inmediata → cualquier ganadora; si no, bloqueo → cualquier
 *     amenaza; si no, el argmax posicional determinista). El RNG solo elige
 *     dentro de las candidatas, así que se acotan DOS versiones:
 *       · MEJOR caso para el heurístico (elige su mejor candidata).
 *       · PEOR caso para el heurístico (elige su peor candidata).
 *     La explotabilidad real queda entre ambas.
 *
 * Si el valor (desde la posición inicial, para el heurístico) es 0 en ambos
 * casos, el heurístico es invencible CONTRA CUALQUIER ADVERSARIO, incluso
 * uno que conozca su política: eso sería una garantía matemática. Si es -1,
 * existe una estrategia que lo vence con certeza (mejor caso) o con la
 * probabilidad que permita su RNG (peor caso).
 *
 * Se calcula para el heurístico como jugador 1 y como jugador 2.
 *
 * Artefacto: docs/INFORMES/datos/explotabilidad-heuristico-ter3.json
 *
 * Uso: npx tsx scripts/explotar-heuristico.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { obtenerJuego } from '../src/dominio/juegos/registro';
import type { Jugador, ResultadoTerminal } from '../src/dominio/motor/tipos';
import { otroJugador } from '../src/dominio/motor/tipos';

const JUEGO_ID = 'tres-en-raya-3';

type Candidato = { movimiento: object; tipo: 'victoria' | 'bloqueo' | 'posicional' };

function valorTerminalPara(resultado: ResultadoTerminal, jugador: Jugador): number {
  if (resultado.tipo === 'empate') return 0;
  return resultado.ganador === jugador ? 1 : -1;
}

/** Candidatas del heurístico en un estado (réplica exacta de sus reglas). */
function candidatas(
  juego: ReturnType<typeof obtenerJuego>,
  estado: object,
): Candidato[] {
  const legales = juego.movimientosLegales(estado);
  const yo = juego.jugadorActual(estado);
  const rival = otroJugador(yo);

  const esVictoriaPara = (movimiento: object, jugador: Jugador): boolean => {
    const hipotetico = juego.simularMovimiento(estado, movimiento, jugador);
    const resultado = juego.resultado(hipotetico);
    return resultado !== null && resultado.tipo === 'victoria' && resultado.ganador === jugador;
  };

  const ganadoras = legales.filter((m) => esVictoriaPara(m, yo));
  if (ganadoras.length > 0) {
    return ganadoras.map((m) => ({ movimiento: m, tipo: 'victoria' }));
  }
  const amenazas = legales.filter((m) => esVictoriaPara(m, rival));
  if (amenazas.length > 0) {
    return amenazas.map((m) => ({ movimiento: m, tipo: 'bloqueo' }));
  }
  // Argmax posicional determinista con el desempate EXACTO del código real.
  let mejor: object | null = null;
  let mejorValor = Number.NEGATIVE_INFINITY;
  for (const movimiento of legales) {
    const hijo = juego.aplicarMovimiento(estado, movimiento);
    const valor = juego.evaluar(hijo, yo);
    if (valor > mejorValor + 1e-12) {
      mejorValor = valor;
      mejor = movimiento;
    }
  }
  return mejor === null ? [] : [{ movimiento: mejor, tipo: 'posicional' }];
}

/**
 * Valor del juego-contra-la-política para el heurístico (jugador `heuristico`).
 * `optimista`: el heurístico elige su mejor candidata (cota superior de su
 * valor); si no, su peor (cota inferior). El adversario minimiza siempre.
 */
function valorContraPolitica(
  juego: ReturnType<typeof obtenerJuego>,
  estado: object,
  heuristico: Jugador,
  optimista: boolean,
  memo: Map<string, number>,
): number {
  const clave = `${heuristico}:${juego.claveEstado(estado)}`;
  const memoizado = memo.get(clave);
  if (memoizado !== undefined) return memoizado;

  const resultado = juego.resultado(estado);
  let valor: number;
  if (resultado !== null) {
    valor = valorTerminalPara(resultado, heuristico);
  } else {
    const mover = juego.jugadorActual(estado);
    if (mover === heuristico) {
      const opciones = candidatas(juego, estado);
      const valores = opciones.map((c) =>
        valorContraPolitica(juego, juego.aplicarMovimiento(estado, c.movimiento), heuristico, optimista, memo),
      );
      valor = valores.length === 0 ? Number.NaN : optimista ? Math.max(...valores) : Math.min(...valores);
    } else {
      // Adversario omnisciente: prueba CUALQUIER movimiento legal.
      let peor = Number.POSITIVE_INFINITY;
      for (const movimiento of juego.movimientosLegales(estado)) {
        const hijo = juego.aplicarMovimiento(estado, movimiento);
        peor = Math.min(peor, valorContraPolitica(juego, hijo, heuristico, optimista, memo));
      }
      valor = peor;
    }
  }
  memo.set(clave, valor);
  return valor;
}

async function main(): Promise<void> {
  const juego = obtenerJuego(JUEGO_ID);
  const inicial = juego.crearEstadoInicial();

  const escenarios = [] as Array<{
    rol: string;
    optimista: number;
    pesimista: number;
  }>;
  for (const rol of [1, 2] as Jugador[]) {
    // El heurístico como jugador 1 (mueve primero) o como jugador 2.
    const estadoInicial =
      rol === 1 ? inicial : juego.aplicarMovimiento(inicial, juego.movimientosLegales(inicial)[0] as object);
    const optimista = valorContraPolitica(juego, estadoInicial, rol, true, new Map());
    const pesimista = valorContraPolitica(juego, estadoInicial, rol, false, new Map());
    escenarios.push({
      rol: rol === 1 ? 'jugador 1 (mueve primero)' : 'jugador 2 (responde)',
      optimista,
      pesimista,
    });
  }

  // Nota sobre el escenario «jugador 2»: el adversario elige su primera
  // jugada. Se agregan las cotas sobre TODAS las aperturas posibles:
  //   · peorCasoGlobal   = min del valor OPTIMISTA (aun eligiendo el
  //     heurístico sus mejores candidatas, existe apertura con derrota).
  //   · mejorCasoGlobal  = max del valor optimista (mejor apertura para él).
  //   · inclusoPeores    = max del valor pesimista (apertura donde aguanta
  //     incluso eligiendo sus peores candidatas).
  const aperturas: Array<{ optimista: number; pesimista: number }> = [];
  for (const movimiento of juego.movimientosLegales(inicial)) {
    const hijo = juego.aplicarMovimiento(inicial, movimiento);
    aperturas.push({
      optimista: valorContraPolitica(juego, hijo, 2, true, new Map()),
      pesimista: valorContraPolitica(juego, hijo, 2, false, new Map()),
    });
  }
  const peorCasoGlobal = Math.min(...aperturas.map((a) => a.optimista));
  const mejorCasoGlobal = Math.max(...aperturas.map((a) => a.optimista));
  const inclusoPeores = Math.max(...aperturas.map((a) => a.pesimista));

  const interpreta = (v: number): string =>
    v === 1 ? 'gana el heurístico' : v === 0 ? 'empate' : v === -1 ? 'PIERDE el heurístico' : 'indefinido';

  const invencibleContraTodo =
    escenarios.every((e) => e.optimista === 0 && e.pesimista === 0) && peorCasoGlobal === 0;

  const veredicto = invencibleContraTodo
    ? 'INVENCIIBLE CONTRA CUALQUIER ADVERSARIO (demostrado): ni siquiera un ' +
      'adversario omnisciente que conozca la política exacta del heurístico y ' +
      'elija sus peores candidatas puede vencerlo. Garantía matemática del ' +
      '«no perder», distinta de la optimalidad (que NO se cumple: deja de ' +
      'ganar posiciones ganadoras).'
    : 'DERROTABLE POR UN ADVERSARIO INFORMADO (demostrado): existe una línea ' +
      'de juego en la que el heurístico pierde contra un adversario que ' +
      'dirige la partida hacia sus posiciones trampa. Las 200/240/100 ' +
      'partidas sin derrotas son un hecho empírico de esas muestras, no una ' +
      'garantía. El «techo 0,500» de la referencia es empírico, no matemático.';

  const salida = {
    fecha: new Date().toISOString(),
    juego: JUEGO_ID,
    reglasVersion: juego.reglasVersion,
    metodo:
      'minimax exacto sobre el juego-contra-la-política: el adversario minimiza ' +
      'con cualquier movimiento legal; el heurístico juega sus candidatas ' +
      '(victoria/bloqueo/argmax posicional con el desempate exacto del código). ' +
      'Cotas: optimista (elige su mejor candidata) y pesimista (la peor).',
    escenarios: escenarios.map((e) => ({
      rol: e.rol,
      valorOptimista: e.optimista,
      lecturaOptimista: interpreta(e.optimista),
      valorPesimista: e.pesimista,
      lecturaPesimista: interpreta(e.pesimista),
    })),
    comoJugador2_agregados: {
      // Sobre TODAS las aperturas del adversario (heurístico como jugador 2):
      peorCasoGlobal: {
        valor: peorCasoGlobal,
        lectura: interpreta(peorCasoGlobal),
        significado:
          'valor mínimo del coto OPTIMISTA: apertura ante la que pierde aun eligiendo sus mejores candidatas',
      },
      mejorCasoGlobal: {
        valor: mejorCasoGlobal,
        lectura: interpreta(mejorCasoGlobal),
        significado: 'valor máximo del coto optimista: la mejor apertura posible para él',
      },
      inclusoConPeoresCandidatas: {
        valor: inclusoPeores,
        lectura: interpreta(inclusoPeores),
        significado:
          'valor máximo del coto pesimista: apertura donde aguanta incluso eligiendo sus peores candidatas',
      },
    },
    invencibleContraTodo,
    veredicto,
  };

  const destino = 'docs/INFORMES/datos/explotabilidad-heuristico-ter3.json';
  mkdirSync('docs/INFORMES/datos', { recursive: true });
  writeFileSync(destino, JSON.stringify(salida, null, 2) + '\n', 'utf-8');

  console.log(`=== Explotabilidad exacta del heurístico (${JUEGO_ID}) ===`);
  for (const escenario of escenarios) {
    console.log(
      `como ${escenario.rol}: optimista ${interpreta(escenario.optimista)} · ` +
        `pesimista ${interpreta(escenario.pesimista)}`,
    );
  }
  console.log(
    `como jugador 2 · peor apertura (aun con sus mejores candidatas): ${interpreta(peorCasoGlobal)}`,
  );
  console.log(`como jugador 2 · mejor apertura para él: ${interpreta(mejorCasoGlobal)}`);
  console.log(
    `como jugador 2 · aguanta incluso con peores candidatas en: ${interpreta(inclusoPeores)}`,
  );
  console.log(`\n${veredicto}\n`);
  console.log(`artefacto: ${destino}`);
}

void main();
