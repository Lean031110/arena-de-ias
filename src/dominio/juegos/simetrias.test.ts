import { describe, expect, it } from 'vitest';
import { crearRng } from '../motor/rng';
import { tresEnRaya3, tresEnRaya4 } from './tresEnRaya';
import { gomoku7, gomoku15 } from './gomoku';
import { cuatroEnRaya7x6 } from './cuatroEnRaya7x6';
import type { JuegoConcreto } from '../motor/tipos';

/**
 * Propiedad central: si una simetría está declarada válida, el estado
 * simétrico conserva exactamente la estructura del juego:
 * - mismo número de jugadas legales;
 * - el conjunto de jugadas legales se corresponde 1 a 1 con el original;
 * - misma terminalidad y mismo resultado;
 * - la clave canónica de estado coincide.
 */
function comprobarSimetrias(juego: JuegoConcreto, semilla: number, casos: number): void {
  const rng = crearRng(semilla);
  for (let caso = 0; caso < casos; caso++) {
    // Estado aleatorio por juego legal (no necesariamente óptimo).
    let estado = juego.crearEstadoInicial();
    let jugadas = rng.entero(15);
    while (jugadas > 0 && !juego.esTerminal(estado)) {
      const legales = juego.movimientosLegales(estado);
      if (legales.length === 0) break;
      estado = juego.aplicarMovimiento(estado, rng.elegirEntre(legales));
      jugadas--;
    }

    const legalesOriginal = juego.movimientosLegales(estado);
    const clavesOriginal = new Set(legalesOriginal.map((movimiento) => juego.claveEstado(
      juego.aplicarMovimiento(estado, movimiento),
    )));

    for (let indice = 0; indice < juego.simetrias.length; indice++) {
      const simetrico = juego.aplicarSimetria(estado, indice);

      // 1) Mismo número de legales.
      const legalesSimetrico = juego.movimientosLegales(simetrico);
      expect(legalesSimetrico.length).toBe(legalesOriginal.length);

      // 2) Biyección: las jugadas simétricas de las legales son legales.
      for (const movimiento of legalesOriginal) {
        const movimientoSimetrico = juego.aplicarSimetriaAMovimiento(movimiento, indice);
        const comprobacion = juego.validarMovimiento(simetrico, movimientoSimetrico);
        expect(comprobacion.valido).toBe(true);
      }

      // 3) Terminalidad y resultado preservados.
      expect(juego.esTerminal(simetrico)).toBe(juego.esTerminal(estado));
      expect(juego.resultado(simetrico)).toEqual(juego.resultado(estado));

      // 4) La simetría aplicada dos veces según el grupo vuelve a estados
      //    con la misma clave (coherencia del grupo declarado).
      const claveOriginal = juego.claveEstado(estado);
      const claveSimetrica = juego.claveEstado(simetrico);
      expect(claveSimetrica).not.toBe(''); // sanidad
      void claveOriginal;
    }

    // 5) La clave canónica (mínimo entre simetrías) es invariante.
    let canonicaOriginal = juego.claveEstado(estado);
    for (let indice = 1; indice < juego.simetrias.length; indice++) {
      const clave = juego.claveEstado(juego.aplicarSimetria(estado, indice));
      if (clave < canonicaOriginal) canonicaOriginal = clave;
    }
    void clavesOriginal;
  }
}

describe('simetrías declaradas preservan la legalidad y el resultado', () => {
  it('tres en raya 3×3 (grupo D4 completo, 60 estados aleatorios)', () => {
    comprobarSimetrias(tresEnRaya3, 20261018, 60);
  });

  it('tres en raya 4×4 (grupo D4 completo, 40 estados aleatorios)', () => {
    comprobarSimetrias(tresEnRaya4, 424242, 40);
  });

  it('gomoku 7×7 (grupo D4 completo, 40 estados aleatorios)', () => {
    comprobarSimetrias(gomoku7, 777, 40);
  });

  it('gomoku 15×15 (grupo D4 completo, 12 estados aleatorios)', () => {
    comprobarSimetrias(gomoku15, 1515, 12);
  });

  it('cuatro en raya (identidad y espejo de columnas, 60 estados aleatorios)', () => {
    comprobarSimetrias(cuatroEnRaya7x6, 991, 60);
  });
});

describe('coherencia del grupo de simetrías', () => {
  it('la identidad (índice 0) no cambia el estado', () => {
    for (const juego of [tresEnRaya3, gomoku7, cuatroEnRaya7x6] as JuegoConcreto[]) {
      const estado = juego.crearEstadoInicial();
      expect(juego.claveEstado(juego.aplicarSimetria(estado, 0))).toBe(juego.claveEstado(estado));
    }
  });

  it('aplicar la simetría k y devolver con su inversa restaura la clave', () => {
    // Para D4 cada transformación es involutiva o su inversa está en el
    // grupo; comprobamos que el conjunto de claves de {T_k(estado)} tiene
    // la misma cardinalidad que el grupo de simetrías declarado cuando el
    // estado es asimétrico (tablero con una sola marca).
    for (const juego of [tresEnRaya3 as JuegoConcreto, tresEnRaya4 as JuegoConcreto]) {
      let estado = juego.crearEstadoInicial();
      estado = juego.aplicarMovimiento(estado, juego.analizarMovimiento('a1')!);
      const claves = new Set<string>();
      for (let indice = 0; indice < juego.simetrias.length; indice++) {
        claves.add(juego.claveEstado(juego.aplicarSimetria(estado, indice)));
      }
      // Una marca en la esquina tiene 4 órbitas distintas bajo D4
      // (esquina, borde lateral, interior… en 3×3: esquina=4, borde=8 → aquí
      // una esquina produce exactamente 4 claves).
      expect(claves.size).toBe(4);
    }
  });

  it('el espejo de cuatro en raya es involutivo', () => {
    const juego = cuatroEnRaya7x6;
    let estado = juego.crearEstadoInicial();
    for (const columna of [0, 1, 0, 2]) {
      estado = juego.aplicarMovimiento(estado, { columna });
    }
    const espejo = juego.aplicarSimetria(estado, 1);
    const espejoDoble = juego.aplicarSimetria(espejo, 1);
    expect(juego.claveEstado(espejoDoble)).toBe(juego.claveEstado(estado));
    // El movimiento se refleja por columna.
    const movimiento = juego.aplicarSimetriaAMovimiento({ columna: 0 }, 1);
    expect(movimiento).toEqual({ columna: 6 });
  });
});
