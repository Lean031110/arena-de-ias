export type Vista = 'arena' | 'resultados' | 'registro' | 'agentes' | 'guia';

interface PropsNavegacion {
  vista: Vista;
  onCambio: (vista: Vista) => void;
}

const ELEMENTOS: ReadonlyArray<{ id: Vista; etiqueta: string }> = [
  { id: 'arena', etiqueta: 'Arena' },
  { id: 'resultados', etiqueta: 'Resultados' },
  { id: 'registro', etiqueta: 'Registro' },
  { id: 'agentes', etiqueta: 'Agentes' },
  { id: 'guia', etiqueta: 'Guía' },
];

export function Navegacion({ vista, onCambio }: PropsNavegacion) {
  return (
    <nav className="navegacion" aria-label="Secciones principales">
      <div className="navegacion__lista" role="tablist">
        {ELEMENTOS.map((elemento) => (
          <button
            key={elemento.id}
            type="button"
            role="tab"
            className="navegacion__boton"
            aria-current={vista === elemento.id ? 'page' : undefined}
            aria-selected={vista === elemento.id}
            onClick={() => onCambio(elemento.id)}
          >
            {elemento.etiqueta}
          </button>
        ))}
      </div>
    </nav>
  );
}
