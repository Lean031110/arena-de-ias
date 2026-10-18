import { useMemo } from 'react';
import type { ReactElement } from 'react';
import type { JuegoConcreto, Marca, VistaTablero } from '../../dominio/motor/tipos';
import { letraColumna } from '../../dominio/juegos/ayudantes';

export type EstiloFicha = 'marcas' | 'piedras' | 'discos';

export function estiloFichaPorJuego(juegoId: string): EstiloFicha {
  if (juegoId.startsWith('tres-en-raya')) return 'marcas';
  if (juegoId.startsWith('gomoku')) return 'piedras';
  if (juegoId.startsWith('cuatro-en-raya')) return 'discos';
  return 'marcas';
}

interface PropsTablero {
  juego: JuegoConcreto;
  estadoCodificado: string;
  /** Llamada con el movimiento del dominio al elegir una jugada. */
  onJugada?: (movimiento: unknown) => void;
  /** Celdas jugables (para el turno humano). */
  interactiva?: boolean;
  anuncio?: string;
}

function etiquetaCelda(
  marca: Marca,
  fila: number,
  columna: number,
  estilo: EstiloFicha,
): string {
  const coordenada = `${letraColumna(columna)}${fila + 1}`;
  const contenido =
    marca === 0
      ? 'vacía'
      : estilo === 'marcas'
        ? marca === 1
          ? '✕'
          : '◯'
        : estilo === 'piedras'
          ? marca === 1
            ? 'piedra negra'
            : 'piedra blanca'
          : marca === 1
            ? 'ficha roja'
            : 'ficha amarilla';
  return `Casilla ${coordenada}: ${contenido}`;
}

function Ficha({ marca, estilo }: { marca: Marca; estilo: EstiloFicha }): ReactElement | null {
  if (marca === 0) return null;
  if (estilo === 'marcas') {
    return (
      <span className="marca" aria-hidden="true">
        {marca === 1 ? (
          <svg viewBox="0 0 40 40" fill="none">
            <path
              d="M8 8 L32 32 M32 8 L8 32"
              stroke="var(--ficha-1)"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="13" stroke="var(--ficha-2)" strokeWidth="5.5" />
          </svg>
        )}
      </span>
    );
  }
  if (estilo === 'piedras') {
    return <span className="piedra" data-jugador={marca} aria-hidden="true" />;
  }
  return <span className="disco" data-jugador={marca} aria-hidden="true" />;
}

export function Tablero({ juego, estadoCodificado, onJugada, interactiva, anuncio }: PropsTablero) {
  const { ancho, alto } = juego.dimensiones;
  const estilo = estiloFichaPorJuego(juego.id);

  const { vista, legales } = useMemo(() => {
    const estado = juego.decodificar(estadoCodificado);
    const vistaTablero: VistaTablero = juego.vista(estado);
    const jugables: Set<string> = new Set();
    if (interactiva === true && onJugada !== undefined && !juego.esTerminal(estado)) {
      for (const movimiento of juego.movimientosLegales(estado)) {
        jugables.add(juego.formatearMovimiento(movimiento));
      }
    }
    return { vista: vistaTablero, legales: jugables };
  }, [juego, estadoCodificado, interactiva, onJugada]);

  const celdas: Array<ReactElement> = [];
  for (let fila = 0; fila < alto; fila++) {
    for (let columna = 0; columna < ancho; columna++) {
      const indice = fila * ancho + columna;
      const marca = vista.celdas[indice] ?? 0;
      const coordenada = `${letraColumna(columna)}${fila + 1}`;
      const esLegal = legales.has(juego.familia === 'columna' ? letraColumna(columna) : coordenada);
      const esUltima =
        vista.ultima !== null && vista.ultima.fila === fila && vista.ultima.columna === columna;
      celdas.push(
        <button
          key={coordenada}
          type="button"
          className={`celda${esUltima ? ' celda--ultima' : ''}`}
          disabled={!esLegal}
          aria-label={etiquetaCelda(marca, fila, columna, estilo)}
          onClick={() => {
            if (onJugada === undefined) return;
            if (juego.familia === 'columna') {
              onJugada({ columna });
            } else {
              onJugada({ fila, columna });
            }
          }}
        >
          <Ficha marca={marca} estilo={estilo} />
        </button>,
      );
    }
  }

  const tamañoCelda = `min(calc((100vw - 3.2rem) / ${ancho}), ${ancho > 9 ? 30 : 46}px)`;

  return (
    <div className="zona-tablero">
      <div
        className="tablero"
        data-familia={juego.familia}
        role="grid"
        aria-label={`Tablero de ${juego.nombre}, ${ancho} por ${alto}`}
        style={{
          gridTemplateColumns: `repeat(${ancho}, ${tamañoCelda})`,
        }}
      >
        {celdas}
      </div>
      <p className="vivo" role="status" aria-live="polite">
        {anuncio ?? ''}
      </p>
    </div>
  );
}
