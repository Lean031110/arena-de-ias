import { describe, expect, it } from 'vitest';
import { crearEvento, detectarEntorno, generarId } from './eventos';
import { huellaJSON } from './huella';

describe('registro de eventos', () => {
  it('crea eventos con id único, fecha ISO y huella coherente', () => {
    const evento = crearEvento('partida', 'Partida verificada', { id: 'x' });
    expect(evento.id).toMatch(/^[0-9a-f-]{10,}$/);
    expect(() => new Date(evento.fecha).toISOString()).not.toThrow();
    expect(evento.huella).toBe(
      huellaJSON({ tipo: 'partida', resumen: 'Partida verificada', datos: { id: 'x' } }),
    );
  });

  it('genera ids distintos para eventos distintos', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generarId()));
    expect(ids.size).toBe(500);
  });

  it('detecta el entorno node en las pruebas', () => {
    const entorno = detectarEntorno();
    expect(entorno.plataforma).toBe('node');
    expect(entorno.descripcion).toContain('Node');
  });

  it('la huella cambia si cambia el resumen o los datos', () => {
    const a = crearEvento('error', 'fallo X', { codigo: 1 });
    const b = crearEvento('error', 'fallo Y', { codigo: 1 });
    const c = crearEvento('error', 'fallo X', { codigo: 2 });
    expect(a.huella).not.toBe(b.huella);
    expect(a.huella).not.toBe(c.huella);
  });
});
