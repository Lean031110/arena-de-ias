/**
 * SHA-256 vía Web Crypto (disponible en navegadores y en Node ≥ 20 como
 * global): misma función para app, trabajador, pruebas y scripts.
 */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  const vista = new Uint8Array(digest);
  let hex = '';
  for (const byte of vista) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** SHA-256 de un texto UTF-8. */
export async function sha256Texto(texto: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(texto));
}
