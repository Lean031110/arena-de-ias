/**
 * Protocolo de mensajes del trabajador web (tipos compartidos).
 * Los estados viajan CODIFICADOS (ADR-011), nunca como objetos vivos.
 */

import type { ConfigAgentePartida, ConfigPartida, RegistroPartida } from '../dominio/motor/partida';
import type { ConfigEvaluacion, RegistroEvaluacion } from '../dominio/motor/evaluacion';
import type { EstadisticasBusqueda, Jugador } from '../dominio/motor/tipos';
import type { ManifiestoLBA } from '../dominio/lba/esquema';

/** Tensor de un cerebro .lba tal como viaja al trabajador (clonable). */
export interface TensorParaTrabajador {
  readonly nombre: string;
  readonly forma: readonly number[];
  readonly datos: Float32Array;
}

export interface SolicitudRegistrarCerebro {
  readonly tipo: 'registrar-cerebro';
  readonly id: string;
  readonly manifiesto: ManifiestoLBA;
  readonly tensores: readonly TensorParaTrabajador[];
}

export interface SolicitudRetirarCerebro {
  readonly tipo: 'retirar-cerebro';
  readonly id: string;
  readonly clave: string;
}

export interface SolicitudMovimiento {
  readonly tipo: 'movimiento';
  readonly id: string;
  readonly juegoId: string;
  readonly estadoCodificado: string;
  readonly agente: ConfigAgentePartida;
  readonly semilla: number;
  readonly indiceJugada: number;
  readonly jugador: Jugador;
}

export interface SolicitudPartida {
  readonly tipo: 'partida';
  readonly id: string;
  readonly config: ConfigPartida;
}

export interface SolicitudEvaluacion {
  readonly tipo: 'evaluacion';
  readonly id: string;
  readonly config: ConfigEvaluacion;
}

export interface SolicitudCancelar {
  readonly tipo: 'cancelar';
  readonly id: string;
}

export type SolicitudTrabajador =
  | SolicitudMovimiento
  | SolicitudPartida
  | SolicitudEvaluacion
  | SolicitudCancelar
  | SolicitudRegistrarCerebro
  | SolicitudRetirarCerebro;

export type RespuestaTrabajador =
  | { readonly tipo: 'movimiento-completado'; readonly id: string; readonly notacion: string; readonly estadisticas: EstadisticasBusqueda }
  | { readonly tipo: 'partida-completada'; readonly id: string; readonly registro: RegistroPartida }
  | { readonly tipo: 'evaluacion-progreso'; readonly id: string; readonly completadas: number; readonly total: number }
  | { readonly tipo: 'evaluacion-completada'; readonly id: string; readonly registro: RegistroEvaluacion }
  | { readonly tipo: 'evaluacion-cancelada'; readonly id: string; readonly partidas: readonly RegistroPartida[]; readonly completadas: number; readonly total: number }
  | { readonly tipo: 'cerebro-registrado'; readonly id: string; readonly clave: string }
  | { readonly tipo: 'cerebro-retirado'; readonly id: string; readonly clave: string }
  | { readonly tipo: 'error'; readonly id: string; readonly mensaje: string };
