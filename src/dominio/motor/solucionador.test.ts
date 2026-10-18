import { describe, expect, it } from 'vitest';
import { mejorJugada, resolverJuego } from './solucionador';
import { tresEnRaya3, tresEnRaya4 } from '../juegos/tresEnRaya';
import { gomoku7 } from '../juegos/gomoku';
import { cuatroEnRaya7x6 } from '../juegos/cuatroEnRaya7x6';

describe('solucionador exacto', () => {
  it('tres en raya 3×3: empate con juego perfecto (caso de referencia conocido)', () => {
    const resultado = resolverJuego(tresEnRaya3, 30000);
    expect(resultado.completo).toBe(true);
    expect(resultado.presupuestoAgotado).toBe(false);
    expect(resultado.valor).toBe(0);
    expect(resultado.jugadasOptimas.length).toBeGreaterThan(0);
    // Cota superior de estados alcanzables del 3×3: 5478 (referencia pública).
    // Con TT y simetrías debe ser estrictamente menor.
    expect(resultado.nodos).toBeLessThanOrEqual(5478);
    expect(resultado.nodos).toBeGreaterThan(0);
    expect(resultado.tiempoMs).toBeGreaterThanOrEqual(0);
  });

  it('tres en raya 3×3: consistencia interna negamax (valor del hijo óptimo = −valor del padre)', () => {
    // Desde el estado inicial (valor 0), cualquier jugada óptima debe
    // conducir a un estado con valor −0 = 0 desde el rival.
    const resultado = resolverJuego(tresEnRaya3, 30000);
    expect(resultado.completo).toBe(true);
    for (const notacion of resultado.jugadasOptimas) {
      const estado = tresEnRaya3.crearEstadoInicial();
      const hijo = tresEnRaya3.aplicarMovimiento(estado, tresEnRaya3.analizarMovimiento(notacion)!);
      const valorHijo = resolverJuego(tresEnRaya3, 30000, tresEnRaya3.codificar(hijo));
      expect(valorHijo.completo).toBe(true);
      // El +0 normaliza el −0 de la negación (Object.is distingue 0 de −0).
      expect(valorHijo.valor).toBe(-resultado.valor + 0);
    }
  });

  it('tres en raya 3×3: posición ganadora por 1 se resuelve +1 y la mejor jugada gana', () => {
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'victoria-inmediata-p1');
    if (!posicion) throw new Error('falta la posición');
    const resultado = resolverJuego(tresEnRaya3, 30000, posicion.estadoCodificado);
    expect(resultado.completo).toBe(true);
    expect(resultado.valor).toBe(1);
    expect(resultado.jugadasOptimas).toContain('c1');

    const jugada = mejorJugada(tresEnRaya3, posicion.estadoCodificado);
    expect(jugada?.notacion).toBe('c1');
    expect(jugada?.valor).toBe(1);
  });

  it('tres en raya 3×3: posición con amenaza rival se resuelve 0 (bloqueo correcto)', () => {
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'bloqueo-obligatorio-p2');
    if (!posicion) throw new Error('falta la posición');
    const resultado = resolverJuego(tresEnRaya3, 30000, posicion.estadoCodificado);
    expect(resultado.completo).toBe(true);
    // Con juego perfecto de ambos, el 3×3 es empate desde cualquier posición
    // no perdida; aquí P2 puede bloquear y llegar al empate.
    expect(resultado.valor).toBe(0);
    expect(resultado.jugadasOptimas).toContain('a1');
  });

  it('mejorJugada devuelve null en estados terminales', () => {
    const posicion = tresEnRaya3
      .posicionesPrueba()
      .find((posicion) => posicion.nombre === 'terminal-victoria-p1');
    if (!posicion) throw new Error('falta la posición');
    expect(mejorJugada(tresEnRaya3, posicion.estadoCodificado)).toBeNull();
  });

  it('tres en raya 4×4: el presupuesto de CI (2,5 s) se agota y nada se declara', () => {
    // El 4×4 SÍ quedó resuelto localmente en la medición fuera de CI
    // (48,6 s, 6.460.009 nodos, empate: docs/INFORMES/datos/solucionador-fase1.json).
    // Esta prueba verifica el COMPORTAMIENTO DEL PRESUPUESTO: con 2,5 s el
    // solucionador debe devolver incompleto sin declarar nada.
    const resultado = resolverJuego(tresEnRaya4, 2500);
    expect(resultado.completo).toBe(false);
    expect(resultado.presupuestoAgotado).toBe(true);
    expect(resultado.jugadasOptimas).toHaveLength(0);
  });

  it('gomoku 7×7: excede el presupuesto y NO se declara resuelto', () => {
    const resultado = resolverJuego(gomoku7, 300);
    expect(resultado.completo).toBe(false);
    expect(resultado.presupuestoAgotado).toBe(true);
    expect(resultado.jugadasOptimas).toHaveLength(0);
  });

  it('cuatro en raya 7×6: excede el presupuesto y NO se declara resuelto', () => {
    const resultado = resolverJuego(cuatroEnRaya7x6, 300);
    expect(resultado.completo).toBe(false);
    expect(resultado.presupuestoAgotado).toBe(true);
  });

  it('la tabla de transposición con simetrías reduce nodos frente al árbol crudo', () => {
    // El árbol crudo del 3×3 tiene 549946 nodos de juego (referencia);
    // con TT+simetrías exploramos mucho menos.
    const resultado = resolverJuego(tresEnRaya3, 30000);
    expect(resultado.nodos).toBeLessThan(549946);
  });
});
