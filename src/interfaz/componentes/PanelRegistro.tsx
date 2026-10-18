import { aJSON, descargarArchivo } from '../../dominio/motor/exportacion';
import type { EstadoAlmacen } from '../ganchos/useAlmacen';
import { EstadoVacio } from './EstadoVacio';

interface PropsPanelRegistro {
  almacen: EstadoAlmacen;
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es', { timeStyle: 'medium' });
  } catch {
    return iso;
  }
}

const ETIQUETAS_TIPO: Record<string, string> = {
  partida: 'partida',
  evaluacion: 'evaluación',
  'evaluacion-cancelada': 'evaluación cancelada',
  validacion: 'validación',
  error: 'error',
  sistema: 'sistema',
  almacenamiento: 'almacenamiento',
};

export function PanelRegistro({ almacen }: PropsPanelRegistro) {
  if (almacen.eventos.length === 0) {
    return (
      <section className="panel" aria-labelledby="titulo-registro">
        <h2 className="panel__titulo" id="titulo-registro">
          Registro experimental
        </h2>
        <EstadoVacio
          titulo="El registro está vacío"
          descripcion="Cada partida, evaluación, validación o fallo queda aquí como evento con marca temporal y huella de integridad. Todavía no ha ocurrido ninguno en este navegador."
        />
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="titulo-registro">
      <h2 className="panel__titulo" id="titulo-registro">
        Registro experimental ({almacen.eventos.length} eventos)
      </h2>
      <p className="panel__descripcion">
        Registro central append-only con deduplicación por id. Las huellas FNV-1a detectan
        corrupción accidental; NO prueban que un evento ocurrió (limitación documentada).
      </p>
      <ul className="lista-eventos">
        {almacen.eventos.map((evento) => (
          <li className="evento" key={evento.id}>
            <div className="evento__cabecera">
              <span className="insignia">{ETIQUETAS_TIPO[evento.tipo] ?? evento.tipo}</span>
              <p className="evento__resumen">{evento.resumen}</p>
              <span className="evento__fecha">{formatearFecha(evento.fecha)}</span>
            </div>
            <details>
              <summary>Detalle técnico (huella {evento.huella})</summary>
              <pre>{JSON.stringify({ id: evento.id, fecha: evento.fecha, datos: evento.datos ?? null }, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
      <div className="acciones">
        <button
          type="button"
          className="boton boton--peque"
          onClick={() =>
            descargarArchivo(
              `eventos-${new Date().toISOString().slice(0, 10)}.json`,
              aJSON(almacen.eventos),
              'application/json',
            )
          }
        >
          Exportar eventos (JSON)
        </button>
      </div>
    </section>
  );
}
