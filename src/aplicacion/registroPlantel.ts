/**
 * Fase 3 — Registro del plantel: incorporación persistente de IAs (catálogo
 * o cerebros .lba reales), evaluaciones medidas y derivación de equipos.
 *
 * Reglas duras:
 * - Una incorporación de CEREBRO exige que el cerebro exista en el registro
 *   de cerebros (IndexedDB) CON LA MISMA HUELLA: nada de modelos declarados
 *   sin artefacto real verificable.
 * - Una incorporación fallida JAMÁS escribe.
 * - Toda acción deja EVENTO (incorporado / retirado / evaluacion-registrada)
 *   con deduplicación exacta por id.
 * - Las evaluaciones se registran solo con resúmenes REALES (V/E/D que cuadra
 *   con el total); el peso «ponderado» se deriva de ellas.
 */

import type { Almacenamiento, EventoPlantel } from './almacen';
import {
  conEvaluacion,
  crearEntradaCatalogo,
  crearEntradaCerebro,
  historialVersiones,
  pesoMedido,
  type EntradaPlantel,
  type ResumenEvaluacion,
} from '../dominio/plantel/plantel';
import type { Equipo, MiembroEquipo } from '../dominio/equipos/tipos';
import { registrarEquipoCargado, desregistrarEquipoCargado } from '../dominio/equipos/registro';
import type { RegistroCerebro } from './almacen';

function ahoraISO(): string {
  return new Date().toISOString();
}

function idEvento(tipo: string, entradaId: string, momento: string): string {
  return `plantel:${tipo}:${entradaId}:${momento}`;
}

export class RegistroPlantel {
  constructor(
    private readonly almacen: Almacenamiento,
    private readonly cerebros: {
      listar(): Promise<readonly { registro: RegistroCerebro }[]>;
    },
  ) {}

  /** Incorpora un agente del catálogo (validado contra el catálogo real). */
  async incorporarCatalogo(
    alias: string,
    agenteId: string,
    config: Readonly<Record<string, number | boolean>>,
    juegoId: string,
  ): Promise<EntradaPlantel> {
    const entrada = crearEntradaCatalogo(alias, agenteId, config, juegoId, ahoraISO());
    await this.almacen.guardarEntradaPlantel(entrada);
    await this.almacen.agregarEventoPlantel({
      id: idEvento('incorporado', entrada.id, entrada.incorporadoISO),
      fecha: entrada.incorporadoISO,
      tipo: 'incorporado',
      entradaId: entrada.id,
      datos: { tipo_identidad: 'catalogo', agenteId, juegoId },
    });
    return entrada;
  }

  /**
   * Incorpora un cerebro .lba EXISTENTE en el registro de cerebros: se exige
   * la misma huella (sin artefacto real no hay entrada). Rechazos sin
   * escritura alguna.
   */
  async incorporarCerebro(
    alias: string,
    agentId: string,
    brainVersion: string,
    juegoId: string,
  ): Promise<EntradaPlantel> {
    const listado = await this.cerebros.listar();
    const registro = listado.find(
      (c) => c.registro.agentId === agentId && c.registro.brainVersion === brainVersion,
    )?.registro;
    if (registro === undefined) {
      throw new Error(
        `«${agentId}@${brainVersion}» no está importado en el registro de cerebros: ` +
          'un modelo sin artefacto real verificable no entra al plantel',
      );
    }
    if (registro.manifiesto.gameId !== juegoId) {
      throw new Error(
        `«${agentId}@${brainVersion}» es de «${registro.manifiesto.gameId}», no de «${juegoId}»`,
      );
    }
    const entrada = crearEntradaCerebro(
      alias,
      {
        agentId,
        brainVersion,
        gameId: registro.manifiesto.gameId,
        huella: registro.huellaPaquete,
        parentModelId: registro.manifiesto.parentModelId ?? null,
        trainingRunId: registro.manifiesto.trainingRunId ?? null,
      },
      juegoId,
      ahoraISO(),
    );
    await this.almacen.guardarEntradaPlantel(entrada);
    await this.almacen.agregarEventoPlantel({
      id: idEvento('incorporado', entrada.id, entrada.incorporadoISO),
      fecha: entrada.incorporadoISO,
      tipo: 'incorporado',
      entradaId: entrada.id,
      datos: {
        tipo_identidad: 'cerebro',
        agentId,
        brainVersion,
        huella: registro.huellaPaquete,
        parentModelId: registro.manifiesto.parentModelId ?? null,
      },
    });
    return entrada;
  }

  /** Retira una entrada: borra del listado activo y deja el evento. */
  async retirar(entradaId: string): Promise<boolean> {
    const listado = await this.almacen.listarPlantel();
    const entrada = listado.registros.find((e) => e.id === entradaId);
    if (entrada === undefined) return false;
    const momento = ahoraISO();
    await this.almacen.borrarEntradaPlantel(entrada.id);
    await this.almacen.agregarEventoPlantel({
      id: idEvento('retirado', entrada.id, momento),
      fecha: momento,
      tipo: 'retirado',
      entradaId: entrada.id,
    });
    return true;
  }

  /** Listado ACTIVO: entradas presentes sin evento de retiro posterior. */
  async listar(): Promise<readonly EntradaPlantel[]> {
    const [{ registros: entradas }, { registros: eventos }] = await Promise.all([
      this.almacen.listarPlantel(),
      this.almacen.listarEventosPlantel(),
    ]);
    const retiradas = new Set(
      eventos.filter((e) => e.tipo === 'retirado').map((e) => e.entradaId),
    );
    return entradas.filter((e) => !retiradas.has(e.id));
  }

  /** Historial de versiones de un cerebro (linaje reconstruido). */
  async historial(agentId: string): Promise<{
    cadena: readonly EntradaPlantel[];
    huerfanas: readonly EntradaPlantel[];
  }> {
    const entradas = await this.listar();
    return historialVersiones(entradas, agentId);
  }

  /**
   * Registra un resumen REAL de evaluación sobre una entrada (V/E/D debe
   * cuadrar; lanza si no). Evento con deduplicación por id.
   */
  async registrarEvaluacion(
    entradaId: string,
    resumen: ResumenEvaluacion,
  ): Promise<EntradaPlantel> {
    const entradas = await this.listar();
    const entrada = entradas.find((e) => e.id === entradaId);
    if (entrada === undefined) {
      throw new Error(`no existe la entrada «${entradaId}» del plantel`);
    }
    const actualizada = conEvaluacion(entrada, resumen);
    await this.almacen.guardarEntradaPlantel(actualizada);
    await this.almacen.agregarEventoPlantel({
      id: idEvento('evaluacion-registrada', entrada.id, resumen.fechaISO),
      fecha: resumen.fechaISO,
      tipo: 'evaluacion-registrada',
      entradaId: entrada.id,
      datos: {
        rival: resumen.rival,
        partidas: resumen.partidas,
        v: resumen.victorias,
        e: resumen.empates,
        d: resumen.derrotas,
        puntuacion: resumen.puntuacion,
      },
    });
    return actualizada;
  }

  /**
   * Deriva un EQUIPO desde entradas del plantel: los pesos «ponderado» salen
   * de las evaluaciones medidas (sin evaluaciones → 0). El equipo queda
   * registrado en runtime con su clave.
   */
  async derivarEquipo(
    nombre: string,
    juegoId: string,
    protocolo: 'consulta' | 'turno-alternado',
    politica: 'votacion' | 'ponderado',
    aliasMiembros: readonly [string, ...string[]],
  ): Promise<{ equipo: Equipo; clave: string }> {
    const entradas = await this.listar();
    const miembros: MiembroEquipo[] = [];
    for (const alias of aliasMiembros) {
      const entrada = entradas.find((e) => e.alias === alias && e.juegoId === juegoId);
      if (entrada === undefined) {
        throw new Error(`«${alias}» no está en el plantel de «${juegoId}»`);
      }
      miembros.push({
        alias: entrada.alias,
        agente:
          entrada.identidad.tipo === 'catalogo'
            ? { id: entrada.identidad.agenteId, config: { ...entrada.identidad.config } }
            : {
                id: `neural:${entrada.identidad.agentId}@${entrada.identidad.brainVersion}`,
                config: {},
              },
        pesoMedido: pesoMedido(entrada),
      });
    }
    if (miembros.length < 2) {
      throw new Error('un equipo exige al menos 2 miembros del plantel');
    }
    const equipo: Equipo = {
      nombre,
      juegoId,
      protocolo,
      politica,
      miembros: miembros as [MiembroEquipo, MiembroEquipo, ...MiembroEquipo[]],
    };
    const clave = registrarEquipoCargado(equipo);
    return { equipo, clave };
  }

  /** Da de baja un equipo derivado (el plantel no se toca). */
  retirarEquipo(clave: string): boolean {
    return desregistrarEquipoCargado(clave);
  }

  /** Eventos del plantel (trazabilidad, más recientes primero). */
  async eventos(): Promise<readonly EventoPlantel[]> {
    const { registros } = await this.almacen.listarEventosPlantel();
    return registros;
  }
}
