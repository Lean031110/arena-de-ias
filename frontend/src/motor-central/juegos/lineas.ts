/**
 * Fábrica de juegos de colocación con victoria por línea (tres en raya y
 * gomoku estilo libre). La representación (celdas planas + última jugada)
 * es adecuada para toda la familia: el cálculo de líneas se hace solo a
 * través de la última jugada y la evaluación por ventanas.
 */

import type {
  Coordenada,
  Dimensiones,
  Juego,
  Jugador,
  Marca,
  PosicionPrueba,
  ResultadoTerminal,
  Simetria,
  VistaTablero,
} from '../motor/tipos';
import { otroJugador } from '../motor/tipos';
import { ErrorDatosInvalidos, ErrorMovimientoIlegal } from '../motor/errores';
import {
  analizarNotacionCelda,
  dentroDeTablero,
  hayLineaDesde,
  indiceCelda,
  leerCelda,
  letraColumna,

  puntuarVentanas,
  simetriasD4,
  transformarCeldas,
} from './ayudantes';

export interface EstadoLineas {
  readonly celdas: readonly Marca[];
  readonly turno: Jugador;
  readonly jugadas: number;
  readonly ultima: Coordenada | null;
}

export type MovimientoCelda = Coordenada;

export interface ConfigJuegoLineas {
  readonly id: string;
  readonly tam: number;
  readonly objetivo: number;
  readonly nombre: string;
  readonly descripcion: string;
  readonly estiloFicha: 'marcas' | 'piedras';
  readonly posiciones: readonly PosicionPrueba[];
}

function marcaDe(jugador: Jugador): Marca {
  return jugador as Marca;
}

/** Jugador que acaba de mover (= ganador potencial del estado actual). */
function jugadorAnterior(estado: EstadoLineas): Jugador {
  return otroJugador(estado.turno);
}

/** Busca el ganador a partir de la última jugada; si el estado fue
 * construido sin `ultima` (posiciones de prueba), escanea el tablero. */
function buscarGanador(estado: EstadoLineas, tam: number, objetivo: number): Jugador | null {
  if (estado.ultima !== null) {
    const candidato = jugadorAnterior(estado);
    return hayLineaDesde(
      estado.celdas,
      tam,
      tam,
      estado.ultima.fila,
      estado.ultima.columna,
      marcaDe(candidato),
      objetivo,
    )
      ? candidato
      : null;
  }
  if (estado.jugadas === 0) return null;
  // Posición construida sin última jugada: escaneo completo (más costoso,
  // solo ocurre en posiciones de prueba, nunca en partidas reales).
  for (const jugador of [1, 2] as const) {
    for (let fila = 0; fila < tam; fila++) {
      for (let columna = 0; columna < tam; columna++) {
        if (leerCelda(estado.celdas, tam, fila, columna) !== marcaDe(jugador)) continue;
        if (hayLineaDesde(estado.celdas, tam, tam, fila, columna, marcaDe(jugador), objetivo)) {
          return jugador;
        }
      }
    }
  }
  return null;
}

function tableroLleno(estado: EstadoLineas, tam: number): boolean {
  return estado.jugadas === tam * tam;
}

function decodificarEstado(
  datos: string,
  tam: number,
): EstadoLineas {
  let crudo: unknown;
  try {
    crudo = JSON.parse(datos);
  } catch {
    throw new ErrorDatosInvalidos('JSON malformado en estado de juego de líneas');
  }
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    throw new ErrorDatosInvalidos('el estado debe ser un objeto');
  }
  const objeto = crudo as Record<string, unknown>;
  const celdasCrudas = objeto['celdas'];
  if (!Array.isArray(celdasCrudas) || celdasCrudas.length !== tam * tam) {
    throw new ErrorDatosInvalidos(`celdas debe ser un array de ${tam * tam} elementos`);
  }
  const celdas = celdasCrudas.map((valor, indice): Marca => {
    if (valor !== 0 && valor !== 1 && valor !== 2) {
      throw new ErrorDatosInvalidos(`celda ${indice} con valor inválido (${String(valor)})`);
    }
    return valor as Marca;
  });
  const turno = objeto['turno'];
  if (turno !== 1 && turno !== 2) {
    throw new ErrorDatosInvalidos('turno debe ser 1 o 2');
  }
  const jugadas = objeto['jugadas'];
  if (typeof jugadas !== 'number' || !Number.isInteger(jugadas) || jugadas < 0 || jugadas > tam * tam) {
    throw new ErrorDatosInvalidos('jugadas debe ser un entero en [0, tam²]');
  }
  const ocupadas = celdas.filter((marca) => marca !== 0).length;
  if (jugadas !== ocupadas) {
    throw new ErrorDatosInvalidos(
      `jugadas (${jugadas}) no coincide con las celdas ocupadas (${ocupadas})`,
    );
  }
  const ultimaCruda = objeto['ultima'];
  let ultima: Coordenada | null = null;
  if (ultimaCruda !== null && ultimaCruda !== undefined) {
    if (typeof ultimaCruda !== 'object' || Array.isArray(ultimaCruda)) {
      throw new ErrorDatosInvalidos('ultima debe ser null o {fila, columna}');
    }
    const u = ultimaCruda as Record<string, unknown>;
    const fila = u['fila'];
    const columna = u['columna'];
    if (typeof fila !== 'number' || typeof columna !== 'number' || !Number.isInteger(fila) || !Number.isInteger(columna)) {
      throw new ErrorDatosInvalidos('ultima.fila y ultima.columna deben ser enteros');
    }
    if (!dentroDeTablero(fila, columna, tam, tam)) {
      throw new ErrorDatosInvalidos('ultima fuera del tablero');
    }
    if (leerCelda(celdas, tam, fila, columna) === 0) {
      throw new ErrorDatosInvalidos('ultima señala una celda vacía');
    }
    ultima = { fila, columna };
  }
  return { celdas, turno, jugadas, ultima };
}

export function crearJuegoLineas(config: ConfigJuegoLineas): Juego<EstadoLineas, MovimientoCelda> {
  const tam = config.tam;
  const objetivo = config.objetivo;
  const transforms = simetriasD4(tam);
  const simetrias: readonly Simetria[] = transforms.map((t) => ({ id: t.id, descripcion: t.descripcion }));
  const dimensiones: Dimensiones = { ancho: tam, alto: tam };
  const divisorEvaluacion = Math.pow(8, Math.max(1, objetivo - 2));

  const validar = (estado: EstadoLineas, movimiento: MovimientoCelda): { valido: boolean; motivo?: string } => {
    if (!dentroDeTablero(movimiento.fila, movimiento.columna, tam, tam)) {
      return { valido: false, motivo: 'coordenadas fuera del tablero' };
    }
    if (leerCelda(estado.celdas, tam, movimiento.fila, movimiento.columna) !== 0) {
      return { valido: false, motivo: 'la celda ya está ocupada' };
    }
    return { valido: true };
  };

  const aplicarComo = (estado: EstadoLineas, movimiento: MovimientoCelda, jugador: Jugador): EstadoLineas => {
    const comprobacion = validar(estado, movimiento);
    if (!comprobacion.valido) {
      throw new ErrorMovimientoIlegal(
        `${letraColumna(movimiento.columna)}${movimiento.fila + 1}`,
        comprobacion.motivo ?? 'movimiento ilegal',
      );
    }
    const celdas = [...estado.celdas];
    celdas[indiceCelda(movimiento.fila, movimiento.columna, tam)] = marcaDe(jugador);
    return {
      celdas,
      turno: otroJugador(jugador),
      jugadas: estado.jugadas + 1,
      ultima: { fila: movimiento.fila, columna: movimiento.columna },
    };
  };

  return {
    id: config.id,
    reglasVersion: '1',
    nombre: config.nombre,
    descripcion: config.descripcion,
    dimensiones,
    familia: 'celda',

    crearEstadoInicial: (): EstadoLineas => ({
      celdas: new Array<Marca>(tam * tam).fill(0),
      turno: 1,
      jugadas: 0,
      ultima: null,
    }),

    jugadorActual: (estado) => estado.turno,

    movimientosLegales: (estado): readonly MovimientoCelda[] => {
      const legales: MovimientoCelda[] = [];
      for (let fila = 0; fila < tam; fila++) {
        for (let columna = 0; columna < tam; columna++) {
          if (leerCelda(estado.celdas, tam, fila, columna) === 0) {
            legales.push({ fila, columna });
          }
        }
      }
      return legales;
    },

    validarMovimiento: validar,

    aplicarMovimiento: (estado, movimiento) => aplicarComo(estado, movimiento, estado.turno),

    simularMovimiento: (estado, movimiento, jugador) => aplicarComo(estado, movimiento, jugador),

    esTerminal: (estado) => buscarGanador(estado, tam, objetivo) !== null || tableroLleno(estado, tam),

    resultado: (estado): ResultadoTerminal | null => {
      const ganador = buscarGanador(estado, tam, objetivo);
      if (ganador !== null) {
        return { tipo: 'victoria', ganador };
      }
      if (tableroLleno(estado, tam)) {
        return { tipo: 'empate' };
      }
      return null;
    },

    evaluar: (estado, jugador) => {
      const bruto = puntuarVentanas(estado.celdas, tam, tam, objetivo, marcaDe(jugador));
      return Math.tanh(bruto / divisorEvaluacion);
    },

    codificar: (estado) =>
      JSON.stringify({
        celdas: estado.celdas,
        turno: estado.turno,
        jugadas: estado.jugadas,
        ultima: estado.ultima,
      }),

    decodificar: (datos) => decodificarEstado(datos, tam),

    claveEstado: (estado) => `${estado.turno}:${estado.celdas.join('')}`,

    simetrias,

    aplicarSimetria: (estado, indiceSimetria) => {
      const transformacion = transforms[indiceSimetria];
      if (transformacion === undefined) {
        throw new ErrorDatosInvalidos(`índice de simetría ${indiceSimetria} fuera de rango`);
      }
      const celdas = transformarCeldas(estado.celdas, tam, tam, transformacion);
      let ultima: Coordenada | null = null;
      if (estado.ultima !== null) {
        const destino = transformacion.aplicar(estado.ultima.fila, estado.ultima.columna);
        ultima = { fila: destino.fila, columna: destino.columna };
      }
      return { celdas, turno: estado.turno, jugadas: estado.jugadas, ultima };
    },

    aplicarSimetriaAMovimiento: (movimiento, indiceSimetria) => {
      const transformacion = transforms[indiceSimetria];
      if (transformacion === undefined) {
        throw new ErrorDatosInvalidos(`índice de simetría ${indiceSimetria} fuera de rango`);
      }
      const destino = transformacion.aplicar(movimiento.fila, movimiento.columna);
      return { fila: destino.fila, columna: destino.columna };
    },

    formatearMovimiento: (movimiento) =>
      `${letraColumna(movimiento.columna)}${movimiento.fila + 1}`,

    analizarMovimiento: (texto): MovimientoCelda | null =>
      analizarNotacionCelda(texto, tam, tam),

    vista: (estado): VistaTablero => ({
      celdas: estado.celdas,
      turno: estado.turno,
      ultima: estado.ultima,
    }),

    posicionesPrueba: () => config.posiciones,
  };
}

/**
 * Construye un estado de juego de líneas reproduciendo una secuencia de
 * notaciones (ayuda para posiciones de prueba, sin necesitar la instancia
 * del juego). Lanza ErrorMovimientoIlegal ante una jugada inválida.
 */
export function estadoDesdeSecuencia(
  tam: number,
  secuencia: readonly string[],
): EstadoLineas {
  let estado: EstadoLineas = {
    celdas: new Array<Marca>(tam * tam).fill(0),
    turno: 1,
    jugadas: 0,
    ultima: null,
  };
  for (const notacion of secuencia) {
    const movimiento = analizarNotacionCelda(notacion, tam, tam);
    if (movimiento === null) {
      throw new ErrorMovimientoIlegal(notacion, 'notación no reconocida');
    }
    const indice = indiceCelda(movimiento.fila, movimiento.columna, tam);
    if (estado.celdas[indice] !== 0) {
      throw new ErrorMovimientoIlegal(notacion, 'la celda ya está ocupada');
    }
    const celdas = [...estado.celdas];
    celdas[indice] = estado.turno;
    estado = {
      celdas,
      turno: otroJugador(estado.turno),
      jugadas: estado.jugadas + 1,
      ultima: { fila: movimiento.fila, columna: movimiento.columna },
    };
  }
  return estado;
}

/** Codifica un EstadoLineas sin necesitar la instancia del juego. */
export function codificarEstadoLineas(estado: EstadoLineas): string {
  return JSON.stringify({
    celdas: estado.celdas,
    turno: estado.turno,
    jugadas: estado.jugadas,
    ultima: estado.ultima,
  });
}
