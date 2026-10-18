/**
 * Tipos de la capa de aplicación (adaptadores del dominio al entorno).
 */

import type { Evento } from '../dominio/motor/eventos';

/** Evento tal como llega del almacén (datos desconocidos validados). */
export type RegistroEventoExterno = Omit<Evento, 'datos'> & { datos?: unknown };
