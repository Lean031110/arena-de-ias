/**
 * Errores tipados del dominio. Todos los mensajes están en español y son
 * comprensibles para mostrarse en la interfaz cuando proceda.
 */

export class ErrorArena extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorArena';
  }
}

/** Movimiento rechazado por las reglas del juego. */
export class ErrorMovimientoIlegal extends ErrorArena {
  readonly movimiento: string;
  readonly motivo: string;

  constructor(movimiento: string, motivo: string) {
    super(`Movimiento ilegal (${movimiento}): ${motivo}`);
    this.name = 'ErrorMovimientoIlegal';
    this.movimiento = movimiento;
    this.motivo = motivo;
  }
}

/** Datos serializados que no cumplen la forma esperada. */
export class ErrorDatosInvalidos extends ErrorArena {
  constructor(mensaje: string) {
    super(`Datos inválidos: ${mensaje}`);
    this.name = 'ErrorDatosInvalidos';
  }
}

/** Configuración de partida/agente/evaluación inválida. */
export class ErrorConfiguracionInvalida extends ErrorArena {
  constructor(mensaje: string) {
    super(`Configuración inválida: ${mensaje}`);
    this.name = 'ErrorConfiguracionInvalida';
  }
}

/** Juego solicitado no registrado o pendiente de implementación. */
export class ErrorJuegoNoDisponible extends ErrorArena {
  constructor(mensaje: string) {
    super(`Juego no disponible: ${mensaje}`);
    this.name = 'ErrorJuegoNoDisponible';
  }
}

/** Fallo de almacenamiento (IndexedDB no disponible, cuota, corrupción…). */
export class ErrorAlmacenaje extends ErrorArena {
  constructor(mensaje: string, readonly causa?: unknown) {
    super(`Error de almacenamiento: ${mensaje}`);
    this.name = 'ErrorAlmacenaje';
    this.causa = causa;
  }
}

/** Presupuesto de cómputo agotado (solucionador). */
export class ErrorPresupuesto extends ErrorArena {
  constructor(mensaje: string) {
    super(`Presupuesto agotado: ${mensaje}`);
    this.name = 'ErrorPresupuesto';
  }
}
