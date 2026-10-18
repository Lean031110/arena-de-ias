/**
 * Trabajador web: ejecuta partidas completas, evaluaciones y cálculo de
 * jugadas sueltas FUERA del hilo principal, con el mismo código de dominio
 * que usa la interfaz (una sola fuente de verdad de las reglas).
 *
 * Cancelación: se aplica ENTRE partidas de una evaluación (documentado en
 * docs/ARQUITECTURA.md §7); una partida en curso termina primero.
 */

/// <reference lib="webworker" />
import { obtenerJuego } from '../dominio/juegos/registro';
import { crearAgente, registrarCerebroCargado, desregistrarCerebroCargado, validarConfigAgente, registrarEquipoCargado, desregistrarEquipoCargado } from '../dominio/agentes/registro';
import { cargarCerebro } from '../dominio/agentes/neural';
import { comprobarCompatibilidad } from '../dominio/lba/validador';
import { ejecutarEvaluacion } from '../dominio/motor/evaluacion';
import { ejecutarPartida, semillaParaJugada } from '../dominio/motor/partida';
import { crearRng } from '../dominio/motor/rng';
import type { EstadisticasBusqueda } from '../dominio/motor/tipos';
import type { SolicitudTrabajador, RespuestaTrabajador } from './protocolo';

const contexto = self as unknown as {
  postMessage(mensaje: RespuestaTrabajador): void;
  onmessage: ((evento: MessageEvent<SolicitudTrabajador>) => void) | null;
};

const canceladas = new Set<string>();

function responder(mensaje: RespuestaTrabajador): void {
  contexto.postMessage(mensaje);
}

contexto.onmessage = (evento: MessageEvent<SolicitudTrabajador>) => {
  void manejar(evento.data);
};

function esResultadoCancelado(
  resultado: Awaited<ReturnType<typeof ejecutarEvaluacion>>,
): resultado is Extract<Awaited<ReturnType<typeof ejecutarEvaluacion>>, { cancelada: true }> {
  return 'cancelada' in resultado && resultado.cancelada === true;
}

async function manejar(solicitud: SolicitudTrabajador): Promise<void> {
  try {
    switch (solicitud.tipo) {
      case 'movimiento':
        return manejarMovimiento(solicitud);
      case 'partida': {
        const registro = await ejecutarPartida(solicitud.config);
        responder({ tipo: 'partida-completada', id: solicitud.id, registro });
        return;
      }
      case 'evaluacion': {
        const resultado = await ejecutarEvaluacion(solicitud.config, {
          onProgreso: (completadas, total) =>
            responder({ tipo: 'evaluacion-progreso', id: solicitud.id, completadas, total }),
          debeCancelar: () => canceladas.has(solicitud.id),
        });
        if (esResultadoCancelado(resultado)) {
          canceladas.delete(solicitud.id);
          responder({
            tipo: 'evaluacion-cancelada',
            id: solicitud.id,
            partidas: resultado.partidas,
            completadas: resultado.completadas,
            total: resultado.total,
          });
          return;
        }
        responder({ tipo: 'evaluacion-completada', id: solicitud.id, registro: resultado });
        return;
      }
      case 'cancelar':
        canceladas.add(solicitud.id);
        return;
      case 'registrar-cerebro': {
        // Los pesos viajan validados desde el hilo principal; aquí se
        // reconstruye el mapa de tensores y se registra en ESTE hilo para que
        // las partidas del trabajador puedan usar el agente «neural:…».
        // Defensa en profundidad (revisión de Fase 2): la compatibilidad se
        // comprueba TAMBIÉN aquí — un error del hilo principal no debe poder
        // registrar un cerebro incompatible en este hilo.
        comprobarCompatibilidad(solicitud.manifiesto);
        const tensores = new Map(
          solicitud.tensores.map((t) => [t.nombre, { nombre: t.nombre, forma: [...t.forma], datos: t.datos }]),
        );
        const cerebro = cargarCerebro(
          solicitud.manifiesto.agentId,
          solicitud.manifiesto.brainVersion,
          solicitud.manifiesto.gameId,
          solicitud.manifiesto.architecture,
          tensores,
        );
        const clave = registrarCerebroCargado(cerebro);
        responder({ tipo: 'cerebro-registrado', id: solicitud.id, clave });
        return;
      }
      case 'retirar-cerebro': {
        desregistrarCerebroCargado(solicitud.clave);
        responder({ tipo: 'cerebro-retirado', id: solicitud.id, clave: solicitud.clave });
        return;
      }
      case 'registrar-equipo': {
        // Validación completa EN el trabajador: miembros existentes aquí
        // (cerebros registrados en ESTE hilo), compatibilidad dura y reglas
        // de equipo. Un equipo inválido se rechaza con error controlado.
        const clave = registrarEquipoCargado(solicitud.equipo);
        responder({ tipo: 'equipo-registrado', id: solicitud.id, clave });
        return;
      }
      case 'retirar-equipo': {
        desregistrarEquipoCargado(solicitud.clave);
        responder({ tipo: 'equipo-retirado', id: solicitud.id, clave: solicitud.clave });
        return;
      }
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    responder({ tipo: 'error', id: solicitud.id, mensaje });
  }
}

function manejarMovimiento(solicitud: Extract<SolicitudTrabajador, { tipo: 'movimiento' }>): void {
  const juego = obtenerJuego(solicitud.juegoId);
  const estado = juego.decodificar(solicitud.estadoCodificado);
  if (juego.esTerminal(estado)) {
    throw new Error('se pidió una jugada sobre un estado terminal');
  }
  const errores = validarConfigAgente(solicitud.agente.id, solicitud.agente.config);
  if (errores.length > 0) {
    throw new Error(`configuración de agente inválida: ${errores.join('; ')}`);
  }
  const agente = crearAgente(solicitud.agente.id, solicitud.agente.config);
  const semilla = semillaParaJugada(
    solicitud.semilla,
    solicitud.indiceJugada,
    solicitud.jugador,
    solicitud.agente.id,
  );
  const decision = agente.elegirMovimiento(juego, estado, {
    rng: crearRng(semilla),
    config: solicitud.agente.config,
    indiceJugada: solicitud.indiceJugada,
    semilla: solicitud.semilla,
  });
  responder({
    tipo: 'movimiento-completado',
    id: solicitud.id,
    notacion: juego.formatearMovimiento(decision.movimiento),
    estadisticas: decision.estadisticas satisfies EstadisticasBusqueda,
  });
}
