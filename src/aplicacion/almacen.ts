/**
 * Almacenamiento IndexedDB: fuente local de verdad en Fase 1
 * (ADR-006). Validación con Zod en la lectura; los registros corruptos se
 * aíslan y se reportan, nunca se mezclan con datos válidos.
 */

import type { RegistroEvaluacion } from '../dominio/motor/evaluacion';
import type { RegistroPartida } from '../dominio/motor/partida';
import type { Evento } from '../dominio/motor/eventos';
import type { ManifiestoLBA } from '../dominio/lba/esquema';
import { ErrorAlmacenaje } from '../dominio/motor/errores';
import {
  validarEvento,
  validarRegistroEvaluacion,
  validarRegistroPartida,
  validarRegistroCerebro,
  validarEventoCerebro,
} from './esquemas';
import type { RegistroEventoExterno } from './tipos';

const NOMBRE_BASE = 'arena-de-ias';
const VERSION_BASE = 2;
const ALMACEN_PARTIDAS = 'partidas';
const ALMACEN_EVALUACIONES = 'evaluaciones';
const ALMACEN_EVENTOS = 'eventos';
const ALMACEN_CEREBROS = 'cerebros';
const ALMACEN_EVENTOS_CEREBROS = 'eventosCerebros';

export interface RegistroCorrupto {
  readonly id: string;
  readonly motivo: string;
}

export interface ResultadoListado<T> {
  readonly registros: readonly T[];
  readonly corruptos: readonly RegistroCorrupto[];
}

/** Cerebro versionado almacenado: paquete completo + manifiesto + huella. */
export interface RegistroCerebro {
  readonly agentId: string;
  readonly brainVersion: string;
  readonly manifiesto: ManifiestoLBA;
  /** Bytes íntegros del .lba (para revalidar, exportar y continuar entrenando). */
  readonly paquete: Uint8Array;
  readonly huellaPaquete: string;
  readonly importadoEn: string;
}

/**
 * Evento de la vida de un cerebro (ADR-015): los estados se DERIVAN de estos
 * registros, nunca se guardan como campo arbitrario.
 */
export interface EventoCerebro {
  readonly id: string;
  readonly fecha: string;
  readonly tipo:
    | 'importado'
    | 'clonado'
    | 'rama'
    | 'examen'
    | 'promocion'
    | 'archivado'
    | 'incompatible';
  readonly agentId: string;
  readonly brainVersion: string;
  readonly datos?: Record<string, unknown>;
}

export interface Almacenamiento {
  abrir(): Promise<void>;
  guardarPartida(registro: RegistroPartida): Promise<void>;
  listarPartidas(): Promise<ResultadoListado<RegistroPartida>>;
  guardarEvaluacion(registro: RegistroEvaluacion): Promise<void>;
  listarEvaluaciones(): Promise<ResultadoListado<RegistroEvaluacion>>;
  /** Deduplicación exacta por id: 'duplicado' no vuelve a insertar. */
  agregarEvento(evento: Evento): Promise<'nuevo' | 'duplicado'>;
  listarEventos(limite?: number): Promise<ResultadoListado<RegistroEventoExterno>>;
  guardarCerebro(registro: RegistroCerebro): Promise<void>;
  listarCerebros(): Promise<ResultadoListado<RegistroCerebro>>;
  agregarEventoCerebro(evento: EventoCerebro): Promise<'nuevo' | 'duplicado'>;
  listarEventosCerebros(): Promise<ResultadoListado<EventoCerebro>>;
  borrarTodo(): Promise<void>;
}

function envolver(error: unknown, operacion: string): ErrorAlmacenaje {
  if (error instanceof ErrorAlmacenaje) return error;
  const mensaje = error instanceof Error ? error.message : String(error);
  return new ErrorAlmacenaje(`fallo en «${operacion}»: ${mensaje}`, error);
}

export function crearAlmacenamiento(): Almacenamiento {
  let base: IDBDatabase | null = null;

  const requiereBase = (): IDBDatabase => {
    if (base === null) {
      throw new ErrorAlmacenaje('la base no está abierta (llama a abrir() antes)');
    }
    return base;
  };

  const abrirTransaccion = (
    almacen: string,
    modo: IDBTransactionMode,
  ): { tx: IDBTransaction; store: IDBObjectStore } => {
    const bd = requiereBase();
    const tx = bd.transaction(almacen, modo);
    return { tx, store: tx.objectStore(almacen) };
  };

  const pedir = <T,>(solicitud: IDBRequest<T>): Promise<T> =>
    new Promise((resolver, rechazar) => {
      solicitud.onsuccess = () => resolver(solicitud.result);
      solicitud.onerror = () => rechazar(solicitud.error ?? new Error('error de IndexedDB'));
    });

  const esperarTransaccion = (tx: IDBTransaction): Promise<void> =>
    new Promise((resolver, rechazar) => {
      tx.oncomplete = () => resolver();
      tx.onerror = () => rechazar(tx.error ?? new Error('error de transacción'));
      tx.onabort = () => rechazar(tx.error ?? new Error('transacción abortada'));
    });

  return {
    async abrir(): Promise<void> {
      if (base !== null) return;
      if (typeof indexedDB === 'undefined') {
        throw new ErrorAlmacenaje(
          'IndexedDB no está disponible en este entorno (la sesión degradará a memoria)',
        );
      }
      try {
        base = await new Promise<IDBDatabase>((resolver, rechazar) => {
          const solicitud = indexedDB.open(NOMBRE_BASE, VERSION_BASE);
          solicitud.onupgradeneeded = () => {
            const bd = solicitud.result;
            if (!bd.objectStoreNames.contains(ALMACEN_PARTIDAS)) {
              bd.createObjectStore(ALMACEN_PARTIDAS, { keyPath: 'id' });
            }
            if (!bd.objectStoreNames.contains(ALMACEN_EVALUACIONES)) {
              bd.createObjectStore(ALMACEN_EVALUACIONES, { keyPath: 'id' });
            }
            if (!bd.objectStoreNames.contains(ALMACEN_EVENTOS)) {
              bd.createObjectStore(ALMACEN_EVENTOS, { keyPath: 'id' });
            }
            if (!bd.objectStoreNames.contains(ALMACEN_CEREBROS)) {
              bd.createObjectStore(ALMACEN_CEREBROS, { keyPath: ['agentId', 'brainVersion'] });
            }
            if (!bd.objectStoreNames.contains(ALMACEN_EVENTOS_CEREBROS)) {
              bd.createObjectStore(ALMACEN_EVENTOS_CEREBROS, { keyPath: 'id' });
            }
          };
          solicitud.onsuccess = () => resolver(solicitud.result);
          solicitud.onerror = () => rechazar(solicitud.error ?? new Error('apertura fallida'));
        });
      } catch (error) {
        base = null;
        throw envolver(error, 'apertura de la base');
      }
    },

    async guardarPartida(registro: RegistroPartida): Promise<void> {
      try {
        const { tx, store } = abrirTransaccion(ALMACEN_PARTIDAS, 'readwrite');
        store.put(registro);
        await esperarTransaccion(tx);
      } catch (error) {
        throw envolver(error, 'guardar partida');
      }
    },

    async listarPartidas(): Promise<ResultadoListado<RegistroPartida>> {
      try {
        const { store } = abrirTransaccion(ALMACEN_PARTIDAS, 'readonly');
        const crudos = await pedir(store.getAll());
        const registros: RegistroPartida[] = [];
        const corruptos: RegistroCorrupto[] = [];
        for (const crudo of crudos) {
          const registro = validarRegistroPartida(crudo);
          if (registro === null) {
            const id = (crudo as { id?: unknown }).id;
            corruptos.push({
              id: typeof id === 'string' ? id : '(sin id)',
              motivo: 'no supera el esquema de RegistroPartida',
            });
          } else {
            registros.push(registro);
          }
        }
        registros.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
        return { registros, corruptos };
      } catch (error) {
        throw envolver(error, 'listar partidas');
      }
    },

    async guardarEvaluacion(registro: RegistroEvaluacion): Promise<void> {
      try {
        const { tx, store } = abrirTransaccion(ALMACEN_EVALUACIONES, 'readwrite');
        store.put(registro);
        await esperarTransaccion(tx);
      } catch (error) {
        throw envolver(error, 'guardar evaluación');
      }
    },

    async listarEvaluaciones(): Promise<ResultadoListado<RegistroEvaluacion>> {
      try {
        const { store } = abrirTransaccion(ALMACEN_EVALUACIONES, 'readonly');
        const crudos = await pedir(store.getAll());
        const registros: RegistroEvaluacion[] = [];
        const corruptos: RegistroCorrupto[] = [];
        for (const crudo of crudos) {
          const registro = validarRegistroEvaluacion(crudo);
          if (registro === null) {
            const id = (crudo as { id?: unknown }).id;
            corruptos.push({
              id: typeof id === 'string' ? id : '(sin id)',
              motivo: 'no supera el esquema de RegistroEvaluación',
            });
          } else {
            registros.push(registro);
          }
        }
        registros.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
        return { registros, corruptos };
      } catch (error) {
        throw envolver(error, 'listar evaluaciones');
      }
    },

    async agregarEvento(evento: Evento): Promise<'nuevo' | 'duplicado'> {
      try {
        const { store: storeLectura } = abrirTransaccion(ALMACEN_EVENTOS, 'readonly');
        const existente = await pedir(storeLectura.get(evento.id));
        if (existente !== undefined) return 'duplicado';
        const { tx, store } = abrirTransaccion(ALMACEN_EVENTOS, 'readwrite');
        store.put(evento);
        await esperarTransaccion(tx);
        return 'nuevo';
      } catch (error) {
        throw envolver(error, 'agregar evento');
      }
    },

    async listarEventos(limite = 200): Promise<ResultadoListado<RegistroEventoExterno>> {
      try {
        const { store } = abrirTransaccion(ALMACEN_EVENTOS, 'readonly');
        const crudos = await pedir(store.getAll());
        const registros: RegistroEventoExterno[] = [];
        const corruptos: RegistroCorrupto[] = [];
        for (const crudo of crudos) {
          const registro = validarEvento(crudo);
          if (registro === null) {
            const id = (crudo as { id?: unknown }).id;
            corruptos.push({
              id: typeof id === 'string' ? id : '(sin id)',
              motivo: 'no supera el esquema de Evento',
            });
          } else {
            registros.push(registro);
          }
        }
        registros.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
        return { registros: registros.slice(0, limite), corruptos };
      } catch (error) {
        throw envolver(error, 'listar eventos');
      }
    },

    async guardarCerebro(registro: RegistroCerebro): Promise<void> {
      try {
        const { tx, store } = abrirTransaccion(ALMACEN_CEREBROS, 'readwrite');
        store.put(registro);
        await esperarTransaccion(tx);
      } catch (error) {
        throw envolver(error, 'guardar cerebro');
      }
    },

    async listarCerebros(): Promise<ResultadoListado<RegistroCerebro>> {
      try {
        const { store } = abrirTransaccion(ALMACEN_CEREBROS, 'readonly');
        const crudos = await pedir(store.getAll());
        const registros: RegistroCerebro[] = [];
        const corruptos: RegistroCorrupto[] = [];
        for (const crudo of crudos) {
          const registro = validarRegistroCerebro(crudo);
          if (registro === null) {
            const id = (crudo as { agentId?: unknown; brainVersion?: unknown }).agentId;
            corruptos.push({
              id: typeof id === 'string' ? id : '(sin id)',
              motivo: 'no supera el esquema de RegistroCerebro',
            });
          } else {
            registros.push(registro);
          }
        }
        registros.sort((a, b) => (a.importadoEn < b.importadoEn ? 1 : -1));
        return { registros, corruptos };
      } catch (error) {
        throw envolver(error, 'listar cerebros');
      }
    },

    async agregarEventoCerebro(evento: EventoCerebro): Promise<'nuevo' | 'duplicado'> {
      try {
        const { store: storeLectura } = abrirTransaccion(ALMACEN_EVENTOS_CEREBROS, 'readonly');
        const existente = await pedir(storeLectura.get(evento.id));
        if (existente !== undefined) return 'duplicado';
        const { tx, store } = abrirTransaccion(ALMACEN_EVENTOS_CEREBROS, 'readwrite');
        store.put(evento);
        await esperarTransaccion(tx);
        return 'nuevo';
      } catch (error) {
        throw envolver(error, 'agregar evento de cerebro');
      }
    },

    async listarEventosCerebros(): Promise<ResultadoListado<EventoCerebro>> {
      try {
        const { store } = abrirTransaccion(ALMACEN_EVENTOS_CEREBROS, 'readonly');
        const crudos = await pedir(store.getAll());
        const registros: EventoCerebro[] = [];
        const corruptos: RegistroCorrupto[] = [];
        for (const crudo of crudos) {
          const registro = validarEventoCerebro(crudo);
          if (registro === null) {
            const id = (crudo as { id?: unknown }).id;
            corruptos.push({
              id: typeof id === 'string' ? id : '(sin id)',
              motivo: 'no supera el esquema de EventoCerebro',
            });
          } else {
            registros.push(registro);
          }
        }
        registros.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
        return { registros, corruptos };
      } catch (error) {
        throw envolver(error, 'listar eventos de cerebros');
      }
    },

    async borrarTodo(): Promise<void> {
      try {
        const bd = requiereBase();
        const tx = bd.transaction(
          [ALMACEN_PARTIDAS, ALMACEN_EVALUACIONES, ALMACEN_EVENTOS, ALMACEN_CEREBROS, ALMACEN_EVENTOS_CEREBROS],
          'readwrite',
        );
        tx.objectStore(ALMACEN_PARTIDAS).clear();
        tx.objectStore(ALMACEN_EVALUACIONES).clear();
        tx.objectStore(ALMACEN_EVENTOS).clear();
        tx.objectStore(ALMACEN_CEREBROS).clear();
        tx.objectStore(ALMACEN_EVENTOS_CEREBROS).clear();
        await esperarTransaccion(tx);
      } catch (error) {
        throw envolver(error, 'borrar todo');
      }
    },
  };
}
