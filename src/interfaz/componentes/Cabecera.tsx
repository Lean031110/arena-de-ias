import type { Tema } from '../ganchos/useTema';

interface PropsCabecera {
  tema: Tema;
  onAlternarTema: () => void;
}

export function Cabecera({ tema, onAlternarTema }: PropsCabecera) {
  return (
    <header className="cabecera">
      <div className="cabecera__contenido">
        <svg
          className="cabecera__logo"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M24 4 L30 18 L44 20 L33 29 L37 44 L24 36 L11 44 L15 29 L4 20 L18 18 Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
        <div>
          <h1 className="cabecera__titulo">Arena de IAs</h1>
          <p className="cabecera__subtitulo">
            Agentes que juegan, compiten y aprenden — con estadística honesta
          </p>
        </div>
        <div className="cabecera__acciones">
          <button
            type="button"
            className="boton-icono"
            onClick={onAlternarTema}
            aria-label={tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            title={tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {tema === 'oscuro' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
              </svg>
            )}
            <span aria-hidden="true">{tema === 'oscuro' ? 'Claro' : 'Oscuro'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
