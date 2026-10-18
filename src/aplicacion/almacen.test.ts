import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAlmacenamiento } from './almacen';
import type { Almacenamiento } from './almacen';
import { ejecutarEvaluacion } from '../dominio/motor/evaluacion';
import { ejecutarPartida } from '../dominio/motor/partida';
import { crearEvento } from '../dominio/motor/eventos';
import { ErrorAlmacenaje } from '../dominio/motor/errores';

describe('almacenamiento IndexedDB (con fake-indexeddb)', () => {
  let almacen: Almacenamiento;

  beforeEach(async () => {
    almacen = crearAlmacenamiento();
    await almacen.abrir();
    await almacen.borrarTodo();
  });

  afterEach(async () => {
    try {
      await almacen.borrarTodo();
    } catch {
      // la base pudo cerrarse; ignorar en limpieza
    }
  });

  it('guarda y recupera partidas con el mismo contenido y huella', async () => {
    const partida = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 101,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    await almacen.guardarPartida(partida);
    const listado = await almacen.listarPartidas();
    expect(listado.registros).toHaveLength(1);
    expect(listado.corruptos).toHaveLength(0);
    const recuperada = listado.registros[0];
    expect(recuperada?.id).toBe(partida.id);
    expect(recuperada?.huella).toBe(partida.huella);
    expect(recuperada?.movimientos).toEqual(partida.movimientos);
  });

  it('guarda y recupera evaluaciones completas', async () => {
    const evaluacion = await ejecutarEvaluacion({
      juegoId: 'tres-en-raya-3',
      semillaBase: 202,
      encuentrosPorPar: 2,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'heuristico', config: {} },
      ],
    });
    if ('cancelada' in evaluacion) throw new Error('no debía cancelarse');
    await almacen.guardarEvaluacion(evaluacion);
    const listado = await almacen.listarEvaluaciones();
    expect(listado.registros).toHaveLength(1);
    expect(listado.registros[0]?.huella).toBe(evaluacion.huella);
    expect(listado.registros[0]?.partidas).toHaveLength(2);
    expect(listado.registros[0]?.resumenPorAgente).toEqual(evaluacion.resumenPorAgente);
  });

  it('deduplica eventos por id (reanudar no duplica)', async () => {
    const evento = crearEvento('sistema', 'prueba de deduplicación');
    const primera = await almacen.agregarEvento(evento);
    const segunda = await almacen.agregarEvento(evento);
    const tercera = await almacen.agregarEvento(evento);
    expect(primera).toBe('nuevo');
    expect(segunda).toBe('duplicado');
    expect(tercera).toBe('duplicado');
    const listado = await almacen.listarEventos();
    expect(listado.registros).toHaveLength(1);
  });

  it('lista eventos en orden cronológico inverso', async () => {
    for (let i = 0; i < 5; i++) {
      await almacen.agregarEvento(crearEvento('sistema', `evento ${i}`));
    }
    const listado = await almacen.listarEventos(3);
    expect(listado.registros).toHaveLength(3);
    // Los más recientes primero (fechas ISO crecientes ⇒ orden inverso).
    const fechas = listado.registros.map((evento) => evento.fecha);
    const ordenadas = [...fechas].sort().reverse();
    expect(fechas).toEqual(ordenadas);
  });

  it('aísla registros corruptos sin romper el listado', async () => {
    const partida = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 303,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    await almacen.guardarPartida(partida);
    // Inyectamos un registro corrupto directamente en IndexedDB.
    await new Promise<void>((resolver, rechazar) => {
      const solicitud = indexedDB.open('arena-de-ias', 1);
      solicitud.onsuccess = () => {
        const bd = solicitud.result;
        const tx = bd.transaction('partidas', 'readwrite');
        tx.objectStore('partidas').put({ id: 'corrupto-1', basura: 'esto no es una partida' });
        tx.oncomplete = () => {
          bd.close();
          resolver();
        };
        tx.onerror = () => rechazar(tx.error);
      };
      solicitud.onerror = () => rechazar(solicitud.error);
    });
    const listado = await almacen.listarPartidas();
    expect(listado.registros).toHaveLength(1);
    expect(listado.corruptos).toHaveLength(1);
    expect(listado.corruptos[0]?.id).toBe('corrupto-1');
  });

  it('borrarTodo vacía los tres almacenes', async () => {
    const partida = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 404,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    await almacen.guardarPartida(partida);
    await almacen.agregarEvento(crearEvento('partida', 'partida guardada'));
    await almacen.borrarTodo();
    expect((await almacen.listarPartidas()).registros).toHaveLength(0);
    expect((await almacen.listarEventos()).registros).toHaveLength(0);
    expect((await almacen.listarEvaluaciones()).registros).toHaveLength(0);
  });

  it('opera idempotentemente al re-guardar la misma partida', async () => {
    const partida = await ejecutarPartida({
      juegoId: 'tres-en-raya-3',
      semilla: 505,
      agentes: [
        { id: 'aleatorio', config: {} },
        { id: 'aleatorio', config: {} },
      ],
    });
    await almacen.guardarPartida(partida);
    await almacen.guardarPartida(partida);
    expect((await almacen.listarPartidas()).registros).toHaveLength(1);
  });

  it('falla con ErrorAlmacenaje si no se abre la base antes', async () => {
    const sinAbrir = crearAlmacenamiento();
    await expect(sinAbrir.listarPartidas()).rejects.toThrow(ErrorAlmacenaje);
  });
});
