/**
 * Estadística experimental: intervalo de confianza de Wilson (score) para
 * proporciones con empates puntuados a medio punto.
 *
 * Método declarado (docs/MODELO_DATOS.md §3): p̂ = (V + E/2)/n;
 * centro = (p̂ + z²/2n)/(1 + z²/n);
 * margen = z/(1 + z²/n) · √(p̂(1−p̂)/n + z²/4n²); límites recortados a [0,1].
 *
 * El intervalo NO es una garantía absoluta (regla de la especificación §14).
 */

export interface IntervaloWilson {
  readonly disponible: boolean;
  readonly inferior: number;
  readonly superior: number;
  readonly n: number;
  readonly puntuacion: number;
}

const Z95 = 1.959963984540054;

export function intervaloWilson(
  victorias: number,
  empates: number,
  partidas: number,
  z: number = Z95,
): IntervaloWilson {
  if (partidas <= 0) {
    return { disponible: false, inferior: 0, superior: 0, n: 0, puntuacion: 0 };
  }
  const puntuacion = (victorias + empates / 2) / partidas;
  const z2 = z * z;
  const denominador = 1 + z2 / partidas;
  const centro = (puntuacion + z2 / (2 * partidas)) / denominador;
  const margen =
    (z / denominador) *
    Math.sqrt((puntuacion * (1 - puntuacion)) / partidas + z2 / (4 * partidas * partidas));
  const inferior = Math.max(0, centro - margen);
  const superior = Math.min(1, centro + margen);
  return {
    disponible: true,
    inferior: redondear(inferior, 6),
    superior: redondear(superior, 6),
    n: partidas,
    puntuacion: redondear(puntuacion, 6),
  };
}

/** Redondeo a `decimales` cifras (para presentación estable). */
export function redondear(valor: number, decimales: number): number {
  const factor = Math.pow(10, decimales);
  return Math.round(valor * factor) / factor;
}

/** Media aritmética de una lista; null si está vacía (dato ausente). */
export function media(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const suma = valores.reduce((acumulado, valor) => acumulado + valor, 0);
  return suma / valores.length;
}
