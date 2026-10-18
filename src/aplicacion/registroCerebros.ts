/**
 * Registro de cerebros .lba (ADR-015): importar, validar, listar, cargar,
 * clonar, ramificar, exportar y derivar estados de eventos reales.
 *
 * Reglas duras:
 * - Una importación fallida JAMÁS escribe en el registro.
 * - Una versión repetida con huella distinta se rechaza (colisión sospechosa).
 * - El campeón nunca se sobrescribe: solo hay eventos de promoción.
 */

import { exportarPaqueteLBA, type LinajeLBA } from '../dominio/lba/exportador';
import { leerTensores } from '../dominio/lba/safetensors';
import { validarPaqueteLBA } from '../dominio/lba/validador';
import { ErrorConfiguracionInvalida } from '../dominio/motor/errores';
import { cargarCerebro } from '../dominio/agentes/neural';
import { registrarCerebroCargado } from '../dominio/agentes/registro';
import type { Almacenamiento, EventoCerebro, RegistroCerebro } from './almacen';

export type EstadoCerebro = 'raiz' | 'candidato' | 'campeon' | 'archivado' | 'incompatible';

export interface CerebroConEstado {
  readonly registro: RegistroCerebro;
  readonly estado: EstadoCerebro;
  /** Eventos que fundamentan el estado (trazabilidad). */
  readonly eventos: readonly EventoCerebro[];
}

export interface ResultadoImportacion {
  readonly resultado: 'importado' | 'duplicado' | 'colision';
  readonly cerebro?: RegistroCerebro;
  readonly mensaje: string;
}

function ahoraISO(): string {
  return new Date().toISOString();
}

/** Incrementa el componente indicado de una versión X.Y.Z. */
export function siguienteVersion(version: string, componente: 'mayor' | 'menor' | 'parche'): string {
  const partes = version.split('.').map((p) => Number.parseInt(p, 10));
  const [mayor, menor, parche] = [partes[0] ?? 0, partes[1] ?? 0, partes[2] ?? 0];
  if (componente === 'mayor') return `${mayor + 1}.0.0`;
  if (componente === 'menor') return `${mayor}.${menor + 1}.0`;
  return `${mayor}.${menor}.${parche + 1}`;
}

export class RegistroCerebros {
  constructor(private readonly almacen: Almacenamiento) {}

  /** Importa (y valida) un paquete .lba. Rechazos sin escritura alguna. */
  async importarPaquete(bytes: Uint8Array): Promise<ResultadoImportacion> {
    const paquete = await validarPaqueteLBA(bytes); // lanza RechazoLBA si falla
    const { manifiesto, huellaPaquete } = paquete;

    const existentes = await this.almacen.listarCerebros();
    const previo = existentes.registros.find(
      (c) => c.agentId === manifiesto.agentId && c.brainVersion === manifiesto.brainVersion,
    );
    if (previo !== undefined) {
      if (previo.huellaPaquete === huellaPaquete) {
        return {
          resultado: 'duplicado',
          cerebro: previo,
          mensaje: `«${manifiesto.agentId}@${manifiesto.brainVersion}» ya estaba registrado con la misma huella (sha256 ${huellaPaquete.slice(0, 12)}…): no se duplica.`,
        };
      }
      return {
        resultado: 'colision',
        mensaje: `«${manifiesto.agentId}@${manifiesto.brainVersion}» ya existe con OTRA huella (${previo.huellaPaquete.slice(0, 12)}… ≠ ${huellaPaquete.slice(0, 12)}…): versión repetida con contenido distinto; se rechaza.`,
      };
    }

    const registro: RegistroCerebro = {
      agentId: manifiesto.agentId,
      brainVersion: manifiesto.brainVersion,
      manifiesto,
      paquete: bytes,
      huellaPaquete,
      importadoEn: ahoraISO(),
    };
    await this.almacen.guardarCerebro(registro);
    await this.registrarEvento({
      id: `importado-${huellaPaquete.slice(0, 16)}`,
      fecha: ahoraISO(),
      tipo: 'importado',
      agentId: manifiesto.agentId,
      brainVersion: manifiesto.brainVersion,
      datos: {
        huellaPaquete,
        juego: manifiesto.gameId,
        reglas: manifiesto.gameRulesVersion,
        arquitectura: manifiesto.architecture.tipo,
        parametros: manifiesto.architecture.acciones,
        padre: manifiesto.parentModelId,
        entrenamiento: manifiesto.trainingRunId,
      },
    });
    return {
      resultado: 'importado',
      cerebro: registro,
      mensaje: `«${manifiesto.agentId}@${manifiesto.brainVersion}» importado y validado (sha256 ${huellaPaquete.slice(0, 12)}…).`,
    };
  }

  /** Lista con estados DERIVADOS de eventos (nunca campos mutables). */
  async listar(): Promise<readonly CerebroConEstado[]> {
    const { registros } = await this.almacen.listarCerebros();
    const { registros: eventos } = await this.almacen.listarEventosCerebros();
    return registros.map((registro) => {
      const propios = eventos.filter(
        (e) => e.agentId === registro.agentId && e.brainVersion === registro.brainVersion,
      );
      return { registro, estado: derivarEstado(propios), eventos: propios };
    });
  }

  /** Carga un cerebro del registro en el runtime ts-puro (revalida primero). */
  async cargar(agentId: string, brainVersion: string): Promise<string> {
    const { registros } = await this.almacen.listarCerebros();
    const registro = registros.find((c) => c.agentId === agentId && c.brainVersion === brainVersion);
    if (registro === undefined) {
      throw new ErrorConfiguracionInvalida(`no hay ningún cerebro «${agentId}@${brainVersion}» en el registro`);
    }
    // Revalidación del paquete almacenado: defensa frente a corrupción posterior.
    const paquete = await validarPaqueteLBA(registro.paquete);
    if (paquete.huellaPaquete !== registro.huellaPaquete) {
      throw new ErrorConfiguracionInvalida(
        `huella del paquete almacenado cambió (${registro.huellaPaquete.slice(0, 12)}… ≠ ${paquete.huellaPaquete.slice(0, 12)}…): posible corrupción`,
      );
    }
    const tensores = leerTensores(paquete.pesosSafetensors);
    const cerebro = cargarCerebro(
      paquete.manifiesto.agentId,
      paquete.manifiesto.brainVersion,
      paquete.manifiesto.gameId,
      paquete.manifiesto.architecture,
      tensores,
    );
    return registrarCerebroCargado(cerebro);
  }

  /**
   * Clona un cerebro: nueva versión (parche+1) con los mismos pesos y
   * linaje hacia el padre. Para experimentar sin tocar el original.
   */
  async clonar(agentId: string, brainVersion: string): Promise<RegistroCerebro> {
    return this.derivar(agentId, brainVersion, 'parche', 'clon');
  }

  /**
   * Crea una rama de entrenamiento: nueva versión (menor+1) con checkpoint
   * heredado, lista para reanudar el entrenamiento en Python (entrenar.py
   * --reanudar). El padre queda intacto.
   */
  async crearRama(agentId: string, brainVersion: string): Promise<RegistroCerebro> {
    return this.derivar(agentId, brainVersion, 'menor', 'rama');
  }

  private async derivar(
    agentId: string,
    brainVersion: string,
    componente: 'mayor' | 'menor' | 'parche',
    motivo: 'clon' | 'rama',
  ): Promise<RegistroCerebro> {
    const { registros } = await this.almacen.listarCerebros();
    const padre = registros.find((c) => c.agentId === agentId && c.brainVersion === brainVersion);
    if (padre === undefined) {
      throw new ErrorConfiguracionInvalida(`no hay ningún cerebro «${agentId}@${brainVersion}» en el registro`);
    }
    const nuevaVersion = siguienteVersion(brainVersion, componente);
    const colision = registros.some((c) => c.agentId === agentId && c.brainVersion === nuevaVersion);
    if (colision) {
      throw new ErrorConfiguracionInvalida(
        `«${agentId}@${nuevaVersion}» ya existe: elige otra versión`,
      );
    }

    const manifiestoBase = padre.manifiesto;
    if (manifiestoBase.trainingConfig === null) {
      // Inalcanzable en v1: la validación exige training/config.json con espejo
      // exacto en trainingConfig. Defensa ante futuras versiones del formato.
      throw new ErrorConfiguracionInvalida(
        'el paquete padre no tiene configuración de entrenamiento heredable',
      );
    }
    const linaje: LinajeLBA = {
      formatVersion: 1,
      agentId,
      brainVersion: nuevaVersion,
      parentModelId: `${agentId}@${brainVersion}`,
      parentPackageSha256: padre.huellaPaquete,
      motivo: motivo === 'clon' ? 'clon' : 'rama-de-entrenamiento',
      notas:
        motivo === 'clon'
          ? 'Clon exacto del padre: mismos pesos, versión nueva.'
          : 'Rama de entrenamiento: reanudar con entrenamiento/entrenar.py --reanudar.',
      createdAt: ahoraISO(),
    };
    const paquete = await exportarPaqueteLBA({
      manifiesto: {
        ...manifiestoBase,
        brainVersion: nuevaVersion,
        parentModelId: `${agentId}@${brainVersion}`,
        createdAt: linaje.createdAt,
        // El clon/rama NO hereda las evaluaciones del padre: no son suyas.
        evaluationRunIds: [],
        evaluationSummary: null,
      },
      pesosSafetensors: new Uint8Array(
        await validarPaqueteLBA(padre.paquete).then((p) => p.archivos.get('training/weights.safetensors')!),
      ),
      configEntrenamiento: manifiestoBase.trainingConfig,
      lineageDatos: manifiestoBase.datasetLineage ?? linajeDatosVacio(),
      linaje,
      resumenEvaluacion: null,
    });

    const importado = await this.importarPaquete(paquete.bytes);
    if (importado.resultado !== 'importado' || importado.cerebro === undefined) {
      throw new ErrorConfiguracionInvalida(
        `la derivación produjo un paquete rechazado por el propio validador: ${importado.mensaje}`,
      );
    }
    await this.registrarEvento({
      id: `${motivo}-${paquete.sha256.slice(0, 16)}`,
      fecha: ahoraISO(),
      tipo: motivo === 'clon' ? 'clonado' : 'rama',
      agentId,
      brainVersion: nuevaVersion,
      datos: { padre: `${agentId}@${brainVersion}`, huellaPadre: padre.huellaPaquete },
    });
    return importado.cerebro;
  }

  /** Exporta los bytes del paquete almacenado (descarga .lba). */
  async exportar(agentId: string, brainVersion: string): Promise<{ bytes: Uint8Array; sha256: string }> {
    const { registros } = await this.almacen.listarCerebros();
    const registro = registros.find((c) => c.agentId === agentId && c.brainVersion === brainVersion);
    if (registro === undefined) {
      throw new ErrorConfiguracionInvalida(`no hay ningún cerebro «${agentId}@${brainVersion}» en el registro`);
    }
    return { bytes: registro.paquete, sha256: registro.huellaPaquete };
  }

  /** Registra el resultado de un examen de promoción (Tarea E). */
  async registrarExamen(
    agentId: string,
    brainVersion: string,
    aprobado: boolean,
    datos: Record<string, unknown>,
  ): Promise<void> {
    await this.registrarEvento({
      id: `examen-${agentId}-${brainVersion}-${Date.now().toString(36)}`,
      fecha: ahoraISO(),
      tipo: 'examen',
      agentId,
      brainVersion,
      datos: { aprobado, ...datos },
    });
    if (aprobado) {
      await this.registrarEvento({
        id: `promocion-${agentId}-${brainVersion}-${Date.now().toString(36)}`,
        fecha: ahoraISO(),
        tipo: 'promocion',
        agentId,
        brainVersion,
        datos,
      });
    }
  }

  /** Archiva una versión (queda conservada, no participante). */
  async archivar(agentId: string, brainVersion: string, motivo: string): Promise<void> {
    await this.registrarEvento({
      id: `archivado-${agentId}-${brainVersion}-${Date.now().toString(36)}`,
      fecha: ahoraISO(),
      tipo: 'archivado',
      agentId,
      brainVersion,
      datos: { motivo },
    });
  }

  /** Marca incompatibilidad detectada (p. ej. catálogo local cambió). */
  async marcarIncompatible(agentId: string, brainVersion: string, motivo: string): Promise<void> {
    await this.registrarEvento({
      id: `incompatible-${agentId}-${brainVersion}-${Date.now().toString(36)}`,
      fecha: ahoraISO(),
      tipo: 'incompatible',
      agentId,
      brainVersion,
      datos: { motivo },
    });
  }

  private async registrarEvento(evento: EventoCerebro): Promise<void> {
    await this.almacen.agregarEventoCerebro(evento);
  }
}

/** Estado derivado de los eventos registrados (ADR-015). */
export function derivarEstado(eventos: readonly EventoCerebro[]): EstadoCerebro {
  if (eventos.some((e) => e.tipo === 'incompatible')) return 'incompatible';
  if (eventos.some((e) => e.tipo === 'archivado')) return 'archivado';
  if (eventos.some((e) => e.tipo === 'promocion')) return 'campeon';
  if (eventos.some((e) => e.tipo === 'rama')) return 'candidato';
  return 'raiz';
}

function linajeDatosVacio(): {
  origen: 'autojuego';
  partidas: number;
  ejemplos: number;
  semilla: number;
  rival: null;
  buffer: string;
} {
  return { origen: 'autojuego', partidas: 0, ejemplos: 0, semilla: 0, rival: null, buffer: 'heredado del padre' };
}
