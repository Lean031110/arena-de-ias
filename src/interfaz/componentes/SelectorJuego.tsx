import { CATALOGO_JUEGOS, juegosImplementados } from '../../dominio/juegos/registro';

interface PropsSelectorJuego {
  valor: string;
  onCambio: (juegoId: string) => void;
}

export function SelectorJuego({ valor, onCambio }: PropsSelectorJuego) {
  return (
    <div className="campo">
      <span className="campo__etiqueta">Juego</span>
      <div className="tarjetas-juego" role="radiogroup" aria-label="Selección de juego">
        {juegosImplementados().map((entrada) => {
          const juego = entrada.juego;
          if (juego === undefined) return null;
          const activo = entrada.id === valor;
          return (
            <button
              key={entrada.id}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-pressed={activo}
              className="tarjeta-juego"
              onClick={() => onCambio(entrada.id)}
            >
              <span className="tarjeta-juego__nombre">{juego.nombre}</span>
              <span className="tarjeta-juego__detalle">
                {juego.dimensiones.ancho}×{juego.dimensiones.alto}
              </span>
            </button>
          );
        })}
      </div>
      <p className="parametro__etiqueta" style={{ marginTop: '0.5rem' }}>
        {CATALOGO_JUEGOS.length - juegosImplementados().length} variantes adicionales están
        catalogadas como pendientes (Fase 5): Othello 4×4/6×6/8×8, damas reducida, Hex 5×5,
        Breakthrough 5×5, ajedrez 5×5/6×6 y cuatro en raya 8×7.
      </p>
    </div>
  );
}
