/**
 * Cuatro en raya (Connect 4) con gravedad por columna.
 * Representación propia: celdas (fila 0 = fondo) + altura por columna,
 * adecuada para la legalidad por gravedad (no se fuerza la estructura de
 * otros juegos, según exigencia de la especificación).
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
  hayLineaDesde,
  indiceCelda,
  leerCelda,
  letraColumna,
  numeroDeLetra,
  puntuarVentanas,
} from './ayudantes';

export interface EstadoCuatro {
  readonly celdas: readonly Marca[];
  readonly alturas: readonly number[];
  readonly turno: Jugador;
  readonly ultima: Coordenada | null;
}

export type MovimientoColumna = { readonly columna: number };

export interface ConfigCuatroEnRaya {
  readonly id: string;
  readonly ancho: number;
  readonly alto: number;
  readonly nombre: string;
  readonly descripcion: string;
  readonly posiciones: readonly PosicionPrueba[];
}

function marcaDe(jugador: Jugador): Marca {
  return jugador as Marca;
}

function jugadorAnterior(estado: EstadoCuatro): Jugador {
  return otroJugador(estado.turno);
}

function buscarGanador(estado: EstadoCuatro, ancho: number, alto: number): Jugador | null {
  if (estado.ultima === null) return null;
  const candidato = jugadorAnterior(estado);
  const hay = hayLineaDesde(
    estado.celdas,
    ancho,
    alto,
    estado.ultima.fila,
    estado.ultima.columna,
    marcaDe(candidato),
    4,
  );
  return hay ? candidato : null;
}

function tableroLleno(estado: EstadoCuatro, alto: number): boolean {
  return estado.alturas.every((altura) => altura >= alto);
}

function totalFichas(estado: EstadoCuatro): number {
  return estado.alturas.reduce((suma, altura) => suma + altura, 0);
}

function decodificarEstado(datos: string, ancho: number, alto: number): EstadoCuatro {
  let crudo: unknown;
  try {
    crudo = JSON.parse(datos);
  } catch {
    throw new ErrorDatosInvalidos('JSON malformado en estado de cuatro en raya');
  }
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    throw new ErrorDatosInvalidos('el estado debe ser un objeto');
  }
  const objeto = crudo as Record<string, unknown>;
  const celdasCrudas = objeto['celdas'];
  if (!Array.isArray(celdasCrudas) || celdasCrudas.length !== ancho * alto) {
    throw new ErrorDatosInvalidos(`celdas debe tener ${ancho * alto} elementos`);
  }
  const celdas = celdasCrudas.map((valor, indice): Marca => {
    if (valor !== 0 && valor !== 1 && valor !== 2) {
      throw new ErrorDatosInvalidos(`celda ${indice} inválida (${String(valor)})`);
    }
    return valor as Marca;
  });
  const alturasCrudas = objeto['alturas'];
  if (!Array.isArray(alturasCrudas) || alturasCrudas.length !== ancho) {
    throw new ErrorDatosInvalidos(`alturas debe tener ${ancho} elementos`);
  }
  const alturas = alturasCrudas.map((valor, indice): number => {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > alto) {
      throw new ErrorDatosInvalidos(`altura ${indice} inválida (${String(valor)})`);
    }
    return valor;
  });
  const turno = objeto['turno'];
  if (turno !== 1 && turno !== 2) {
    throw new ErrorDatosInvalidos('turno debe ser 1 o 2');
  }
  // Coherencia: cada columna debe estar llena desde el fondo, sin huecos.
  for (let columna = 0; columna < ancho; columna++) {
    const altura = alturas[columna] ?? 0;
    for (let fila = 0; fila < alto; fila++) {
      const valor = leerCelda(celdas, ancho, fila, columna);
      const ocupada = valor !== 0;
      if (fila < altura && !ocupada) {
        throw new ErrorDatosInvalidos(`hueco bajo la altura de la columna ${columna}`);
      }
      if (fila >= altura && ocupada) {
        throw new ErrorDatosInvalidos(`ficha por encima de la altura de la columna ${columna}`);
      }
    }
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
    if (
      typeof fila !== 'number' || typeof columna !== 'number' ||
      !Number.isInteger(fila) || !Number.isInteger(columna) ||
      fila < 0 || fila >= alto || columna < 0 || columna >= ancho
    ) {
      throw new ErrorDatosInvalidos('ultima fuera del tablero');
    }
    if (leerCelda(celdas, ancho, fila, columna) === 0) {
      throw new ErrorDatosInvalidos('ultima señala una celda vacía');
    }
    ultima = { fila, columna };
  }
  return { celdas, alturas, turno, ultima };
}

export function crearJuegoCuatroEnRaya(
  config: ConfigCuatroEnRaya,
): Juego<EstadoCuatro, MovimientoColumna> {
  const ancho = config.ancho;
  const alto = config.alto;
  const dimensiones: Dimensiones = { ancho, alto };
  const simetrias: readonly Simetria[] = [
    { id: 'identidad', descripcion: 'identidad' },
    { id: 'espejo-columnas', descripcion: 'espejo horizontal de columnas' },
  ];

  const validar = (
    estado: EstadoCuatro,
    movimiento: MovimientoColumna,
  ): { valido: boolean; motivo?: string } => {
    if (!Number.isInteger(movimiento.columna) || movimiento.columna < 0 || movimiento.columna >= ancho) {
      return { valido: false, motivo: 'columna fuera del tablero' };
    }
    if ((estado.alturas[movimiento.columna] ?? 0) >= alto) {
      return { valido: false, motivo: 'la columna está llena' };
    }
    return { valido: true };
  };

  const aplicarComo = (
    estado: EstadoCuatro,
    movimiento: MovimientoColumna,
    jugador: Jugador,
  ): EstadoCuatro => {
    const comprobacion = validar(estado, movimiento);
    if (!comprobacion.valido) {
      throw new ErrorMovimientoIlegal(
        letraColumna(movimiento.columna),
        comprobacion.motivo ?? 'movimiento ilegal',
      );
    }
    const columna = movimiento.columna;
    const fila = estado.alturas[columna] ?? 0;
    const celdas = [...estado.celdas];
    celdas[indiceCelda(fila, columna, ancho)] = marcaDe(jugador);
    const alturas = [...estado.alturas];
    alturas[columna] = fila + 1;
    return { celdas, alturas, turno: otroJugador(jugador), ultima: { fila, columna } };
  };

  return {
    id: config.id,
    reglasVersion: '1',
    nombre: config.nombre,
    descripcion: config.descripcion,
    dimensiones,
    familia: 'columna',

    crearEstadoInicial: (): EstadoCuatro => ({
      celdas: new Array<Marca>(ancho * alto).fill(0),
      alturas: new Array<number>(ancho).fill(0),
      turno: 1,
      ultima: null,
    }),

    jugadorActual: (estado) => estado.turno,

    movimientosLegales: (estado): readonly MovimientoColumna[] => {
      const legales: MovimientoColumna[] = [];
      for (let columna = 0; columna < ancho; columna++) {
        if ((estado.alturas[columna] ?? 0) < alto) {
          legales.push({ columna });
        }
      }
      return legales;
    },

    validarMovimiento: validar,

    aplicarMovimiento: (estado, movimiento) => aplicarComo(estado, movimiento, estado.turno),

    simularMovimiento: (estado, movimiento, jugador) => aplicarComo(estado, movimiento, jugador),

    esTerminal: (estado) => buscarGanador(estado, ancho, alto) !== null || tableroLleno(estado, alto),

    resultado: (estado): ResultadoTerminal | null => {
      const ganador = buscarGanador(estado, ancho, alto);
      if (ganador !== null) return { tipo: 'victoria', ganador };
      if (tableroLleno(estado, alto)) return { tipo: 'empate' };
      return null;
    },

    evaluar: (estado, jugador) => {
      const bruto = puntuarVentanas(estado.celdas, ancho, alto, 4, marcaDe(jugador));
      return Math.tanh(bruto / 200);
    },

    codificar: (estado) =>
      JSON.stringify({
        celdas: estado.celdas,
        alturas: estado.alturas,
        turno: estado.turno,
        ultima: estado.ultima,
      }),

    decodificar: (datos) => decodificarEstado(datos, ancho, alto),

    claveEstado: (estado) => `${estado.turno}:${estado.celdas.join('')}`,

    simetrias,

    aplicarSimetria: (estado, indiceSimetria) => {
      if (indiceSimetria === 0) return estado;
      const celdas = new Array<Marca>(ancho * alto).fill(0);
      const alturas = new Array<number>(ancho).fill(0);
      for (let columna = 0; columna < ancho; columna++) {
        const columnaReflejada = ancho - 1 - columna;
        alturas[columnaReflejada] = estado.alturas[columna] ?? 0;
        for (let fila = 0; fila < alto; fila++) {
          celdas[indiceCelda(fila, columnaReflejada, ancho)] = leerCelda(estado.celdas, ancho, fila, columna);
        }
      }
      let ultima: Coordenada | null = null;
      if (estado.ultima !== null) {
        ultima = { fila: estado.ultima.fila, columna: ancho - 1 - estado.ultima.columna };
      }
      return { celdas, alturas, turno: estado.turno, ultima };
    },

    aplicarSimetriaAMovimiento: (movimiento, indiceSimetria) =>
      indiceSimetria === 0
        ? movimiento
        : { columna: ancho - 1 - movimiento.columna },

    formatearMovimiento: (movimiento) => letraColumna(movimiento.columna),

    analizarMovimiento: (texto): MovimientoColumna | null => {
      const coincidencia = /^([a-p])$/.exec(texto.trim().toLowerCase());
      if (coincidencia === null) return null;
      const columna = numeroDeLetra(coincidencia[1] ?? '');
      if (columna === null || columna >= ancho) return null;
      return { columna };
    },

    vista: (estado): VistaTablero => ({
      celdas: estado.celdas,
      turno: estado.turno,
      ultima: estado.ultima,
    }),

    posicionesPrueba: () => config.posiciones,
  };
}

/** Total de fichas de un estado (para pruebas y registros). */
export function contarFichas(estado: EstadoCuatro): number {
  return totalFichas(estado);
}
