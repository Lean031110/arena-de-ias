/**
 * Versión del motor central vendorizado en este prototipo.
 *
 * Único archivo de esta carpeta que pertenece al prototipo (junto a
 * PROCEDENCIA.md). Sirve para mostrar en la interfaz la procedencia
 * exacta del motor que ejecuta las partidas locales.
 */

export const MOTOR_ORIGEN = {
  repositorio: 'https://github.com/Lean031110/arena-de-ias',
  commit: 'a908319',
  fechaExtraccion: '2026-10-18',
  rutaOrigen: 'src/dominio/',
  modo: 'local-vendorizado' as const,
  descripcion:
    'Reglas y agentes reales del núcleo ejecutándose en el navegador; sin conexión al registro experimental central.',
} as const;
