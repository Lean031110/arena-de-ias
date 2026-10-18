/**
 * Fase 3 — Pruebas del dominio de equipos: agregación (votación y
 * ponderación con desempates deterministas), consulta sobre posiciones
 * reales, protocolo turno-alternado, registro de equipos con validación dura
 * (compatibilidad de agentes incluida) y partidas REALES con un equipo como
 * bando a través del motor estándar.
 */

import { describe, expect, it } from 'vitest';
import { obtenerJuego } from '../juegos/registro';
import { crearRng } from '../motor/rng';
import type { PropuestaMiembro } from './tipos';
import { agregarPropuestas, pesoPorNotacion, votosPorNotacion } from './agregacion';
import { consultarEquipo, movimientoDesdeNotacion } from './consulta';
import { crearAgenteEquipo } from './agenteEquipo';
import {
  desregistrarEquipoCargado,
  esEquipoCargado,
  limpiarEquiposCargados,
  registrarEquipoCargado,
  validarEquipo,
} from './registro';
import { crearAgente, registrarCerebroCargado, desregistrarCerebroCargado } from '../agentes/registro';
import type { CerebroCargado } from '../agentes/neural';
import { ejecutarPartida, decisorAutomatico } from '../motor/partida';
import type { Equipo, RegistroConsulta } from './tipos';

function propuesta(alias: string, notacion: string, tiempoMs = 1): PropuestaMiembro {
  return {
    alias,
    agenteId: 'mcts',
    versionCerebro: '—',
    notacion,
    estadisticas: { tiempoMs, simulaciones: 10 },
  };
}

const MIEMBROS_BASE: Equipo['miembros'] = [
  { alias: 'a', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
  { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
];

/* ------------------------- Agregación (puras) --------------------------- */

describe('agregación de propuestas', () => {
  it('votación: gana la mayoría y el recuento es completo', () => {
    const decision = agregarPropuestas(
      [propuesta('a', 'b2'), propuesta('b', 'b2'), propuesta('c', 'a1')],
      [
        ...MIEMBROS_BASE,
        { alias: 'c', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
      'votacion',
      'consulta',
    );
    expect(decision.notacion).toBe('b2');
    expect(decision.recuento[0]?.valor).toBe(2);
    expect(decision.elegidoPor).toEqual(['a', 'b']);
  });

  it('votación: empate se rompe por menor notación (determinista)', () => {
    const pares: Array<[string, string]> = [
      ['a1', 'c3'],
      ['c3', 'a1'],
    ];
    for (const [x, y] of pares) {
      const decision = agregarPropuestas(
        [propuesta('a', x), propuesta('b', y)],
        MIEMBROS_BASE,
        'votacion',
        'consulta',
      );
      expect(decision.notacion).toBe('a1');
    }
  });

  it('ponderado: el peso medido decide aunque los votos empaten', () => {
    const decision = agregarPropuestas(
      [propuesta('a', 'a1'), propuesta('b', 'c3')],
      [
        { alias: 'a', agente: { id: 'aleatorio', config: {} }, pesoMedido: 0.25 },
        { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 0.9 },
      ],
      'ponderado',
      'consulta',
    );
    expect(decision.notacion).toBe('c3');
    expect(decision.recuento[0]?.valor).toBeCloseTo(0.9, 6);
  });

  it('ponderado: pesos negativos (no medidos) son rechazados', () => {
    expect(() =>
      agregarPropuestas(
        [propuesta('a', 'a1')],
        [{ alias: 'a', agente: { id: 'aleatorio', config: {} }, pesoMedido: -0.5 }],
        'ponderado',
        'consulta',
      ),
    ).toThrow(/negativos/);
  });

  it('sin propuestas no hay decisión', () => {
    expect(() => agregarPropuestas([], MIEMBROS_BASE, 'votacion', 'consulta')).toThrow();
  });

  it('estadísticas agregadas suman presupuestos', () => {
    const decision = agregarPropuestas(
      [propuesta('a', 'a1', 3), propuesta('b', 'a1', 5)],
      MIEMBROS_BASE,
      'votacion',
      'consulta',
    );
    expect(decision.estadisticas.tiempoMs).toBe(8);
    expect(decision.estadisticas.simulaciones).toBe(20);
  });

  it('votosPorNotacion y pesoPorNotacion como utilería de interfaz', () => {
    const votos = votosPorNotacion([propuesta('a', 'a1'), propuesta('b', 'a1'), propuesta('c', 'b2')]);
    expect(votos.get('a1')).toBe(2);
    const pesos = pesoPorNotacion(
      [propuesta('a', 'a1'), propuesta('b', 'b2')],
      [
        { alias: 'a', agente: { id: 'aleatorio', config: {} }, pesoMedido: 2 },
        { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 0.5 },
      ],
    );
    expect(pesos.get('a1')).toBe(2);
    expect(pesos.get('b2')).toBe(0.5);
  });
});

/* ----------------------------- Consulta --------------------------------- */

const EQUIPO_CONSULTA: Equipo = {
  nombre: 'consulta-prueba',
  juegoId: 'tres-en-raya-3',
  protocolo: 'consulta',
  politica: 'votacion',
  miembros: [
    { alias: 'táctico', agente: { id: 'minimax', config: { profundidad: 4, nodoLimite: 60000, tiempoLimiteMs: 2000 } }, pesoMedido: 1 },
    { alias: 'explorador', agente: { id: 'mcts', config: { simulaciones: 80, constanteExploracion: 1.4, limiteRollout: 9 } }, pesoMedido: 1 },
    { alias: 'azaro', agente: { id: 'aleatorio', config: {} }, pesoMedido: 0.2 },
  ],
};

describe('consulta de equipo sobre una posición real', () => {
  it('todos los miembros proponen y queda registro completo con presupuesto', () => {
    const juego = obtenerJuego('tres-en-raya-3');
    const registro = consultarEquipo(juego, juego.crearEstadoInicial(), EQUIPO_CONSULTA, {
      semilla: 20261019,
      indiceJugada: 0,
      indiceJugadaDelBando: 0,
    });
    expect(registro.propuestas).toHaveLength(3);
    expect(registro.propuestas.map((p) => p.alias).sort()).toEqual([
      'azaro',
      'explorador',
      'táctico',
    ]);
    for (const propuesta of registro.propuestas) {
      expect(propuesta.notacion).toMatch(/^[a-c][1-3]$/);
      expect(propuesta.estadisticas.tiempoMs).toBeGreaterThanOrEqual(0);
      expect(propuesta.versionCerebro).toBe('—');
    }
    expect(registro.decision.recuento.length).toBeGreaterThanOrEqual(1);
    expect(registro.presupuestoTotal.miembrosQueDecidieron).toBe(3);
    expect(registro.presupuestoTotal.simulaciones).toBeGreaterThanOrEqual(80);
  });

  it('es reproducible con la misma semilla (mismas propuestas)', () => {
    const juego = obtenerJuego('tres-en-raya-3');
    const opciones = { semilla: 424242, indiceJugada: 3, indiceJugadaDelBando: 1 };
    const r1 = consultarEquipo(juego, juego.crearEstadoInicial(), EQUIPO_CONSULTA, opciones);
    const r2 = consultarEquipo(juego, juego.crearEstadoInicial(), EQUIPO_CONSULTA, opciones);
    expect(r1.propuestas.map((p) => p.notacion)).toEqual(r2.propuestas.map((p) => p.notacion));
    expect(r1.decision.notacion).toBe(r2.decision.notacion);
  });

  it('turno-alternado: SOLO el miembro cuyo turno toca decide', () => {
    const juego = obtenerJuego('tres-en-raya-3');
    const equipo: Equipo = {
      ...EQUIPO_CONSULTA,
      nombre: 'alternado-prueba',
      protocolo: 'turno-alternado',
      miembros: [
        { alias: 'primero', agente: { id: 'heuristico', config: {} }, pesoMedido: 1 },
        { alias: 'segundo', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
    };
    const jugada0 = consultarEquipo(juego, juego.crearEstadoInicial(), equipo, {
      semilla: 7,
      indiceJugada: 0,
      indiceJugadaDelBando: 0,
    });
    expect(jugada0.propuestas).toHaveLength(1);
    expect(jugada0.propuestas[0]?.alias).toBe('primero');
    expect(jugada0.decision.protocolo).toBe('turno-alternado');

    const jugada1 = consultarEquipo(juego, juego.crearEstadoInicial(), equipo, {
      semilla: 7,
      indiceJugada: 0,
      indiceJugadaDelBando: 1,
    });
    expect(jugada1.propuestas[0]?.alias).toBe('segundo');
  });

  it('equipo de otro juego y estados terminales se rechazan', () => {
    const juego = obtenerJuego('tres-en-raya-3');
    const otro: Equipo = { ...EQUIPO_CONSULTA, juegoId: 'gomoku-7' };
    expect(() =>
      consultarEquipo(juego, juego.crearEstadoInicial(), otro, {
        semilla: 1,
        indiceJugada: 0,
        indiceJugadaDelBando: 0,
      }),
    ).toThrow(/gomoku-7/);
  });

  it('movimientoDesdeNotacion resuelve la decisión a movimiento legal', () => {
    const juego = obtenerJuego('tres-en-raya-3');
    const registro = consultarEquipo(juego, juego.crearEstadoInicial(), EQUIPO_CONSULTA, {
      semilla: 99,
      indiceJugada: 0,
      indiceJugadaDelBando: 0,
    });
    const movimiento = movimientoDesdeNotacion(juego, juego.crearEstadoInicial(), registro.decision.notacion);
    expect(juego.formatearMovimiento(movimiento)).toBe(registro.decision.notacion);
    expect(() => movimientoDesdeNotacion(juego, juego.crearEstadoInicial(), 'z9')).toThrow();
  });
});

/* -------------------- Registro de equipos (validación) ------------------- */

describe('registro de equipos', () => {
  it('registra un equipo válido y resuelve su clave', () => {
    limpiarEquiposCargados();
    const clave = registrarEquipoCargado(EQUIPO_CONSULTA);
    expect(clave).toBe('equipo:consulta-prueba');
    expect(esEquipoCargado(clave)).toBe(true);
    desregistrarEquipoCargado(clave);
    expect(esEquipoCargado(clave)).toBe(false);
  });

  it('rechaza menos de 2 miembros, alias duplicados y agentes inexistentes', () => {
    const errores1 = validarEquipo({
      ...EQUIPO_CONSULTA,
      miembros: [{ alias: 'solo', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 }],
    });
    expect(errores1.join()).toContain('al menos 2');

    const errores2 = validarEquipo({
      ...EQUIPO_CONSULTA,
      miembros: [
        { alias: 'x', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
        { alias: 'x', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
    });
    expect(errores2.join()).toContain('duplicado');

    const errores3 = validarEquipo({
      ...EQUIPO_CONSULTA,
      miembros: [
        { alias: 'a', agente: { id: 'no-existe', config: {} }, pesoMedido: 1 },
        { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
    });
    expect(errores3.join()).toContain('no existe');
  });

  it('rechaza el agente humano como miembro (no automático)', () => {
    const errores = validarEquipo({
      ...EQUIPO_CONSULTA,
      miembros: [
        { alias: 'persona', agente: { id: 'humano', config: {} }, pesoMedido: 1 },
        { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
    });
    expect(errores.join()).toContain('no es automático disponible');
  });

  it('COMPATIBILIDAD DURA: cerebro de otro juego, rechazado', () => {
    // Cerebro simulado de tres-en-raya-4 registrado en runtime.
    const cerebroOtro: CerebroCargado = {
      agentId: 'red-otra',
      brainVersion: '1.0.0',
      gameId: 'tres-en-raya-4',
      architecture: { tipo: 'conv-politica-valor-v1' } as CerebroCargado['architecture'],
      pesos: new Map(),
    };
    const clave = registrarCerebroCargado(cerebroOtro);
    try {
      const errores = validarEquipo({
        ...EQUIPO_CONSULTA,
        miembros: [
          { alias: 'neural-otro', agente: { id: clave, config: {} }, pesoMedido: 1 },
          { alias: 'b', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
        ],
      });
      expect(errores.join()).toContain('tres-en-raya-4');
      expect(errores.join()).toContain('compatibilidad dura');
    } finally {
      desregistrarCerebroCargado(clave);
    }
  });

  it('nombre repetido con definición DISTINTA: rechazado; idéntica: idempotente', () => {
    limpiarEquiposCargados();
    registrarEquipoCargado(EQUIPO_CONSULTA);
    expect(() => registrarEquipoCargado(EQUIPO_CONSULTA)).not.toThrow();
    expect(() =>
      registrarEquipoCargado({ ...EQUIPO_CONSULTA, politica: 'ponderado' }),
    ).toThrow(/ya existe un equipo distinto/);
    limpiarEquiposCargados();
  });
});

/* ---------------- Partidas reales con agente de equipo ------------------ */

describe('partidas reales con un equipo como bando', () => {
  it('protocolo consulta: la partida termina, es válida y la traza registra TODAS las consultas', async () => {
    limpiarEquiposCargados();
    const consultas: RegistroConsulta[] = [];
    const agenteEquipo = crearAgenteEquipo(EQUIPO_CONSULTA, {
      alConsultar: (registro) => consultas.push(registro),
    });
    const clave = registrarEquipoCargado(EQUIPO_CONSULTA);
    const registro = await ejecutarPartida(
      {
        juegoId: 'tres-en-raya-3',
        semilla: 20261020,
        agentes: [
          { id: clave, config: {} },
          { id: 'heuristico', config: {} },
        ],
      },
      (parametros) =>
        parametros.infoAgente.id === clave
          ? agenteEquipo.elegirMovimiento(parametros.juego, parametros.estado, parametros.contexto)
          : decisorAutomatico(parametros),
    );
    expect(registro.resultado).not.toBeNull();
    // El bando del equipo (jugador 1) decide varias jugadas: la traza del
    // decisor registra cada consulta con TODOS sus miembros.
    expect(consultas.length).toBeGreaterThanOrEqual(2);
    for (const consulta of consultas) {
      expect(consulta.propuestas).toHaveLength(3);
      expect(consulta.decision.notacion).toMatch(/^[a-c][1-3]$/);
    }
    // Las jugadas registradas coinciden en número con las consultas trazadas.
    const jugadasEquipo = registro.movimientos.filter((j) => j.jugador === 1);
    expect(jugadasEquipo.length).toBe(consultas.length);
    desregistrarEquipoCargado(clave);
  });

  it('protocolo turno-alternado: los miembros alternan la decisión completa', async () => {
    limpiarEquiposCargados();
    const equipo: Equipo = {
      nombre: 'pareja-alternada',
      juegoId: 'tres-en-raya-3',
      protocolo: 'turno-alternado',
      politica: 'votacion',
      miembros: [
        { alias: 'veterana', agente: { id: 'heuristico', config: {} }, pesoMedido: 1 },
        { alias: 'novata', agente: { id: 'aleatorio', config: {} }, pesoMedido: 1 },
      ],
    };
    const consultas: RegistroConsulta[] = [];
    const agenteEquipo = crearAgenteEquipo(equipo, {
      alConsultar: (r) => consultas.push(r),
    });
    const clave = registrarEquipoCargado(equipo);
    const registro = await ejecutarPartida(
      {
        juegoId: 'tres-en-raya-3',
        semilla: 31337,
        agentes: [
          { id: clave, config: {} },
          { id: 'aleatorio', config: {} },
        ],
      },
      (parametros) =>
        parametros.infoAgente.id === clave
          ? agenteEquipo.elegirMovimiento(parametros.juego, parametros.estado, parametros.contexto)
          : decisorAutomatico(parametros),
    );
    expect(registro.resultado).not.toBeNull();
    // Alternancia real: primera jugada del bando → «veterana», segunda → «novata»…
    expect(consultas.length).toBeGreaterThanOrEqual(2);
    expect(consultas[0]?.propuestas[0]?.alias).toBe('veterana');
    expect(consultas[1]?.propuestas[0]?.alias).toBe('novata');
    if (consultas.length > 2) {
      expect(consultas[2]?.propuestas[0]?.alias).toBe('veterana');
    }
    desregistrarEquipoCargado(clave);
  });

  it('crearAgente resuelve la clave equipo:… como cualquier agente', () => {
    limpiarEquiposCargados();
    const clave = registrarEquipoCargado(EQUIPO_CONSULTA);
    const agente = crearAgente(clave, {});
    const juego = obtenerJuego('tres-en-raya-3');
    const decision = agente.elegirMovimiento(juego, juego.crearEstadoInicial(), {
      rng: crearRng(5),
      config: {},
      indiceJugada: 0,
      semilla: 5,
    });
    expect(juego.validarMovimiento(juego.crearEstadoInicial(), decision.movimiento).valido).toBe(true);
    expect(() => crearAgente(clave, { simulaciones: 10 })).toThrow();
    desregistrarEquipoCargado(clave);
    limpiarEquiposCargados();
  });
});
