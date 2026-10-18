/**
 * Errores del formato LBA Model Package (.lba) — docs/LBA-MODELO.md.
 * Todos en español y seguros para mostrar en la interfaz.
 */

import { ErrorArena } from '../motor/errores';

/** Cualquier rechazo de validación de un paquete .lba. Nunca se escribe en el registro. */
export class ErrorPaqueteLBA extends ErrorArena {
  constructor(mensaje: string) {
    super(`Paquete .lba rechazado: ${mensaje}`);
    this.name = 'ErrorPaqueteLBA';
  }
}

/** Motivos tipados para estadísticas de importación y diagnósticos de la UI. */
export type MotivoRechazoLBA =
  | 'tamano'
  | 'contenedor'
  | 'entradas'
  | 'manifiesto'
  | 'integridad'
  | 'pesos'
  | 'compatibilidad';

/** Rechazo con motivo clasificado. */
export class RechazoLBA extends ErrorPaqueteLBA {
  readonly motivo: MotivoRechazoLBA;

  constructor(motivo: MotivoRechazoLBA, mensaje: string) {
    super(mensaje);
    this.name = 'RechazoLBA';
    this.motivo = motivo;
  }
}
