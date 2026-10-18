/**
 * Arquitectura «conv-politica-valor-v1» en TypeScript puro — runtime de
 * inferencia «ts-puro» (ADR-014). Definición gemela de
 * entrenamiento/red.py (PyTorch); la paridad se PRUEBA con el casete
 * docs/LBA-MODELO.md §9. Cero dependencias: Float32Array y bucles.
 *
 * Entrada: [canales=2, alto, ancho] (canal 0 = fichas del jugador con turno,
 * canal 1 = fichas del rival). Salida: logits de política [acciones] y
 * valor tanh [1] desde la perspectiva del jugador con turno.
 */

import type { ArquitecturaLBA } from '../lba/esquema';
import type { TensorLeido } from '../lba/safetensors';

export interface SalidaRed {
  readonly politica: Float32Array; // logits, uno por acción
  readonly valor: number; // tanh, perspectiva del jugador con turno
}

export interface PesosRed {
  readonly conv1Peso: Float32Array; // [32, C, 3, 3]
  readonly conv1Sesgo: Float32Array; // [32]
  readonly conv2Peso: Float32Array; // [32, 32, 3, 3]
  readonly conv2Sesgo: Float32Array; // [32]
  readonly polConvPeso: Float32Array; // [4, 32, 1, 1]
  readonly polConvSesgo: Float32Array; // [4]
  readonly polFcPeso: Float32Array; // [acciones, 4*A*W]
  readonly polFcSesgo: Float32Array; // [acciones]
  readonly valConvPeso: Float32Array; // [2, 32, 1, 1]
  readonly valConvSesgo: Float32Array; // [2]
  readonly valFc1Peso: Float32Array; // [16, 2*A*W]
  readonly valFc1Sesgo: Float32Array; // [16]
  readonly valFc2Peso: Float32Array; // [1, 16]
  readonly valFc2Sesgo: Float32Array; // [1]
}

const NOMBRE_TENSORES = [
  'conv1.peso',
  'conv1.sesgo',
  'conv2.peso',
  'conv2.sesgo',
  'politica.conv.peso',
  'politica.conv.sesgo',
  'politica.fc.peso',
  'politica.fc.sesgo',
  'valor.conv.peso',
  'valor.conv.sesgo',
  'valor.fc1.peso',
  'valor.fc1.sesgo',
  'valor.fc2.peso',
  'valor.fc2.sesgo',
] as const;

/** Tabla de formas exigidas por la arquitectura para unas dimensiones dadas. */
export function tablaArquitectura(arq: ArquitecturaLBA): Map<string, readonly number[]> {
  const { alto, ancho } = arq.entrada;
  const a = arq.acciones;
  const AW = alto * ancho;
  return new Map<string, readonly number[]>([
    ['conv1.peso', [32, 2, 3, 3]],
    ['conv1.sesgo', [32]],
    ['conv2.peso', [32, 32, 3, 3]],
    ['conv2.sesgo', [32]],
    ['politica.conv.peso', [4, 32, 1, 1]],
    ['politica.conv.sesgo', [4]],
    ['politica.fc.peso', [a, 4 * AW]],
    ['politica.fc.sesgo', [a]],
    ['valor.conv.peso', [2, 32, 1, 1]],
    ['valor.conv.sesgo', [2]],
    ['valor.fc1.peso', [16, 2 * AW]],
    ['valor.fc1.sesgo', [16]],
    ['valor.fc2.peso', [1, 16]],
    ['valor.fc2.sesgo', [1]],
  ]);
}

/** Cuenta de parámetros declarada (informativa; coincide con el manifiesto). */
export function contarParametros(arq: ArquitecturaLBA): number {
  let total = 0;
  for (const forma of tablaArquitectura(arq).values()) {
    total += forma.reduce((a, b) => a * b, 1);
  }
  return total;
}

/** Extrae los pesos desde tensores safetensors ya leídos (nombres canónicos). */
export function cargarPesos(tensores: ReadonlyMap<string, TensorLeido>): PesosRed {
  const falta = NOMBRE_TENSORES.filter((n) => !tensores.has(n));
  if (falta.length > 0) {
    throw new Error(`faltan tensores: ${falta.join(', ')}`);
  }
  return {
    conv1Peso: tensores.get('conv1.peso')!.datos,
    conv1Sesgo: tensores.get('conv1.sesgo')!.datos,
    conv2Peso: tensores.get('conv2.peso')!.datos,
    conv2Sesgo: tensores.get('conv2.sesgo')!.datos,
    polConvPeso: tensores.get('politica.conv.peso')!.datos,
    polConvSesgo: tensores.get('politica.conv.sesgo')!.datos,
    polFcPeso: tensores.get('politica.fc.peso')!.datos,
    polFcSesgo: tensores.get('politica.fc.sesgo')!.datos,
    valConvPeso: tensores.get('valor.conv.peso')!.datos,
    valConvSesgo: tensores.get('valor.conv.sesgo')!.datos,
    valFc1Peso: tensores.get('valor.fc1.peso')!.datos,
    valFc1Sesgo: tensores.get('valor.fc1.sesgo')!.datos,
    valFc2Peso: tensores.get('valor.fc2.peso')!.datos,
    valFc2Sesgo: tensores.get('valor.fc2.sesgo')!.datos,
  };
}

function relu(x: number): number {
  return x > 0 ? x : 0;
}

/**
 * Convolución 3×3 con padding 1 (mismo tamaño de salida), NCHW.
 * `peso` tiene forma [salidas, entradas, 3, 3]; la suma respeta el orden
 * natural (fila, columna, canal de entrada) — documentado para la paridad.
 */
function conv3x3(
  entrada: Float32Array, // [canales, alto, ancho]
  canales: number,
  alto: number,
  ancho: number,
  peso: Float32Array, // [salidas, canales, 3, 3]
  salidas: number,
  sesgo: Float32Array | null, // [salidas]
  destino: Float32Array, // [salidas, alto, ancho] (ya con ReLU aplicada)
): void {
  for (let s = 0; s < salidas; s++) {
    const baseS = s * canales * 9;
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        let acumulado = sesgo !== null ? sesgo[s]! : 0;
        for (let c = 0; c < canales; c++) {
          const baseW = baseS + c * 9;
          for (let ky = 0; ky < 3; ky++) {
            const fy = y + ky - 1;
            if (fy < 0 || fy >= alto) continue;
            for (let kx = 0; kx < 3; kx++) {
              const fx = x + kx - 1;
              if (fx < 0 || fx >= ancho) continue;
              acumulado += entrada[c * alto * ancho + fy * ancho + fx]! * peso[baseW + ky * 3 + kx]!;
            }
          }
        }
        destino[s * alto * ancho + y * ancho + x] = relu(acumulado);
      }
    }
  }
}

/** Convolución 1×1 (punto a punto) + ReLU. */
function conv1x1(
  entrada: Float32Array, // [canales, alto, ancho]
  canales: number,
  alto: number,
  ancho: number,
  peso: Float32Array, // [salidas, canales, 1, 1]
  salidas: number,
  sesgo: Float32Array | null,
  destino: Float32Array, // [salidas, alto, ancho]
): void {
  for (let s = 0; s < salidas; s++) {
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        let acumulado = sesgo !== null ? sesgo[s]! : 0;
        for (let c = 0; c < canales; c++) {
          acumulado += entrada[c * alto * ancho + y * ancho + x]! * peso[s * canales + c]!;
        }
        destino[s * alto * ancho + y * ancho + x] = relu(acumulado);
      }
    }
  }
}

/** Linear: peso [salidas, entradas] + sesgo [salidas], salida [salidas]. */
function linear(
  entrada: Float32Array,
  peso: Float32Array,
  sesgo: Float32Array,
  salidas: number,
  destino: Float32Array,
  aplicarRelu: boolean,
): void {
  const n = entrada.length;
  for (let s = 0; s < salidas; s++) {
    let acumulado = sesgo[s]!;
    const base = s * n;
    for (let i = 0; i < n; i++) {
      acumulado += entrada[i]! * peso[base + i]!;
    }
    destino[s] = aplicarRelu ? relu(acumulado) : acumulado;
  }
}

/**
 * Pasada hacia delante completa. `entrada` = [2, alto, ancho] F32.
 * Determinista, sin estado interno: segura para Web Workers.
 */
export function adelante(pesos: PesosRed, arq: ArquitecturaLBA, entrada: Float32Array): SalidaRed {
  const { alto, ancho, canales } = arq.entrada;
  const AW = alto * ancho;
  if (entrada.length !== canales * AW) {
    throw new Error(`entrada de ${entrada.length} valores, esperados ${canales * AW}`);
  }
  const conv1 = new Float32Array(32 * AW);
  conv3x3(entrada, canales, alto, ancho, pesos.conv1Peso, 32, pesos.conv1Sesgo, conv1);
  const conv2 = new Float32Array(32 * AW);
  conv3x3(conv1, 32, alto, ancho, pesos.conv2Peso, 32, pesos.conv2Sesgo, conv2);

  // Cabeza de política.
  const polConv = new Float32Array(4 * AW);
  conv1x1(conv2, 32, alto, ancho, pesos.polConvPeso, 4, pesos.polConvSesgo, polConv);
  const politica = new Float32Array(arq.acciones);
  linear(polConv, pesos.polFcPeso, pesos.polFcSesgo, arq.acciones, politica, false);

  // Cabeza de valor.
  const valConv = new Float32Array(2 * AW);
  conv1x1(conv2, 32, alto, ancho, pesos.valConvPeso, 2, pesos.valConvSesgo, valConv);
  const valOculta = new Float32Array(16);
  linear(valConv, pesos.valFc1Peso, pesos.valFc1Sesgo, 16, valOculta, true);
  const valSalida = new Float32Array(1);
  linear(valOculta, pesos.valFc2Peso, pesos.valFc2Sesgo, 1, valSalida, false);
  const valor = Math.tanh(valSalida[0]!);

  return { politica, valor };
}

/**
 * Softmax sobre acciones legales (ilegales excluidas: probabilidad 0).
 * Recibe logits crudos; devuelve probabilidades de longitud `acciones`.
 */
export function softmaxEnmascarado(
  logits: Float32Array,
  legales: ReadonlyArray<number>,
  temperatura = 1,
): Float32Array {
  const prob = new Float32Array(logits.length);
  if (legales.length === 0) return prob;
  let maximo = -Infinity;
  for (const a of legales) {
    const v = logits[a]! / temperatura;
    if (v > maximo) maximo = v;
  }
  let suma = 0;
  for (const a of legales) {
    const e = Math.exp(logits[a]! / temperatura - maximo);
    prob[a] = e;
    suma += e;
  }
  for (const a of legales) {
    prob[a] = prob[a]! / suma;
  }
  return prob;
}
