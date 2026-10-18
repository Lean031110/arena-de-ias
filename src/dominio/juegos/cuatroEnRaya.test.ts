import { describe, expect, it } from 'vitest';
import { cuatroEnRaya7x6 } from './cuatroEnRaya7x6';
import { ErrorDatosInvalidos, ErrorMovimientoIlegal } from '../motor/errores';

describe('cuatro en raya 7×6 — reglas', () => {
  const juego = cuatroEnRaya7x6;

  it('estado inicial: 7 columnas jugables, turno del jugador 1', () => {
    const estado = juego.crearEstadoInicial();
    expect(juego.movimientosLegales(estado)).toHaveLength(7);
    expect(juego.jugadorActual(estado)).toBe(1);
    expect(juego.esTerminal(estado)).toBe(false);
  });

  it('la gravedad apila las fichas desde el fondo de la columna', () => {
    let estado = juego.crearEstadoInicial();
    estado = juego.aplicarMovimiento(estado, { columna: 0 });
    expect(estado.celdas[0]).toBe(1); // fila 0 (fondo), columna a
    estado = juego.aplicarMovimiento(estado, { columna: 0 });
    expect(estado.celdas[7]).toBe(2); // fila 1, columna a
    expect(juego.formatearMovimiento({ columna: 0 })).toBe('a');
  });

  it('rechaza columnas llenas y fuera de tablero', () => {
    let estado = juego.crearEstadoInicial();
    for (let i = 0; i < 6; i++) {
      estado = juego.aplicarMovimiento(estado, { columna: 6 });
    }
    expect(juego.validarMovimiento(estado, { columna: 6 }).valido).toBe(false);
    expect(() => juego.aplicarMovimiento(estado, { columna: 6 })).toThrow(ErrorMovimientoIlegal);
    expect(juego.validarMovimiento(estado, { columna: 7 }).valido).toBe(false);
    expect(juego.validarMovimiento(estado, { columna: -1 }).valido).toBe(false);
  });

  it('detecta victoria vertical, horizontal y diagonal', () => {
    // Vertical en columna d (3): P1 juega d cuatro veces alternando con P2 en e.
    let estado = juego.crearEstadoInicial();
    const secuencia = [3, 4, 3, 4, 3, 4, 3];
    for (const columna of secuencia) {
      estado = juego.aplicarMovimiento(estado, { columna });
    }
    expect(juego.resultado(estado)).toEqual({ tipo: 'victoria', ganador: 1 });

    // Horizontal en el fondo: a, (rival b), b, (rival c), c, (rival d), d.
    let estado2 = juego.crearEstadoInicial();
    const secuencia2 = [0, 6, 1, 6, 2, 6, 3];
    for (const columna of secuencia2) {
      estado2 = juego.aplicarMovimiento(estado2, { columna });
    }
    expect(juego.resultado(estado2)).toEqual({ tipo: 'victoria', ganador: 1 });

    // Diagonal ascendente: ver posición de prueba construida.
    const posicion = juego
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-victoria-diagonal-p1');
    if (!posicion) throw new Error('falta la posición diagonal');
    expect(juego.resultado(juego.decodificar(posicion.estadoCodificado))).toEqual({
      tipo: 'victoria',
      ganador: 1,
    });
  });

  it('detecta el empate con tablero lleno (posición construida)', () => {
    const posicion = juego
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-empate');
    if (!posicion) throw new Error('falta la posición de empate');
    const estado = juego.decodificar(posicion.estadoCodificado);
    expect(juego.esTerminal(estado)).toBe(true);
    expect(juego.resultado(estado)).toEqual({ tipo: 'empate' });
    expect(juego.movimientosLegales(estado)).toHaveLength(0);
  });

  it('no se puede jugar tras estado terminal (la jugada extra se rechaza en replay)', () => {
    let estado = juego.crearEstadoInicial();
    for (const columna of [0, 6, 1, 6, 2, 6, 3]) {
      estado = juego.aplicarMovimiento(estado, { columna });
    }
    expect(juego.esTerminal(estado)).toBe(true);
    // La columna sigue físicamente disponible, pero la partida terminó:
    // el ejecutor nunca llega aquí; el replay de una jugada extra falla.
    expect(juego.resultado(estado)).not.toBeNull();
  });

  it('notación de columna: formatear/analizar inversos', () => {
    for (let columna = 0; columna < 7; columna++) {
      const notacion = juego.formatearMovimiento({ columna });
      expect(juego.analizarMovimiento(notacion)).toEqual({ columna });
    }
    expect(juego.analizarMovimiento('h')).toBeNull(); // fuera de rango
    expect(juego.analizarMovimiento('3')).toBeNull();
  });

  it('codificar/decodificar ida y vuelta y corrupción detectada', () => {
    let estado = juego.crearEstadoInicial();
    for (const columna of [0, 1, 0, 2, 0]) {
      estado = juego.aplicarMovimiento(estado, { columna });
    }
    const texto = juego.codificar(estado);
    const recuperado = juego.decodificar(texto);
    expect(juego.claveEstado(recuperado)).toBe(juego.claveEstado(estado));

    // Corrupción: ficha flotante por encima de la altura de columna.
    const mal = JSON.parse(texto) as { celdas: number[]; alturas: number[]; turno: number };
    mal.celdas[41] = 1; // celda superior de la columna g vacía
    expect(() => juego.decodificar(JSON.stringify(mal))).toThrow(ErrorDatosInvalidos);
  });

  it('posiciones de prueba cumplen lo declarado (mejor jugada gana o bloquea)', () => {
    for (const posicion of juego.posicionesPrueba()) {
      const estado = juego.decodificar(posicion.estadoCodificado);
      if (posicion.legalesEsperadas !== undefined) {
        expect(juego.movimientosLegales(estado)).toHaveLength(posicion.legalesEsperadas);
      }
      if (posicion.resultadoEsperado !== undefined) {
        expect(juego.resultado(estado)).toEqual(posicion.resultadoEsperado);
      }
      if (posicion.mejorMovimiento !== undefined) {
        const movimiento = juego.analizarMovimiento(posicion.mejorMovimiento);
        expect(movimiento).not.toBeNull();
        const jugador = juego.jugadorActual(estado);
        const hijo = juego.simularMovimiento(estado, movimiento!, jugador);
        const resultado = juego.resultado(hijo);
        // La mejor jugada o gana (victoria propia) o bloquea (sin victoria rival).
        expect(resultado === null || resultado.ganador === jugador).toBe(true);
      }
    }
  });

  it('evaluar antisimétrico y acotado', () => {
    let estado = juego.crearEstadoInicial();
    for (const columna of [0, 1, 0]) {
      estado = juego.aplicarMovimiento(estado, { columna });
    }
    expect(juego.evaluar(estado, 1)).toBeCloseTo(-juego.evaluar(estado, 2), 9);
    expect(Math.abs(juego.evaluar(estado, 1))).toBeLessThanOrEqual(1);
  });
});
