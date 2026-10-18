import type { ReactNode } from 'react';

interface PropsEstadoVacio {
  titulo: string;
  descripcion: string;
  accion?: { etiqueta: string; onClic: () => void };
}

export function EstadoVacio({ titulo, descripcion, accion }: PropsEstadoVacio) {
  return (
    <div className="estado-vacio">
      <svg className="estado-vacio__icono" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="6" y="10" width="36" height="30" rx="4" stroke="currentColor" strokeWidth="3" />
        <path d="M14 18h20M14 26h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h3>{titulo}</h3>
      <p>{descripcion}</p>
      {accion !== undefined && (
        <button type="button" className="boton boton--primario" onClick={accion.onClic}>
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}

interface PropsBarraProgreso {
  valor: number;
  total: number;
  etiqueta?: string;
}

export function BarraProgreso({ valor, total, etiqueta }: PropsBarraProgreso) {
  const porcentaje = total === 0 ? 0 : Math.round((valor / total) * 100);
  return (
    <div className="campo" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor}>
      <div
        className="barra"
        aria-hidden="true"
      >
        <div className="barra__relleno" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className="parametro__etiqueta" style={{ marginTop: '0.3rem' }}>
        {etiqueta ?? 'Progreso'}: {valor} / {total} ({porcentaje} %) — recuento real de partidas
        completadas
      </p>
    </div>
  );
}

export function Aviso({
  tipo,
  children,
}: {
  tipo: 'error' | 'info' | 'exito';
  children: ReactNode;
}) {
  return <div className={`aviso aviso--${tipo}`}>{children}</div>;
}
