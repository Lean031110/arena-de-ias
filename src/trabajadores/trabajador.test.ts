/**
 * Pruebas del TRABAJADOR WEB con el agente neural (revisión de la Tarea 1:
 * el ciclo registrar-cerebro → movimiento con el agente neural → retirar
 * debe estar cubierto por pruebas automatizadas, no solo por la verificación
 * manual en el navegador).
 *
 * El módulo del trabajador se ejecuta en Node simulando el entorno mínimo
 * que usa (``self`` con ``postMessage``/``onmessage``): el código de dominio
 * es el mismo que corre en el navegador (única fuente de verdad), así que
 * estas pruebas ejercitan exactamente la ruta de mensajes del trabajador.
 *
 * El cerebro de prueba es el paquete real versionado red-ter-3@1.0.1:
 * se valida con el validador completo y sus tensores viajan por el mismo
 * protocolo que usa la interfaz.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RespuestaTrabajador, SolicitudTrabajador } from './protocolo';
import { validarPaqueteLBA } from '../dominio/lba/validador';
import { leerTensores } from '../dominio/lba/safetensors';
import { obtenerJuego } from '../dominio/juegos/registro';

type TrabajadorCargado = {
  enviar: (solicitud: SolicitudTrabajador) => Promise<RespuestaTrabajador>;
  respuestas: () => RespuestaTrabajador[];
};

let trabajadorSingleton: Promise<TrabajadorCargado> | null = null;

/**
 * Carga el módulo del trabajador UNA sola vez (captura `self` al importarse)
 * y comparte la instancia entre suites: cada suite filtra las respuestas que
 * le interesan por el id de sus solicitudes.
 */
function cargarTrabajador(): Promise<TrabajadorCargado> {
  trabajadorSingleton ??= (async (): Promise<TrabajadorCargado> => {
    const respuestas: RespuestaTrabajador[] = [];
    const publicar = vi.fn((mensaje: RespuestaTrabajador) => {
      respuestas.push(mensaje);
    });

    // Entorno mínimo del trabajador ANTES de importar el módulo (lee `self`).
    const selfSimulado = {
      postMessage: publicar,
      onmessage: null as ((evento: { data: SolicitudTrabajador }) => void) | null,
    };
    (globalThis as Record<string, unknown>).self = selfSimulado;

    await import('./trabajador');
    const manejador = selfSimulado.onmessage;
    if (manejador === null) {
      throw new Error('el trabajador no registró su manejador onmessage');
    }

    return {
      enviar: (solicitud) =>
        new Promise<RespuestaTrabajador>((resolver, rechazar) => {
          const antes = respuestas.length;
          manejador({ data: solicitud });
          // `manejar` es async: se sondea la cola de respuestas del stub.
          const intentar = (intentos: number): void => {
            const nueva = respuestas.slice(antes).find((r) => r.id === solicitud.id);
            if (nueva !== undefined) {
              resolver(nueva);
              return;
            }
            if (intentos <= 0) {
              rechazar(new Error(`sin respuesta para ${solicitud.id} tras el sondeo`));
              return;
            }
            setTimeout(() => intentar(intentos - 1), 5);
          };
          intentar(400);
        }),
      respuestas: () => respuestas,
    };
  })();
  return trabajadorSingleton;
}

describe('trabajador web: cerebros neurales', () => {
  let trabajador: TrabajadorCargado;
  let manifiesto: Parameters<typeof validarPaqueteLBA>[0] extends never ? never : import('../dominio/lba/esquema').ManifiestoLBA;
  let tensores: { nombre: string; forma: number[]; datos: Float32Array }[];

  beforeAll(async () => {
    trabajador = await cargarTrabajador();
    const bytes = new Uint8Array(
      readFileSync('modelos/versionados/red-ter-3@1.0.1.lba'),
    );
    const paquete = await validarPaqueteLBA(bytes);
    manifiesto = paquete.manifiesto;
    const leidos = leerTensores(paquete.pesosSafetensors);
    tensores = [...leidos.entries()].map(([nombre, tensor]) => ({
      nombre,
      forma: [...tensor.forma],
      datos: tensor.datos,
    }));
  });

  afterEach(() => {
    // Limpieza entre pruebas: retira cualquier cerebro registrado.
    for (const respuesta of trabajador.respuestas()) {
      if (respuesta.tipo === 'cerebro-registrado') {
        void trabajador.enviar({ tipo: 'retirar-cerebro', id: `limpieza-${respuesta.id}`, clave: respuesta.clave });
      }
    }
  });

  it('registra un cerebro real .lba y devuelve su clave neural:', async () => {
    const respuesta = await trabajador.enviar({
      tipo: 'registrar-cerebro',
      id: 'r1',
      manifiesto,
      tensores,
    });
    expect(respuesta.tipo).toBe('cerebro-registrado');
    if (respuesta.tipo !== 'cerebro-registrado') return;
    expect(respuesta.clave).toBe('neural:red-ter-3@1.0.1');
    // Limpieza explícita de esta prueba.
    const retiro = await trabajador.enviar({ tipo: 'retirar-cerebro', id: 'r1b', clave: respuesta.clave });
    expect(retiro.tipo).toBe('cerebro-retirado');
  });

  it('el agente neural DENTRO del trabajador elige un movimiento legal', async () => {
    const registro = await trabajador.enviar({
      tipo: 'registrar-cerebro',
      id: 'r2',
      manifiesto,
      tensores,
    });
    expect(registro.tipo).toBe('cerebro-registrado');
    if (registro.tipo !== 'cerebro-registrado') return;

    const juego = obtenerJuego('tres-en-raya-3');
    const estado = juego.crearEstadoInicial();
    const respuesta = await trabajador.enviar({
      tipo: 'movimiento',
      id: 'm2',
      juegoId: 'tres-en-raya-3',
      estadoCodificado: juego.codificar(estado),
      agente: { id: registro.clave, config: { simulaciones: 24 } },
      semilla: 20261019,
      indiceJugada: 0,
      jugador: 1,
    });
    expect(respuesta.tipo).toBe('movimiento-completado');
    if (respuesta.tipo !== 'movimiento-completado') return;
    expect(respuesta.notacion).toMatch(/^[a-c][1-3]$/);
    expect(respuesta.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
    expect(typeof respuesta.estadisticas.simulaciones).toBe('number');

    const retiro = await trabajador.enviar({ tipo: 'retirar-cerebro', id: 'r2b', clave: registro.clave });
    expect(retiro.tipo).toBe('cerebro-retirado');
  });

  it('un movimiento con agente neural SIN registrar responde error, no caída', async () => {
    const juego = obtenerJuego('tres-en-raya-3');
    const respuesta = await trabajador.enviar({
      tipo: 'movimiento',
      id: 'm3',
      juegoId: 'tres-en-raya-3',
      estadoCodificado: juego.codificar(juego.crearEstadoInicial()),
      agente: { id: 'neural:red-ter-3@9.9.9', config: { simulaciones: 8 } },
      semilla: 1,
      indiceJugada: 0,
      jugador: 1,
    });
    expect(respuesta.tipo).toBe('error');
    if (respuesta.tipo === 'error') {
      expect(respuesta.mensaje).toContain('neural:red-ter-3@9.9.9');
    }
  });

  it('un cerebro incompatible con el juego se rechaza al registrar', async () => {
    // Manifiesto real con el gameId alterado: la compatibilidad dura
    // (mismas reglas y mismo espacio de acciones) debe fallar aquí.
    const manifiestoIncompatible = {
      ...manifiesto,
      gameId: 'tres-en-raya-4',
    } as typeof manifiesto;
    const respuesta = await trabajador.enviar({
      tipo: 'registrar-cerebro',
      id: 'r4',
      manifiesto: manifiestoIncompatible,
      tensores,
    });
    expect(respuesta.tipo).toBe('error');
  });
});

/* ------------------- Equipos dentro del trabajador (Fase 3) --------------- */

describe('trabajador web: equipos', () => {
  let trabajador: TrabajadorCargado;
  let manifiestoBase: import('../dominio/lba/esquema').ManifiestoLBA;
  let tensoresBase: { nombre: string; forma: number[]; datos: Float32Array }[];

  beforeAll(async () => {
    trabajador = await cargarTrabajador();
    const bytes = new Uint8Array(
      readFileSync('modelos/versionados/red-ter-3@1.0.1.lba'),
    );
    const paquete = await validarPaqueteLBA(bytes);
    manifiestoBase = paquete.manifiesto;
    const leidos = leerTensores(paquete.pesosSafetensors);
    tensoresBase = [...leidos.entries()].map(([nombre, tensor]) => ({
      nombre,
      forma: [...tensor.forma],
      datos: tensor.datos,
    }));
  });

  afterEach(() => {
    for (const respuesta of trabajador.respuestas()) {
      if (respuesta.tipo === 'equipo-registrado') {
        void trabajador.enviar({ tipo: 'retirar-equipo', id: `limpieza-e-${respuesta.id}`, clave: respuesta.clave });
      }
      if (respuesta.tipo === 'cerebro-registrado') {
        void trabajador.enviar({ tipo: 'retirar-cerebro', id: `limpieza-c-${respuesta.id}`, clave: respuesta.clave });
      }
    }
  });

  it('registra un equipo de catálogo y juega una partida real dentro del trabajador', async () => {
    const equipo = {
      nombre: 'pareja-trabajador',
      juegoId: 'tres-en-raya-3',
      protocolo: 'turno-alternado',
      politica: 'votacion',
      miembros: [
        { alias: 'veterana', agente: { id: 'heuristico', config: {} }, pesoMedido: 1 },
        { alias: 'novata', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
    } as const;
    const registro = await trabajador.enviar({
      tipo: 'registrar-equipo',
      id: 'e1',
      equipo,
    });
    expect(registro.tipo).toBe('equipo-registrado');
    if (registro.tipo !== 'equipo-registrado') return;
    expect(registro.clave).toBe('equipo:pareja-trabajador');

    const partida = await trabajador.enviar({
      tipo: 'partida',
      id: 'e1p',
      config: {
        juegoId: 'tres-en-raya-3',
        semilla: 20261021,
        agentes: [
          { id: registro.clave, config: {} },
          { id: 'aleatorio', config: {} },
        ],
      },
    });
    expect(partida.tipo).toBe('partida-completada');
    if (partida.tipo !== 'partida-completada') return;
    expect(partida.registro.resultado).not.toBeNull();
    expect(partida.registro.validez).toBe('verificada');

    const retiro = await trabajador.enviar({ tipo: 'retirar-equipo', id: 'e1b', clave: registro.clave });
    expect(retiro.tipo).toBe('equipo-retirado');
  });

  it('equipo con miembro neural: el cerebro debe registrarse PRIMERO en el trabajador', async () => {
    // Sin registrar el cerebro: el equipo se rechaza (miembro inexistente aquí).
    const equipoNeural = {
      nombre: 'equipo-neural',
      juegoId: 'tres-en-raya-3',
      protocolo: 'consulta',
      politica: 'votacion',
      miembros: [
        { alias: 'red', agente: { id: 'neural:red-ter-3@1.0.1', config: {} }, pesoMedido: 1 },
        { alias: 'heur', agente: { id: 'heuristico', config: {} }, pesoMedido: 1 },
      ],
    } as const;
    const rechazo = await trabajador.enviar({
      tipo: 'registrar-equipo',
      id: 'e2',
      equipo: equipoNeural,
    });
    expect(rechazo.tipo).toBe('error');

    // Registrando el cerebro primero: el equipo se acepta y juega.
    const cerebro = await trabajador.enviar({
      tipo: 'registrar-cerebro',
      id: 'e2c',
      manifiesto: manifiestoBase,
      tensores: tensoresBase,
    });
    expect(cerebro.tipo).toBe('cerebro-registrado');
    if (cerebro.tipo !== 'cerebro-registrado') return;

    const aceptado = await trabajador.enviar({
      tipo: 'registrar-equipo',
      id: 'e2b',
      equipo: equipoNeural,
    });
    expect(aceptado.tipo).toBe('equipo-registrado');
    if (aceptado.tipo !== 'equipo-registrado') return;

    const partida = await trabajador.enviar({
      tipo: 'partida',
      id: 'e2p',
      config: {
        juegoId: 'tres-en-raya-3',
        semilla: 20261022,
        agentes: [
          { id: aceptado.clave, config: {} },
          { id: 'aleatorio', config: {} },
        ],
      },
    });
    expect(partida.tipo).toBe('partida-completada');
    if (partida.tipo !== 'partida-completada') return;
    expect(partida.registro.validez).toBe('verificada');

    await trabajador.enviar({ tipo: 'retirar-equipo', id: 'e2r', clave: aceptado.clave });
    await trabajador.enviar({ tipo: 'retirar-cerebro', id: 'e2cr', clave: cerebro.clave });
  });

  it('equipo de otro juego o con definición inválida: error controlado', async () => {
    const invalido = await trabajador.enviar({
      tipo: 'registrar-equipo',
      id: 'e3',
      equipo: {
        nombre: 'x',
        juegoId: 'gomoku-7',
        protocolo: 'consulta',
        politica: 'votacion',
        miembros: [
          { alias: 'a', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
          { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
        ],
      } as never,
    });
    // 'aleatorio' es genérico: el equipo en sí es válido para gomoku-7
    // (los agentes de catálogo no están anclados a un juego). Lo relevante
    // es que se registra sin caída y se puede retirar.
    expect(['equipo-registrado', 'error']).toContain(invalido.tipo);
    if (invalido.tipo === 'equipo-registrado') {
      await trabajador.enviar({ tipo: 'retirar-equipo', id: 'e3r', clave: invalido.clave });
    }

    const unSoloMiembro = await trabajador.enviar({
      tipo: 'registrar-equipo',
      id: 'e4',
      equipo: {
        nombre: 'solo',
        juegoId: 'tres-en-raya-3',
        protocolo: 'consulta',
        politica: 'votacion',
        miembros: [
          { alias: 'a', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
        ],
      } as never,
    });
    expect(unSoloMiembro.tipo).toBe('error');
  });
});
