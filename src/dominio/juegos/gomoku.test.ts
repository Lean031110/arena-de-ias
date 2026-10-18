import { describe, expect, it } from 'vitest';
import { gomoku15, gomoku7, gomoku9 } from './gomoku';

describe('gomoku estilo libre — reglas comunes', () => {
  const variantes = [
    { juego: gomoku7, tam: 7, id: 'gomoku-7' },
    { juego: gomoku9, tam: 9, id: 'gomoku-9' },
    { juego: gomoku15, tam: 15, id: 'gomoku-15' },
  ];

  for (const { juego, tam, id } of variantes) {
    it(`${id}: estado inicial vacío con ${tam * tam} casillas`, () => {
      const estado = juego.crearEstadoInicial();
      expect(juego.id).toBe(id);
      expect(juego.movimientosLegales(estado)).toHaveLength(tam * tam);
      expect(juego.jugadorActual(estado)).toBe(1);
      expect(juego.esTerminal(estado)).toBe(false);
    });

    it(`${id}: notación ida y vuelta`, () => {
      const notacion = tam >= 9 ? 'h8' : 'd4';
      const movimiento = juego.analizarMovimiento(notacion);
      expect(movimiento).not.toBeNull();
      expect(juego.formatearMovimiento(movimiento!)).toBe(notacion);
      expect(juego.analizarMovimiento('z99')).toBeNull();
      // Fuera de rango según el tamaño: 'h8' no existe en 7×7,
      // 'j10' no existe en 9×9, 'p16' no existe en 15×15.
      const fueraDeRango = tam === 7 ? 'h8' : tam === 9 ? 'j10' : 'p16';
      expect(juego.analizarMovimiento(fueraDeRango)).toBeNull();
    });

    it(`${id}: codificar/decodificar ida y vuelta`, () => {
      let estado = juego.crearEstadoInicial();
      estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento('c3')!);
      estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento('e5')!);
      const texto = juego.codificar(estado);
      const recuperado = juego.decodificar(texto);
      expect(juego.claveEstado(recuperado)).toBe(juego.claveEstado(estado));
    });

    it(`${id}: posiciones de prueba cumplen lo declarado`, () => {
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
          const hijo = juego.aplicarMovimiento(estado, movimiento!);
          expect(juego.resultado(hijo)).toEqual({ tipo: 'victoria', ganador: 1 });
        }
      }
    });
  }

  it('gomoku-7: detecta victoria de 5 exactas (posición terminal)', () => {
    const posicion = gomoku7
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-victoria-cinco');
    if (!posicion) throw new Error('falta la posición de cinco');
    const estado = gomoku7.decodificar(posicion.estadoCodificado);
    expect(gomoku7.esTerminal(estado)).toBe(true);
    expect(gomoku7.resultado(estado)).toEqual({ tipo: 'victoria', ganador: 1 });
  });

  it('gomoku-7: el overline (6+) también gana en estilo libre', () => {
    const posicion = gomoku7
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-victoria-overline');
    if (!posicion) throw new Error('falta la posición de overline');
    const estado = gomoku7.decodificar(posicion.estadoCodificado);
    expect(gomoku7.esTerminal(estado)).toBe(true);
    expect(gomoku7.resultado(estado)).toEqual({ tipo: 'victoria', ganador: 1 });
  });

  it('gomoku-7: cuatro en línea NO es victoria', () => {
    // Cuatro piedras de P1 con huecos; P2 disperso; nada terminal.
    let estado = gomoku7.crearEstadoInicial();
    const secuencia = ['c3', 'a1', 'c4', 'a2', 'c5', 'a3', 'c6', 'a4'];
    for (const notacion of secuencia) {
      estado = gomoku7.aplicarMovimiento(estado, gomoku7.analizarMovimiento(notacion)!);
    }
    // P1 tiene c3..c6 (cuatro): no terminal.
    expect(gomoku7.esTerminal(estado)).toBe(false);
  });

  it('gomoku-7: rechaza celdas ocupadas y fuera de tablero', () => {
    let estado = gomoku7.crearEstadoInicial();
    estado = gomoku7.aplicarMovimiento(estado, { fila: 3, columna: 3 });
    expect(gomoku7.validarMovimiento(estado, { fila: 3, columna: 3 }).valido).toBe(false);
    expect(gomoku7.validarMovimiento(estado, { fila: 7, columna: 0 }).valido).toBe(false);
    expect(() => gomoku7.aplicarMovimiento(estado, { fila: 3, columna: 3 })).toThrow();
  });

  it('gomoku-7: victoria diagonal de 5', () => {
    let estado = gomoku7.crearEstadoInicial();
    // P1 construye la diagonal (2,2)-(3,3)-(4,4)-(5,5)-(6,6) = c3,d4,e5,f6,g7.
    const p1 = ['c3', 'd4', 'e5', 'f6', 'g7'];
    const p2 = ['a7', 'a6', 'a5', 'a4'];
    const secuencia = [p1[0]!, p2[0]!, p1[1]!, p2[1]!, p1[2]!, p2[2]!, p1[3]!, p2[3]!, p1[4]!];
    for (const notacion of secuencia) {
      estado = gomoku7.aplicarMovimiento(estado, gomoku7.analizarMovimiento(notacion)!);
    }
    expect(gomoku7.esTerminal(estado)).toBe(true);
    expect(gomoku7.resultado(estado)).toEqual({ tipo: 'victoria', ganador: 1 });
  });
});
