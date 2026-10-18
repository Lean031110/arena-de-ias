/**
 * PARIDAD PyTorch ⇄ TypeScript (docs/LBA-MODELO.md §9) — la compatibilidad
 * no se declara, se COMPRUEBA:
 *
 * 1. El paquete paridad-red.lba (pesos sembrados, generado por
 *    entrenamiento/generar_casetes.py) supera el validador TS COMPLETO.
 * 2. El runtime ts-puro reproduce las salidas (logits y valor) que PyTorch
 *    calculó para las mismas entradas, con tolerania 1e-4.
 * 3. El hash FNV-1a de las reglas del paquete coincide con el del catálogo
 *    TS real (prueba cruzada del contrato compartido).
 * 4. Las partidas jugadas por el MCTS+red en Python se reproducen con el
 *    motor TS con idéntico resultado (paridad del motor, dirección Python→TS).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validarPaqueteLBA } from './validador';
import { leerTensores } from './safetensors';
import { adelante, cargarPesos } from '../neural/red';
import { huellaJSON } from '../motor/huella';
import { CATALOGO_JUEGOS } from '../juegos/registro';
import { tresEnRaya3 } from '../juegos/tresEnRaya';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_LBA = resolve(AQUI, 'casetes/paridad-red.lba');
const RUTA_JSON = resolve(AQUI, 'casetes/paridad-red.json');
const RUTA_JUEGOS_PY = resolve(AQUI, '../../../entrenamiento/pruebas/casetes/juegos-python.json');

const esquemaCasete = z.object({
  descripcion: z.string(),
  semilla: z.number(),
  arquitectura: z.object({
    tipo: z.literal('conv-politica-valor-v1'),
    entrada: z.object({
      alto: z.number(),
      ancho: z.number(),
      canales: z.number(),
    }),
    acciones: z.number(),
  }),
  entradas: z.array(z.array(z.array(z.array(z.number())))),
  estadosCeldas: z.array(z.array(z.number())),
  politicaEsperada: z.array(z.array(z.number())),
  valorEsperado: z.array(z.number()),
  huellaPaquete: z.string(),
});

describe('paridad PyTorch ⇄ TypeScript', () => {
  it('el paquete del casete supera la validación TS completa', async () => {
    const bytes = new Uint8Array(readFileSync(RUTA_LBA));
    const paquete = await validarPaqueteLBA(bytes);
    expect(paquete.manifiesto.agentId).toBe('red-casete');
    expect(paquete.manifiesto.brainVersion).toBe('0.0.1');
    expect(paquete.huellaPaquete).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el runtime ts-puro reproduce las salidas de PyTorch (tolerancia 1e-4)', async () => {
    const casete = esquemaCasete.parse(JSON.parse(readFileSync(RUTA_JSON, 'utf-8')));
    const paquete = await validarPaqueteLBA(new Uint8Array(readFileSync(RUTA_LBA)));
    const pesos = cargarPesos(leerTensores(paquete.pesosSafetensors));
    const arq = paquete.manifiesto.architecture;

    expect(casete.politicaEsperada.length).toBe(casete.entradas.length);
    expect(casete.valorEsperado.length).toBe(casete.entradas.length);

    for (let i = 0; i < casete.entradas.length; i++) {
      const entrada = new Float32Array(casete.entradas[i]!.flat(2));
      const salida = adelante(pesos, arq, entrada);
      // Logits: comparación con tolerancia absoluta 1e-4.
      for (let a = 0; a < salida.politica.length; a++) {
        const esperado = casete.politicaEsperada[i]![a]!;
        expect(
          Math.abs(salida.politica[a]! - esperado),
          `entrada ${i}, logit ${a}: ts ${salida.politica[a]} vs pytorch ${esperado}`,
        ).toBeLessThan(1e-4);
      }
      // Valor tanh.
      expect(
        Math.abs(salida.valor - casete.valorEsperado[i]!),
        `entrada ${i}, valor: ts ${salida.valor} vs pytorch ${casete.valorEsperado[i]}`,
      ).toBeLessThan(1e-4);
    }
  });

  it('gameRulesHash del paquete = hash del catálogo TS real', async () => {
    const paquete = await validarPaqueteLBA(new Uint8Array(readFileSync(RUTA_LBA)));
    const juego = CATALOGO_JUEGOS.find((j) => j.id === 'tres-en-raya-3')!.juego!;
    const hashTs = huellaJSON({
      id: juego.id,
      reglasVersion: juego.reglasVersion,
      dimensiones: juego.dimensiones,
      familia: juego.familia,
    });
    expect(paquete.manifiesto.gameRulesHash).toBe(hashTs);
  });

  it('los estados del casete se codifican igual desde el motor TS', async () => {
    // Los planos de entrada del casete deben coincidir EXACTAMENTE con los
    // que produce observarTablero sobre los mismos estados de celdas.
    const casete = esquemaCasete.parse(JSON.parse(readFileSync(RUTA_JSON, 'utf-8')));
    const { observarTablero } = await import('../neural/observacion');
    for (let i = 0; i < casete.estadosCeldas.length; i++) {
      const celdas = casete.estadosCeldas[i]!;
      const turno = celdas.filter((v) => v === 1).length === celdas.filter((v) => v === 2).length ? 1 : 2;
      const planosTs = observarTablero({ celdas, turno }, 3, 3);
      const planosCasete = new Float32Array(casete.entradas[i]!.flat(2));
      for (let j = 0; j < planosTs.length; j++) {
        expect(planosTs[j]).toBe(planosCasete[j]);
      }
    }
  });

  it('las partidas del MCTS Python se reproducen con el motor TS (idéntico resultado)', () => {
    const juegos = JSON.parse(readFileSync(RUTA_JUEGOS_PY, 'utf-8')) as {
      juegos: ReadonlyArray<{
        indice: number;
        acciones: readonly number[];
        resultado: number | null;
        jugadas: number;
      }>;
    };
    expect(juegos.juegos.length).toBeGreaterThanOrEqual(12);
    for (const partida of juegos.juegos) {
      let estado = tresEnRaya3.crearEstadoInicial();
      for (const accion of partida.acciones) {
        const fila = Math.floor(accion / 3);
        const columna = accion % 3;
        // La jugada debe ser legal también en el motor TS.
        expect(tresEnRaya3.validarMovimiento(estado, { fila, columna }).valido).toBe(true);
        estado = tresEnRaya3.aplicarMovimiento(estado, { fila, columna });
      }
      const terminal = tresEnRaya3.resultado(estado);
      if (partida.resultado === 0) {
        expect(terminal?.tipo).toBe('empate');
      } else {
        expect(terminal?.tipo).toBe('victoria');
        expect(terminal?.ganador).toBe(partida.resultado);
      }
      expect(partida.acciones.length).toBe(partida.jugadas);
    }
  });
});
