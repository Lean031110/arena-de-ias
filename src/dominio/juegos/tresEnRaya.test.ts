import { describe, expect, it } from 'vitest';
import { tresEnRaya3, tresEnRaya4 } from './tresEnRaya';
import { ErrorDatosInvalidos, ErrorMovimientoIlegal } from '../motor/errores';

describe('tres en raya 3×3 — reglas', () => {
  const juego = tresEnRaya3;

  it('estado inicial vacío con turno del jugador 1', () => {
    const estado = juego.crearEstadoInicial();
    expect(juego.jugadorActual(estado)).toBe(1);
    expect(juego.movimientosLegales(estado)).toHaveLength(9);
    expect(juego.esTerminal(estado)).toBe(false);
    expect(juego.resultado(estado)).toBeNull();
  });

  it('aplica movimientos de forma inmutable y alterna el turno', () => {
    const inicial = juego.crearEstadoInicial();
    const movimiento = juego.analizarMovimiento('b2');
    if (movimiento === null) throw new Error('notación b2 debería parsear');
    const siguiente = juego.aplicarMovimiento(inicial, movimiento);
    expect(juego.jugadorActual(siguiente)).toBe(2);
    expect(juego.movimientosLegales(siguiente)).toHaveLength(8);
    expect(juego.movimientosLegales(inicial)).toHaveLength(9); // inmutable
  });

  it('rechaza movimientos ilegales con motivo', () => {
    const estado = juego.crearEstadoInicial();
    const ocupada = juego.aplicarMovimiento(estado, { fila: 0, columna: 0 });
    expect(juego.validarMovimiento(ocupada, { fila: 0, columna: 0 }).valido).toBe(false);
    expect(() => juego.aplicarMovimiento(ocupada, { fila: 0, columna: 0 })).toThrow(
      ErrorMovimientoIlegal,
    );
    expect(juego.validarMovimiento(estado, { fila: 5, columna: 5 }).valido).toBe(false);
  });

  it('detecta las 8 líneas de victoria (para ambos jugadores)', () => {
    const lineas: Array<[string[], 1 | 2]> = [
      [['a1', 'a2', 'a3'], 1],
      [['b1', 'b2', 'b3'], 1],
      [['c1', 'c2', 'c3'], 1],
      [['a1', 'b1', 'c1'], 1],
      [['a2', 'b2', 'c2'], 1],
      [['a3', 'b3', 'c3'], 1],
      [['a1', 'b2', 'c3'], 1],
      [['a3', 'b2', 'c1'], 1],
    ];
    const todas = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];
    for (const [celdas, jugador] of lineas) {
      const rival = jugador === 1 ? 2 : 1;
      const seguras = todas.filter((celda) => !celdas.includes(celda));
      let estado = juego.crearEstadoInicial();
      estado = juego.simularMovimiento(estado, juego.analizarMovimiento(celdas[0]!)!, jugador);
      estado = juego.simularMovimiento(estado, juego.analizarMovimiento(seguras[0]!)!, rival);
      estado = juego.simularMovimiento(estado, juego.analizarMovimiento(celdas[1]!)!, jugador);
      estado = juego.simularMovimiento(estado, juego.analizarMovimiento(seguras[1]!)!, rival);
      estado = juego.simularMovimiento(estado, juego.analizarMovimiento(celdas[2]!)!, jugador);
      expect(juego.esTerminal(estado)).toBe(true);
      expect(juego.resultado(estado)).toEqual({ tipo: 'victoria', ganador: jugador });
    }
  });

  it('detecta empate con tablero lleno sin líneas', () => {
    const posicion = juego
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-empate');
    if (!posicion) throw new Error('falta la posición de empate');
    const estado = juego.decodificar(posicion.estadoCodificado);
    expect(juego.esTerminal(estado)).toBe(true);
    expect(juego.resultado(estado)).toEqual({ tipo: 'empate' });
    expect(juego.movimientosLegales(estado)).toHaveLength(0);
  });

  it('codificar/decodificar hace ida y vuelta exacta', () => {
    let estado = juego.crearEstadoInicial();
    for (const notacion of ['b2', 'a1', 'c3']) {
      estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento(notacion)!);
    }
    const texto = juego.codificar(estado);
    const recuperado = juego.decodificar(texto);
    expect(juego.claveEstado(recuperado)).toBe(juego.claveEstado(estado));
    expect(juego.codificar(recuperado)).toBe(texto);
  });

  it('decodificar rechaza datos corruptos con detalle', () => {
    expect(() => juego.decodificar('esto no es json')).toThrow(ErrorDatosInvalidos);
    expect(() => juego.decodificar('{"celdas":[0,0],"turno":1,"jugadas":0}')).toThrow(
      ErrorDatosInvalidos,
    );
    expect(() =>
      juego.decodificar('{"celdas":[0,0,0,0,0,0,0,0,0],"turno":3,"jugadas":0}'),
    ).toThrow(ErrorDatosInvalidos);
    expect(() =>
      juego.decodificar('{"celdas":[0,0,0,0,0,0,0,0,0],"turno":1,"jugadas":5}'),
    ).toThrow(ErrorDatosInvalidos);
  });

  it('notación: formatear y analizar son inversos exactos', () => {
    for (let fila = 0; fila < 3; fila++) {
      for (let columna = 0; columna < 3; columna++) {
        const notacion = juego.formatearMovimiento({ fila, columna });
        const movimiento = juego.analizarMovimiento(notacion);
        expect(movimiento).toEqual({ fila, columna });
      }
    }
    expect(juego.analizarMovimiento('z9')).toBeNull();
    // Acepta mayúsculas (normaliza a minúsculas).
    expect(juego.analizarMovimiento('B2')).toEqual({ fila: 1, columna: 1 });
  });

  it('las posiciones de prueba cumplen sus expectativas declaradas', () => {
    for (const posicion of juego.posicionesPrueba()) {
      const estado = juego.decodificar(posicion.estadoCodificado);
      if (posicion.legalesEsperadas !== undefined) {
        expect(juego.movimientosLegales(estado)).toHaveLength(posicion.legalesEsperadas);
      }
      if (posicion.resultadoEsperado !== undefined) {
        expect(juego.esTerminal(estado)).toBe(true);
        expect(juego.resultado(estado)).toEqual(posicion.resultadoEsperado);
      }
      if (posicion.mejorMovimiento !== undefined) {
        const movimiento = juego.analizarMovimiento(posicion.mejorMovimiento);
        expect(movimiento).not.toBeNull();
        const jugador = juego.jugadorActual(estado);
        const hijo = juego.aplicarMovimiento(estado, movimiento!);
        const resultado = juego.resultado(hijo);
        if (resultado !== null && resultado.tipo === 'victoria') {
          // Gana directamente.
          expect(resultado.ganador).toBe(jugador);
        } else {
          // Bloqueo: con cualquier otra jugada, el rival gana a continuación.
          const alternativa = juego
            .movimientosLegales(estado)
            .find((m) => juego.formatearMovimiento(m) !== posicion.mejorMovimiento);
          expect(alternativa).toBeDefined();
          const hijoAlternativo = juego.aplicarMovimiento(estado, alternativa!);
          const tieneVictoriaRival = juego
            .movimientosLegales(hijoAlternativo)
            .some((m) => {
              const hipotetico = juego.simularMovimiento(
                hijoAlternativo,
                m,
                juego.jugadorActual(hijoAlternativo),
              );
              const resultadoRival = juego.resultado(hipotetico);
              return resultadoRival?.tipo === 'victoria';
            });
          expect(tieneVictoriaRival).toBe(true);
        }
      }
    }
  });

  it('evaluar es antisimétrico entre jugadores y está en [-1, 1]', () => {
    let estado = juego.crearEstadoInicial();
    estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento('b2')!);
    estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento('a1')!);
    const valorP1 = juego.evaluar(estado, 1);
    const valorP2 = juego.evaluar(estado, 2);
    expect(valorP1).toBeCloseTo(-valorP2, 9);
    expect(Math.abs(valorP1)).toBeLessThanOrEqual(1);
  });
});

describe('tres en raya 4×4 (cuatro en línea) — reglas', () => {
  const juego = tresEnRaya4;

  it('estado inicial con 16 casillas vacías', () => {
    const estado = juego.crearEstadoInicial();
    expect(juego.movimientosLegales(estado)).toHaveLength(16);
    expect(juego.jugadorActual(estado)).toBe(1);
  });

  it('detecta la victoria horizontal de 4', () => {
    const posicion = juego
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-victoria-p1-4x4');
    if (!posicion) throw new Error('falta la posición terminal');
    const estado = juego.decodificar(posicion.estadoCodificado);
    expect(juego.resultado(estado)).toEqual({ tipo: 'victoria', ganador: 1 });
  });

  it('detecta la victoria vertical y diagonal de 4', () => {
    // Vertical en columna b: P1 (primer jugador) completa b1-b4; rival en a.
    let estado = juego.crearEstadoInicial();
    for (let fila = 0; fila < 4; fila++) {
      estado = juego.aplicarMovimiento(estado, { fila, columna: 1 }); // P1 en b
      if (juego.esTerminal(estado)) break;
      estado = juego.aplicarMovimiento(estado, { fila, columna: 0 }); // rival en a
    }
    expect(juego.resultado(estado)).toEqual({ tipo: 'victoria', ganador: 1 });

    // Diagonal principal (a1, b2, c3, d4): P1 primero; rival en columna d
    // (filas 0-2, sin tocar d4, que P1 ocupa como jugada ganadora).
    let estado2 = juego.crearEstadoInicial();
    for (let i = 0; i < 4; i++) {
      estado2 = juego.aplicarMovimiento(estado2, { fila: i, columna: i }); // P1 diagonal
      if (juego.esTerminal(estado2)) break;
      estado2 = juego.aplicarMovimiento(estado2, { fila: i, columna: 3 }); // rival en d
    }
    expect(juego.resultado(estado2)).toEqual({ tipo: 'victoria', ganador: 1 });
  });

  it('tres en línea NO gana en la variante 4×4', () => {
    let estado = juego.crearEstadoInicial();
    // P1 juega a1, a2, a3 (tres); P2 dispersa.
    for (const [p1, p2] of [
      ['a1', 'c1'],
      ['a2', 'c2'],
      ['a3', 'c3'],
    ] as const) {
      estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento(p1)!);
      estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento(p2)!);
    }
    expect(juego.esTerminal(estado)).toBe(false);
    expect(juego.resultado(estado)).toBeNull();
  });

  it('posiciones de prueba: la mejor jugada gana, o bloquea la pérdida inmediata', () => {
    for (const posicion of juego.posicionesPrueba()) {
      const estado = juego.decodificar(posicion.estadoCodificado);
      if (posicion.legalesEsperadas !== undefined) {
        expect(juego.movimientosLegales(estado)).toHaveLength(posicion.legalesEsperadas);
      }
      if (posicion.mejorMovimiento !== undefined) {
        const movimiento = juego.analizarMovimiento(posicion.mejorMovimiento);
        expect(movimiento).not.toBeNull();
        const jugador = juego.jugadorActual(estado);
        const hijo = juego.aplicarMovimiento(estado, movimiento!);
        const resultado = juego.resultado(hijo);
        if (resultado !== null && resultado.tipo === 'victoria') {
          // La mejor jugada gana directamente.
          expect(resultado.ganador).toBe(jugador);
        } else {
          // Bloqueo: sin bloquear, el rival gana en la siguiente jugada.
          // Probamos con una jugada alternativa cualquiera que no bloquee.
          const alternativa = juego
            .movimientosLegales(estado)
            .find((m) => juego.formatearMovimiento(m) !== posicion.mejorMovimiento);
          if (alternativa !== undefined) {
            const hijoAlternativo = juego.aplicarMovimiento(estado, alternativa);
            const celdaGanadora = juego
              .movimientosLegales(hijoAlternativo)
              .find((m) => {
                const hipotetico = juego.simularMovimiento(
                  hijoAlternativo,
                  m,
                  juego.jugadorActual(hijoAlternativo),
                );
                const resultadoRival = juego.resultado(hipotetico);
                return resultadoRival?.tipo === 'victoria';
              });
            expect(celdaGanadora).toBeDefined();
          }
        }
      }
    }
  });
});
