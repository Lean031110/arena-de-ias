/**
 * Huella de integridad FNV-1a de 32 bits (ADR-005).
 *
 * Garantías y limitaciones (docs/MODELO_DATOS.md §7):
 * - Detecta corrupción accidental con probabilidad 1 − 2⁻³².
 * - NO es criptográfica, NO prueba que el evento ocurrió, NI su autoría.
 * - Se calcula sobre el núcleo determinista, con orden de claves estable.
 */

/** FNV-1a de 32 bits sobre texto, en hexadecimal de 8 dígitos. */
export function huellaFNV(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Serialización canónica: claves de objeto ordenadas recursivamente. */
export function establecerJSON(valor: unknown): string {
  if (valor === undefined || valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor ?? null) ?? 'null';
  }
  if (Array.isArray(valor)) {
    const partes = valor.map((elemento) =>
      elemento === undefined ? 'null' : establecerJSON(elemento),
    );
    return '[' + partes.join(',') + ']';
  }
  const registro = valor as Record<string, unknown>;
  const claves = Object.keys(registro)
    .filter((clave) => registro[clave] !== undefined)
    .sort();
  const partes = claves.map(
    (clave) => JSON.stringify(clave) + ':' + establecerJSON(registro[clave]),
  );
  return '{' + partes.join(',') + '}';
}

/** Huella sobre la serialización canónica de un valor estructurado. */
export function huellaJSON(valor: unknown): string {
  return huellaFNV(establecerJSON(valor));
}
