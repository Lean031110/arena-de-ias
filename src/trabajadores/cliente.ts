/**
 * Cliente del trabajador web con degradación elegante: sin Worker
 * (navegadores antiguos o entornos de prueba), ejecuta el dominio en el
 * hilo principal e informa de la degradación.
 */

import type { ConfigAgentePartida, ConfigPartida, RegistroPartida } from '../dominio/motor/partida';
import type { ConfigEvaluacion, RegistroEvaluacion, ResultadoCancelado } from '../dominio/motor/evaluacion';
import type { EstadisticasBusqueda, Jugador } from '../dominio/motor/tipos';
import type { ManifiestoLBA } from '../dominio/lba/esquema';
import { ejecutarEvaluacion as ejecutarEvaluacionDominio } from '../dominio/motor/evaluacion';
import { ejecutarPartida as ejecutarPartidaDominio, semillaParaJugada } from '../dominio/motor/partida';
import { obtenerJuego } from '../dominio/juegos/registro';
import { crearAgente } from '../dominio/agentes/registro';
import { crearRng } from '../dominio/motor/rng';
import type { SolicitudTrabajador, RespuestaTrabajador, TensorParaTrabajador } from './protocolo';

interface Pendiente {
  resolver: (valor: RespuestaTrabajador) => void;
  rechazar: (error: Error) => void;
}

export class ClienteTrabajador {
  private trabajador: Worker | null = null;
  private readonly pendientes = new Map<string, Pendiente>();
  private readonly progreso = new Map<string, (completadas: number, total: number) => void>();
  private ultimoErrorCarga: string | null = null;

  constructor() {
    try {
      this.trabajador = new Worker(new URL('./trabajador.ts', import.meta.url), {
        type: 'module',
      });
      this.trabajador.onmessage = (evento: MessageEvent<RespuestaTrabajador>) => {
        this.manejarRespuesta(evento.data);
      };
      this.trabajador.onerror = (evento) => {
        this.ultimoErrorCarga = `error del trabajador: ${evento.message}`;
      };
    } catch (error) {
      this.trabajador = null;
      this.ultimoErrorCarga = error instanceof Error ? error.message : String(error);
    }
  }

  /** ¿Hay trabajador disponible (true) o se degrada al hilo principal? */
  get disponible(): boolean {
    return this.trabajador !== null;
  }

  /** Último error de carga del trabajador (diagnóstico), si lo hubo. */
  get motivoDegradacion(): string | null {
    return this.ultimoErrorCarga;
  }

  private manejarRespuesta(respuesta: RespuestaTrabajador): void {
    if (respuesta.tipo === 'evaluacion-progreso') {
      this.progreso.get(respuesta.id)?.(respuesta.completadas, respuesta.total);
      return;
    }
    const pendiente = this.pendientes.get(respuesta.id);
    if (pendiente === undefined) return;
    this.pendientes.delete(respuesta.id);
    if (respuesta.tipo === 'error') {
      pendiente.rechazar(new Error(respuesta.mensaje));
    } else {
      pendiente.resolver(respuesta);
    }
  }

  private pedir(solicitud: SolicitudTrabajador): Promise<RespuestaTrabajador> {
    const trabajador = this.trabajador;
    if (trabajador === null) {
      return Promise.reject(new Error('trabajador no disponible'));
    }
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(solicitud.id, { resolver, rechazar });
      trabajador.postMessage(solicitud);
    });
  }

  /** Registra un cerebro .lba en el TRABAJADOR (inferencia fuera del hilo principal). */
  async registrarCerebro(
    manifiesto: ManifiestoLBA,
    tensores: readonly TensorParaTrabajador[],
  ): Promise<string> {
    const id = generarIdCorto();
    const respuesta = await this.pedir({ tipo: 'registrar-cerebro', id, manifiesto, tensores });
    if (respuesta.tipo !== 'cerebro-registrado') {
      throw new Error(`respuesta inesperada del trabajador: ${respuesta.tipo}`);
    }
    return respuesta.clave;
  }

  /** Retira un cerebro del trabajador. */
  async retirarCerebro(clave: string): Promise<void> {
    const id = generarIdCorto();
    const respuesta = await this.pedir({ tipo: 'retirar-cerebro', id, clave });
    if (respuesta.tipo !== 'cerebro-retirado') {
      throw new Error(`respuesta inesperada del trabajador: ${respuesta.tipo}`);
    }
  }

  /** Calcula una jugada concreta (para partidas interactivas). */
  async calcularMovimiento(
    juegoId: string,
    estadoCodificado: string,
    agente: ConfigAgentePartida,
    semilla: number,
    indiceJugada: number,
    jugador: Jugador,
  ): Promise<{ notacion: string; estadisticas: EstadisticasBusqueda }> {
    if (!this.disponible) {
      return this.calcularMovimientoLocal(juegoId, estadoCodificado, agente, semilla, indiceJugada, jugador);
    }
    const id = generarIdCorto();
    const respuesta = await this.pedir({
      tipo: 'movimiento',
      id,
      juegoId,
      estadoCodificado,
      agente,
      semilla,
      indiceJugada,
      jugador,
    });
    if (respuesta.tipo !== 'movimiento-completado') {
      throw new Error(`respuesta inesperada del trabajador: ${respuesta.tipo}`);
    }
    return { notacion: respuesta.notacion, estadisticas: respuesta.estadisticas };
  }

  private calcularMovimientoLocal(
    juegoId: string,
    estadoCodificado: string,
    agente: ConfigAgentePartida,
    semilla: number,
    indiceJugada: number,
    jugador: Jugador,
  ): { notacion: string; estadisticas: EstadisticasBusqueda } {
    const juego = obtenerJuego(juegoId);
    const estado = juego.decodificar(estadoCodificado);
    const instancia = crearAgente(agente.id, agente.config);
    const decision = instancia.elegirMovimiento(juego, estado, {
      rng: crearRng(semillaParaJugada(semilla, indiceJugada, jugador, agente.id)),
      config: agente.config,
      indiceJugada,
      semilla,
    });
    return {
      notacion: juego.formatearMovimiento(decision.movimiento),
      estadisticas: decision.estadisticas,
    };
  }

  /** Ejecuta una partida completa (siempre entre agentes automáticos). */
  async ejecutarPartida(config: ConfigPartida): Promise<RegistroPartida> {
    if (!this.disponible) {
      return ejecutarPartidaDominio(config);
    }
    const id = generarIdCorto();
    const respuesta = await this.pedir({ tipo: 'partida', id, config });
    if (respuesta.tipo !== 'partida-completada') {
      throw new Error(`respuesta inesperada del trabajador: ${respuesta.tipo}`);
    }
    return respuesta.registro;
  }

  /**
   * Ejecuta una evaluación completa con progreso real. Devuelve el registro
   * o el resultado de cancelación (con las partidas ya completadas).
   */
  async ejecutarEvaluacion(
    config: ConfigEvaluacion,
    onProgreso: (completadas: number, total: number) => void,
  ): Promise<RegistroEvaluacion | ResultadoCancelado> {
    if (!this.disponible) {
      return ejecutarEvaluacionDominio(config, { onProgreso });
    }
    const id = generarIdCorto();
    this.progreso.set(id, onProgreso);
    try {
      const respuesta = await this.pedir({ tipo: 'evaluacion', id, config });
      if (respuesta.tipo === 'evaluacion-completada') {
        return respuesta.registro;
      }
      if (respuesta.tipo === 'evaluacion-cancelada') {
        return {
          cancelada: true,
          partidas: respuesta.partidas,
          completadas: respuesta.completadas,
          total: respuesta.total,
        };
      }
      throw new Error(`respuesta inesperada del trabajador: ${respuesta.tipo}`);
    } finally {
      this.progreso.delete(id);
    }
  }

  /** Solicita la cancelación de una evaluación en marcha. */
  cancelar(): void {
    // El id de la evaluación activa se gestiona internamente: cancelamos
    // todas las solicitudes pendientes (en la práctica hay una sola).
    for (const id of this.pendientes.keys()) {
      this.trabajador?.postMessage({ tipo: 'cancelar', id });
    }
  }

  dispose(): void {
    this.trabajador?.terminate();
    this.trabajador = null;
    this.pendientes.clear();
    this.progreso.clear();
  }
}

function generarIdCorto(): string {
  const cryptoGlobal = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof cryptoGlobal.crypto?.randomUUID === 'function') {
    return cryptoGlobal.crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
