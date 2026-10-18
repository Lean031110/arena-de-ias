import { describe, expect, it } from 'vitest';
import { crearRng } from './motor/rng';
import type { JuegoConcreto } from './motor/tipos';
import { validarSecuencia } from './motor/validacion';
import { tresEnRaya3, tresEnRaya4 } from './juegos/tresEnRaya';
import { gomoku7, gomoku9, gomoku15 } from './juegos/gomoku';
import { cuatroEnRaya7x6 } from './juegos/cuatroEnRaya7x6';

/**
 * Propiedades multi-juego (ADR-004): bucles deterministas con RNG propio.
 * Cada fallo reporta la semilla del caso para reproducción manual.
 */

/** Juega una partida aleatoria legal devolviendo las notaciones. */
function partidaAleatoria(juego: JuegoConcreto, rng: ReturnType<typeof crearRng>): string[] {
  const notaciones: string[] = [];
  let estado = juego.crearEstadoInicial();
  let jugadas = 0;
  const limite = juego.dimensiones.ancho * juego.dimensiones.alto * 2;
  while (!juego.esTerminal(estado) && jugadas < limite) {
    const legales = juego.movimientosLegales(estado);
    if (legales.length === 0) break;
    const movimiento = rng.elegirEntre(legales);
    notaciones.push(juego.formatearMovimiento(movimiento));
    estado = juego.aplicarMovimiento(estado, movimiento);
    jugadas++;
  }
  return notaciones;
}

describe('propiedades multi-juego', () => {
  const juegos: Array<[JuegoConcreto, string]> = [
    [tresEnRaya3, 'tres-en-raya-3'],
    [tresEnRaya4, 'tres-en-raya-4'],
    [gomoku7, 'gomoku-7'],
    [gomoku9, 'gomoku-9'],
    [cuatroEnRaya7x6, 'cuatro-en-raya-7x6'],
  ];

  for (const [juego, nombre] of juegos) {
    it(`${nombre}: toda partida aleatoria legal termina en resultado consistente y replay válido`, () => {
      const rng = crearRng(20261018);
      for (let caso = 0; caso < 150; caso++) {
        const notaciones = partidaAleatoria(juego, rng);
        const replay = validarSecuencia(juego, notaciones);
        if (!replay.valido) {
          throw new Error(
            `caso ${caso} (semilla 20261018) inválido: ${replay.motivos.join('; ')}`,
          );
        }
        // Si la partida llenó el tablero o ganó alguien, debe haber terminal.
        if (notaciones.length > 0) {
          // O bien es terminal con resultado, o sigue abierta (cap de jugadas
          // del generador, solo posible en tableros grandes).
          const esTerminal = juego.esTerminal(replay.estadoFinal);
          if (esTerminal) {
            expect(replay.resultado).not.toBeNull();
          } else {
            expect(replay.resultado).toBeNull();
          }
        }
      }
    });

    it(`${nombre}: serializar∘decodificar es idéntica (clave de estado estable)`, () => {
      const rng = crearRng(777001);
      for (let caso = 0; caso < 100; caso++) {
        let estado = juego.crearEstadoInicial();
        let jugadas = rng.entero(13);
        while (jugadas > 0 && !juego.esTerminal(estado)) {
          const legales = juego.movimientosLegales(estado);
          if (legales.length === 0) break;
          estado = juego.aplicarMovimiento(estado, rng.elegirEntre(legales));
          jugadas--;
        }
        const texto = juego.codificar(estado);
        const recuperado = juego.decodificar(texto);
        if (juego.claveEstado(recuperado) !== juego.claveEstado(estado)) {
          throw new Error(`caso ${caso} (semilla 777001): clave de estado cambió tras ida/vuelta`);
        }
        expect(juego.codificar(recuperado)).toBe(texto);
      }
    });

    it(`${nombre}: evaluar es antisimétrica y acotada en [-1, 1]`, () => {
      const rng = crearRng(31337);
      for (let caso = 0; caso < 60; caso++) {
        let estado = juego.crearEstadoInicial();
        let jugadas = rng.entero(11);
        while (jugadas > 0 && !juego.esTerminal(estado)) {
          const legales = juego.movimientosLegales(estado);
          if (legales.length === 0) break;
          estado = juego.aplicarMovimiento(estado, rng.elegirEntre(legales));
          jugadas--;
        }
        const v1 = juego.evaluar(estado, 1);
        const v2 = juego.evaluar(estado, 2);
        expect(Math.abs(v1)).toBeLessThanOrEqual(1);
        expect(Math.abs(v2)).toBeLessThanOrEqual(1);
        expect(v1).toBeCloseTo(-v2, 9);
      }
    });
  }

  it('gomoku 15×15: propiedades de serialización y replay con muestra reducida', () => {
    const rng = crearRng(151515);
    for (let caso = 0; caso < 12; caso++) {
      const notaciones = partidaAleatoria(gomoku15, rng);
      const replay = validarSecuencia(gomoku15, notaciones);
      expect(replay.valido).toBe(true);
    }
  });
});
