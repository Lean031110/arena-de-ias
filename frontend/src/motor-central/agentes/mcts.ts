/**
 * Nivel 4 — MCTS (árbol de Monte Carlo) con UCT y rollouts aleatorios
 * acotados.
 *
 * Presupuesto EXACTO: se ejecutan exactamente `simulaciones` iteraciones
 * (salvo estado terminal en la raíz, donde se ejecutan cero). Los nodos
 * creados son ≤ simulaciones + 1 (una expansión por iteración como máximo).
 *
 * Cada nodo guarda su estado completo (adecuado para tableros de estos
 * tamaños; ver RIESGOS.md R2). Rollouts con RNG del contexto (reproducible)
 * y cap de jugadas: al agotarse se evalúa con la heurística del juego
 * (ESTIMACIÓN, no probabilidad garantizada).
 *
 * Determinista para la misma semilla y estado (empates por UCT/visitas se
 * resuelven por orden de primera aparición).
 */

import type { Agente, ContextoAgente, Decision, EstadisticasBusqueda, Juego, Jugador } from '../motor/tipos';
import { ahoraMs } from '../motor/tipos';
import { ErrorArena } from '../motor/errores';

export interface ConfigMCTS {
  /** Número exacto de simulaciones (por defecto 800). */
  simulaciones?: number;
  /** Constante de exploración UCT (por defecto √2). */
  constanteExploracion?: number;
  /** Cap de jugadas por rollout (por defecto 2 × celdas del tablero). */
  limiteRollout?: number;
}

interface NodoMCTS<S, M> {
  readonly estado: S;
  readonly movimientoGenerador: M | null;
  readonly jugadorQueMovio: Jugador | null;
  readonly padre: NodoMCTS<S, M> | null;
  visitas: number;
  /** Valor acumulado desde la perspectiva de `jugadorQueMovio`. */
  valor: number;
  pendientes: readonly M[];
  readonly hijos: NodoMCTS<S, M>[];
}

/** Valor terminal desde el jugador con turno (null si no terminal). */
function valorTerminalDesdeJugadorAJugar<S extends object, M extends object>(
  juego: Juego<S, M>,
  estado: S,
): number | null {
  const resultado = juego.resultado(estado);
  if (resultado === null) return null;
  if (resultado.tipo === 'empate') return 0;
  const ganador = resultado.ganador;
  const jugadorAJugar = juego.jugadorActual(estado);
  return ganador === jugadorAJugar ? 1 : -1;
}

export function crearAgenteMCTS(config: ConfigMCTS = {}): Agente {
  const simulacionesTotales = Math.max(1, Math.floor(config.simulaciones ?? 800));
  const constanteExploracion = config.constanteExploracion ?? Math.SQRT2;
  const limiteRolloutConfigurado = config.limiteRollout;

  return {
    elegirMovimiento<S extends object, M extends object>(
      juego: Juego<S, M>,
      estado: S,
      contexto: ContextoAgente,
    ): Decision<M> {
      const inicio = ahoraMs();
      const rng = contexto.rng;
      const limiteRollout =
        limiteRolloutConfigurado ?? 2 * juego.dimensiones.ancho * juego.dimensiones.alto;

      if (juego.esTerminal(estado)) {
        throw new ErrorArena('MCTS recibió un estado terminal');
      }

      const raiz: NodoMCTS<S, M> = {
        estado,
        movimientoGenerador: null,
        jugadorQueMovio: null,
        padre: null,
        visitas: 0,
        valor: 0,
        pendientes: juego.movimientosLegales(estado),
        hijos: [],
      };

      let nodos = 1;
      let profundidadMaxima = 0;
      let simulacionesEjecutadas = 0;

      /** Rollout aleatorio acotado; devuelve valor del jugador con turno. */
      const valorRollout = (estadoInicial: S): number => {
        let estadoActual = estadoInicial;
        let jugadas = 0;
        while (!juego.esTerminal(estadoActual) && jugadas < limiteRollout) {
          const legales = juego.movimientosLegales(estadoActual);
          if (legales.length === 0) break;
          estadoActual = juego.aplicarMovimiento(estadoActual, rng.elegirEntre(legales));
          jugadas++;
        }
        const terminal = valorTerminalDesdeJugadorAJugar(juego, estadoActual);
        if (terminal !== null) return terminal;
        // Cap agotado sin terminal: estimación heurística (documentada).
        return juego.evaluar(estadoActual, juego.jugadorActual(estadoActual));
      };

      for (let simulacion = 0; simulacion < simulacionesTotales; simulacion++) {
        simulacionesEjecutadas++;

        /* 1) Selección con UCT hasta nodo con pendientes o terminal. */
        let nodo: NodoMCTS<S, M> = raiz;
        let profundidad = 0;
        while (nodo.pendientes.length === 0 && nodo.hijos.length > 0 && !juego.esTerminal(nodo.estado)) {
          let mejorHijo: NodoMCTS<S, M> | null = null;
          let mejorUCB = Number.NEGATIVE_INFINITY;
          for (const hijo of nodo.hijos) {
            const ucb =
              hijo.visitas === 0
                ? Number.POSITIVE_INFINITY
                : hijo.valor / hijo.visitas +
                  constanteExploracion * Math.sqrt(Math.log(Math.max(1, nodo.visitas)) / hijo.visitas);
            if (ucb > mejorUCB) {
              mejorUCB = ucb;
              mejorHijo = hijo;
            }
          }
          if (mejorHijo === null) break;
          nodo = mejorHijo;
          profundidad++;
        }
        profundidadMaxima = Math.max(profundidadMaxima, profundidad);

        /* 2) Expansión: el primer movimiento pendiente (orden determinista). */
        if (!juego.esTerminal(nodo.estado) && nodo.pendientes.length > 0) {
          const movimiento = nodo.pendientes[0];
          if (movimiento === undefined) break;
          const estadoHijo = juego.aplicarMovimiento(nodo.estado, movimiento);
          const hijo: NodoMCTS<S, M> = {
            estado: estadoHijo,
            movimientoGenerador: movimiento,
            jugadorQueMovio: juego.jugadorActual(nodo.estado),
            padre: nodo,
            visitas: 0,
            valor: 0,
            pendientes: juego.esTerminal(estadoHijo) ? [] : juego.movimientosLegales(estadoHijo),
            hijos: [],
          };
          nodo.hijos.push(hijo);
          nodo.pendientes = nodo.pendientes.slice(1);
          nodos++;
          nodo = hijo;
        }

        /* 3) Simulación. */
        const valorDesdeJugadorAJugar = valorRollout(nodo.estado);

        /* 4) Retropropagación alternando la perspectiva por niveles. */
        let valor = -valorDesdeJugadorAJugar; // perspectiva de quien movió hacia `nodo`
        let actual: NodoMCTS<S, M> | null = nodo;
        while (actual !== null) {
          actual.visitas++;
          if (actual.jugadorQueMovio !== null) {
            actual.valor += valor;
            valor = -valor;
          }
          actual = actual.padre;
        }
      }

      /* Decisión final: hijo más visitado de la raíz. */
      let mejor: NodoMCTS<S, M> | null = null;
      for (const hijo of raiz.hijos) {
        if (mejor === null || hijo.visitas > mejor.visitas) mejor = hijo;
      }
      if (mejor === null || mejor.movimientoGenerador === null) {
        throw new ErrorArena('MCTS no pudo construir árbol con jugadas');
      }

      const estadisticas: EstadisticasBusqueda = {
        nodos,
        simulaciones: simulacionesEjecutadas,
        profundidad: profundidadMaxima,
        tiempoMs: ahoraMs() - inicio,
      };
      return { movimiento: mejor.movimientoGenerador, estadisticas };
    },
  };
}

/** Validación de parámetros MCTS para la configuración de agentes. */
export function validarConfigMCTS(config: Readonly<Record<string, number | boolean>>): string[] {
  const errores: string[] = [];
  const simulaciones = config['simulaciones'];
  if (
    typeof simulaciones === 'number' &&
    (!Number.isInteger(simulaciones) || simulaciones < 1 || simulaciones > 200000)
  ) {
    errores.push('simulaciones debe ser un entero en [1, 200000]');
  }
  const constanteExploracion = config['constanteExploracion'];
  if (
    typeof constanteExploracion === 'number' &&
    (constanteExploracion <= 0 || constanteExploracion > 10)
  ) {
    errores.push('constanteExploracion debe estar en (0, 10]');
  }
  const limiteRollout = config['limiteRollout'];
  if (
    typeof limiteRollout === 'number' &&
    (!Number.isInteger(limiteRollout) || limiteRollout < 0 || limiteRollout > 2000)
  ) {
    errores.push('limiteRollout debe ser un entero en [0, 2000] (0 = automático)');
  }
  return errores;
}
