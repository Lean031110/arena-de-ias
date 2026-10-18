'use client';

/**
 * Corredor de partidas EN VIVO sobre el motor real vendorizado.
 *
 * La ejecución es 100 % del núcleo (`ejecutarPartida`); este módulo solo
 * aporta un Decisor que:
 *  - espera la jugada humana cuando corresponde,
 *  - respeta la compuerta de reproducción (pausa / paso / velocidad),
 *  - notifica cada estado para que la interfaz pinte el tablero.
 *
 * Nada de reglas duplicadas: legalidad y resultados salen del motor.
 */

import type { Decision, EstadisticasBusqueda, Jugador, JuegoConcreto, MovimientoConcreto, VistaTablero } from '@/motor-central/motor/tipos';
import type { Decisor, ConfigPartida, RegistroPartida, ParametrosDecision } from '@/motor-central/motor/partida';
import { ejecutarPartida } from '@/motor-central/motor/partida';
import { crearAgente } from '@/motor-central/agentes/registro';
import type { ConfigAgentePartida } from '@/motor-central/motor/partida';

export interface JugadaVisible {
  readonly indice: number;
  readonly jugador: Jugador;
  readonly notacion: string;
  readonly estadisticas: EstadisticasBusqueda;
}

export interface EventosCorredor {
  onVista(vista: VistaTablero): void;
  onPensando(jugador: Jugador | null, esperaHumano: boolean): void;
  onJugada(jugada: JugadaVisible, vistaTras: VistaTablero): void;
  onFinal(registro: RegistroPartida): void;
  onAbortada(): void;
}

/** Compuerta de reproducción: pausa / paso / velocidad. */
export class Compuerta {
  private esperas: Array<() => void> = [];
  private pausada = false;
  private cancelada = false;
  velocidadMs = 900;

  pausar(): void {
    this.pausada = true;
  }

  reanudar(): void {
    this.pausada = false;
    const pendientes = [...this.esperas];
    this.esperas = [];
    for (const resolver of pendientes) resolver();
  }

  paso(): void {
    this.pausada = true;
    const siguiente = this.esperas.shift();
    siguiente?.();
  }

  cancelar(): void {
    this.cancelada = true;
    const pendientes = [...this.esperas];
    this.esperas = [];
    for (const resolver of pendientes) resolver();
  }

  get estaPausada(): boolean {
    return this.pausada;
  }

  get estaCancelada(): boolean {
    return this.cancelada;
  }

  private dormir(ms: number): Promise<void> {
    return new Promise((resolver) => {
      const inicio = Date.now();
      const revisar = (): void => {
        if (this.cancelada || this.pausada || Date.now() - inicio >= ms) resolver();
        else window.setTimeout(revisar, Math.min(80, ms));
      };
      window.setTimeout(revisar, Math.min(80, ms));
    });
  }

  async esperar(): Promise<void> {
    if (this.cancelada) return;
    if (this.pausada) {
      await new Promise<void>((resolver) => this.esperas.push(resolver));
      return;
    }
    await this.dormir(this.velocidadMs);
  }
}

export class CorredorPartida {
  private readonly config: ConfigPartida;
  private readonly eventos: EventosCorredor;
  readonly compuerta = new Compuerta();
  private resolverHumano: ((movimiento: MovimientoConcreto) => void) | null = null;
  private estadoActual: unknown = null;
  private juego: JuegoConcreto | null = null;
  private enMarcha = false;

  constructor(config: ConfigPartida, eventos: EventosCorredor) {
    this.config = config;
    this.eventos = eventos;
  }

  get jugando(): boolean {
    return this.enMarcha;
  }

  get esperandoHumano(): boolean {
    return this.resolverHumano !== null;
  }

  obtenerEstadoActual(): unknown {
    return this.estadoActual;
  }

  /** Jugada humana validada previamente por la interfaz contra el motor. */
  jugarHumano(movimiento: MovimientoConcreto): boolean {
    const resolver = this.resolverHumano;
    if (resolver === null) return false;
    this.resolverHumano = null;
    resolver(movimiento);
    return true;
  }

  private async decidir(parametros: ParametrosDecision<object, object>): Promise<Decision<MovimientoConcreto>> {
    this.juego = parametros.juego as JuegoConcreto;
    this.estadoActual = parametros.estado;
    this.eventos.onVista(parametros.juego.vista(parametros.estado));

    if (this.compuerta.estaCancelada) {
      throw new Error('partida cancelada por el observador');
    }

    if (parametros.infoAgente.id === 'humano') {
      this.eventos.onPensando(parametros.jugador, true);
      const movimiento = await new Promise<MovimientoConcreto>((resolver) => {
        this.resolverHumano = resolver;
      });
      this.eventos.onPensando(null, false);
      return { movimiento, estadisticas: { tiempoMs: 0 } };
    }
    await this.compuerta.esperar();
    if (this.compuerta.estaCancelada) {
      throw new Error('partida cancelada por el observador');
    }

    this.eventos.onPensando(parametros.jugador, false);
    await new Promise((resolver) => window.requestAnimationFrame(() => resolver(null)));
    try {
      const agente = crearAgente(parametros.infoAgente.id, parametros.infoAgente.config);
      const decision = agente.elegirMovimiento(
        parametros.juego,
        parametros.estado,
        parametros.contexto,
      ) as Decision<MovimientoConcreto>;
      this.eventos.onPensando(null, false);
      // Vista tras la jugada para que el tablero se pinte de inmediato
      // (la validación real la hace ejecutarPartida, aquí solo presentación).
      try {
        const tras = parametros.juego.aplicarMovimiento(parametros.estado, decision.movimiento);
        this.estadoActual = tras;
        this.eventos.onJugada(
          {
            indice: parametros.contexto.indiceJugada,
            jugador: parametros.jugador,
            notacion: parametros.juego.formatearMovimiento(decision.movimiento),
            estadisticas: decision.estadisticas,
          },
          parametros.juego.vista(tras),
        );
      } catch {
        /* la vista trasera es cosmética; el motor decidirá la validez */
      }
      return decision;
    } catch (error) {
      this.eventos.onPensando(null, false);
      throw error;
    }
  }

  async ejecutar(): Promise<RegistroPartida | null> {
    this.enMarcha = true;
    const decisor: Decisor = (parametros) => this.decidir(parametros as ParametrosDecision<object, object>);
    try {
      const registro = await ejecutarPartida(this.config, decisor);
      if (this.compuerta.estaCancelada) {
        this.eventos.onAbortada();
        return null;
      }
      this.eventos.onFinal(registro);
      return registro;
    } catch (error) {
      if (this.compuerta.estaCancelada) {
        this.eventos.onAbortada();
        return null;
      }
      throw error;
    } finally {
      this.enMarcha = false;
      this.eventos.onPensando(null, false);
    }
  }
}

/* ─── Candidatos para jugador humano (motor real, evaluación ESTIMADA) ─── */

export interface CandidatoHumano {
  readonly notacion: string;
  readonly movimiento: MovimientoConcreto;
  readonly valorEstimado: number;
}

/**
 * Lista de jugadas legales con su evaluación heurística (juego.evaluar del
 * motor, en [-1, 1] desde la perspectiva del jugador con turno).
 * Es una ESTIMACIÓN declarada, no una probabilidad ni política neuronal.
 */
export function calcularCandidatos(juego: JuegoConcreto, estado: unknown): readonly CandidatoHumano[] {
  try {
    const jugador = juego.jugadorActual(estado);
    return juego.movimientosLegales(estado).map((movimiento) => {
      const simulado = juego.simularMovimiento(estado, movimiento, jugador);
      return {
        notacion: juego.formatearMovimiento(movimiento),
        movimiento,
        valorEstimado: juego.evaluar(simulado, jugador),
      };
    });
  } catch {
    return [];
  }
}

/** Info de agente para mostrar: params efectivos de la configuración. */
export function infoAgentes(config: ConfigPartida): readonly ConfigAgentePartida[] {
  return config.agentes;
}
