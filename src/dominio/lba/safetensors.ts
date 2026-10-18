/**
 * SafeTensors (.safetensors) — análisis y escritura mínimos para .lba v1.
 *
 * Formato público de referencia: 8 bytes little-endian u64 con la longitud de
 * la cabecera, cabecera JSON {nombre: {dtype, shape, data_offsets}} y región
 * de datos. Restricciones .lba v1: dtype F32 exclusivamente, offsets
 * crecientes, sin solapamientos y dentro de la región (huecos permitidos,
 * aunque el exportador no los genera). Nunca se ejecita código: es un formato
 * de datos puro (sin pickle).
 */

import { ErrorDatosInvalidos } from '../motor/errores';
import { RechazoLBA } from './errores';

export interface TensorLeido {
  readonly nombre: string;
  readonly forma: readonly number[];
  readonly datos: Float32Array;
}

export interface EstructuraSafeTensors {
  readonly tensores: readonly { nombre: string; forma: readonly number[]; bytes: number }[];
  readonly bytesDatos: number;
}

function leerU64LE(bytes: Uint8Array, offset: number): number {
  let valor = 0;
  for (let i = 7; i >= 0; i--) {
    valor = valor * 256 + (bytes[offset + i] ?? 0);
  }
  return valor;
}

function escribirU64LE(valor: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let resto = valor;
  for (let i = 0; i < 8; i++) {
    bytes[i] = resto % 256;
    resto = Math.floor(resto / 256);
  }
  return bytes;
}

/**
 * Analiza la cabecera SIN materializar los tensores: para validación de
 * estructura (bombas de descompresión se controlan antes, en el contenedor).
 * @throws ErrorDatosInvalidos si el archivo no es SafeTensors válido.
 */
export function analizarEstructura(bytes: Uint8Array): EstructuraSafeTensors {
  const LIMITE_CABECERA = 1_048_576; // 1 MiB (docs/LBA-MODELO.md §2)
  if (bytes.length < 12) {
    throw new ErrorDatosInvalidos('safetensors demasiado corto para contener cabecera');
  }
  const longitudCabecera = leerU64LE(bytes, 0);
  if (longitudCabecera <= 0 || longitudCabecera > LIMITE_CABECERA) {
    throw new ErrorDatosInvalidos(`longitud de cabecera safetensors fuera de rango (${longitudCabecera})`);
  }
  const finCabecera = 8 + longitudCabecera;
  if (bytes.length < finCabecera) {
    throw new ErrorDatosInvalidos('safetensors truncado: la cabecera excede el archivo');
  }
  const textoCabecera = new TextDecoder().decode(bytes.subarray(8, finCabecera));
  let cabecera: Record<string, unknown>;
  try {
    cabecera = JSON.parse(textoCabecera) as Record<string, unknown>;
  } catch {
    throw new ErrorDatosInvalidos('cabecera safetensors no es JSON válido');
  }

  const bytesDatos = bytes.length - finCabecera;
  const tensores: { nombre: string; forma: readonly number[]; bytes: number }[] = [];
  let anteriorFin = -1;

  for (const [nombre, definicion] of Object.entries(cabecera)) {
    if (typeof definicion !== 'object' || definicion === null) {
      throw new ErrorDatosInvalidos(`tensor «${nombre}»: definición inválida`);
    }
    const def = definicion as Record<string, unknown>;
    if (def.dtype !== 'F32') {
      throw new ErrorDatosInvalidos(
        `tensor «${nombre}»: dtype «${String(def.dtype)}» no soportado en .lba v1 (solo F32)`,
      );
    }
    const forma = def.shape;
    if (!Array.isArray(forma) || forma.some((d) => !Number.isInteger(d) || d < 0)) {
      throw new ErrorDatosInvalidos(`tensor «${nombre}»: forma inválida`);
    }
    const offsets = def.data_offsets;
    if (
      !Array.isArray(offsets) ||
      offsets.length !== 2 ||
      !offsets.every((o) => Number.isInteger(o) && (o as number) >= 0)
    ) {
      throw new ErrorDatosInvalidos(`tensor «${nombre}»: data_offsets inválidos`);
    }
    const [inicio, fin] = offsets as [number, number];
    if (inicio >= fin || fin > bytesDatos) {
      throw new ErrorDatosInvalidos(
        `tensor «${nombre}»: offsets [${inicio}, ${fin}) fuera de la región de datos (${bytesDatos} bytes)`,
      );
    }
    if (inicio < anteriorFin) {
      throw new ErrorDatosInvalidos(`tensor «${nombre}»: solapa con el tensor anterior`);
    }
    const elementos = (forma as number[]).reduce((a, b) => a * b, 1);
    if (fin - inicio !== elementos * 4) {
      throw new ErrorDatosInvalidos(
        `tensor «${nombre}»: ${elementos} elementos F32 requieren ${elementos * 4} bytes, la región declara ${fin - inicio}`,
      );
    }
    anteriorFin = fin;
    tensores.push({ nombre, forma: forma as number[], bytes: fin - inicio });
  }

  return { tensores, bytesDatos };
}

/** Lee todos los tensores como Float32Array (vistas copiadas, little-endian). */
export function leerTensores(bytes: Uint8Array): Map<string, TensorLeido> {
  const estructura = analizarEstructura(bytes);
  const finCabecera = bytes.length - estructura.bytesDatos;
  const salida = new Map<string, TensorLeido>();
  // Re-parse de la cabecera para offsets (ya validada por analizarEstructura).
  const longitudCabecera = leerU64LE(bytes, 0);
  const cabecera = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + longitudCabecera))) as Record<
    string,
    { shape: number[]; data_offsets: [number, number] }
  >;
  for (const [nombre, def] of Object.entries(cabecera)) {
    const [inicio, fin] = def.data_offsets;
    const vista = new DataView(bytes.buffer, bytes.byteOffset + finCabecera + inicio, fin - inicio);
    const copia = new Float32Array((fin - inicio) / 4);
    for (let i = 0; i < copia.length; i++) {
      copia[i] = vista.getFloat32(i * 4, true); // little-endian estricto
    }
    salida.set(nombre, { nombre, forma: def.shape, datos: copia });
  }
  return salida;
}

/**
 * Escribe un safetensors F32 a partir de tensores con nombre y forma.
 * (Usado por el exportador TS y por las pruebas; Python usa la librería oficial.)
 */
export function escribirTensores(
  tensores: ReadonlyArray<{ nombre: string; forma: readonly number[]; datos: Float32Array }>,
): Uint8Array {
  const cabecera: Record<string, { dtype: 'F32'; shape: number[]; data_offsets: [number, number] }> = {};
  let offset = 0;
  for (const t of tensores) {
    const elementos = t.forma.reduce((a, b) => a * b, 1);
    if (t.datos.length !== elementos) {
      throw new ErrorDatosInvalidos(
        `tensor «${t.nombre}»: ${elementos} elementos declarados, ${t.datos.length} recibidos`,
      );
    }
    cabecera[t.nombre] = { dtype: 'F32', shape: [...t.forma], data_offsets: [offset, offset + elementos * 4] };
    offset += elementos * 4;
  }
  const textoCabecera = JSON.stringify(cabecera);
  const bytesCabecera = new TextEncoder().encode(textoCabecera);
  const total = 8 + bytesCabecera.length + offset;
  const salida = new Uint8Array(total);
  salida.set(escribirU64LE(bytesCabecera.length), 0);
  salida.set(bytesCabecera, 8);
  let posicion = 8 + bytesCabecera.length;
  for (const trozo of tensores) {
    const vista = new DataView(salida.buffer, posicion, trozo.datos.length * 4);
    for (let i = 0; i < trozo.datos.length; i++) {
      vista.setFloat32(i * 4, trozo.datos[i]!, true); // little-endian estricto
    }
    posicion += trozo.datos.length * 4;
  }
  return salida;
}

/**
 * Comprueba que el conjunto de tensores coincide EXACTAMENTE con la tabla de
 * la arquitectura (docs/LBA-MODELO.md §4): ni más, ni menos, ni formas erróneas.
 * @throws RechazoLBA('pesos') si hay cualquier divergencia.
 */
export function comprobarTablaArquitectura(
  estructura: EstructuraSafeTensors,
  tablaEsperada: ReadonlyMap<string, readonly number[]>,
): void {
  const presentes = new Set(estructura.tensores.map((t) => t.nombre));
  for (const [nombre, forma] of tablaEsperada) {
    if (!presentes.has(nombre)) {
      throw new RechazoLBA('pesos', `falta el tensor «${nombre}» exigido por la arquitectura`);
    }
    const real = estructura.tensores.find((t) => t.nombre === nombre)?.forma;
    if (real === undefined || real.length !== forma.length || real.some((d, i) => d !== forma[i])) {
      throw new RechazoLBA(
        'pesos',
        `tensor «${nombre}»: forma [${String(real)}] no coincide con la esperada [${String(forma)}]`,
      );
    }
  }
  for (const nombre of presentes) {
    if (!tablaEsperada.has(nombre)) {
      throw new RechazoLBA('pesos', `tensor «${nombre}» no pertenece a la arquitectura declarada`);
    }
  }
}
