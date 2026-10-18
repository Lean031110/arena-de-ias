import { CATALOGO_AGENTES } from '../../dominio/agentes/registro';
import type { DefinicionAgente } from '../../dominio/agentes/registro';
import { configPorDefecto } from '../../dominio/agentes/registro';

export interface SeleccionAgente {
  readonly id: string;
  readonly config: Record<string, number | boolean>;
}

interface PropsSelectorAgente {
  etiqueta: string;
  valor: SeleccionAgente;
  onCambio: (seleccion: SeleccionAgente) => void;
  excluidos?: readonly string[];
}

export function SelectorAgente({ etiqueta, valor, onCambio, excluidos }: PropsSelectorAgente) {
  const definiciones = CATALOGO_AGENTES.filter(
    (agente) =>
      (agente.estado === 'disponible' || agente.estado === 'humano') &&
      !(excluidos ?? []).includes(agente.id),
  );

  const definicionActual = definiciones.find((agente) => agente.id === valor.id);

  const cambiarId = (id: string) => {
    onCambio({ id, config: configPorDefecto(id) });
  };

  const cambiarParametro = (clave: string, nuevo: number) => {
    const config = { ...valor.config, [clave]: nuevo };
    onCambio({ id: valor.id, config });
  };

  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={`agente-${etiqueta}`}>
        {etiqueta}
      </label>
      <select
        id={`agente-${etiqueta}`}
        className="seleccion"
        value={valor.id}
        onChange={(evento) => cambiarId(evento.target.value)}
      >
        {definiciones.map((agente: DefinicionAgente) => (
          <option key={agente.id} value={agente.id}>
            {agente.nombre} · nivel {agente.nivel}
          </option>
        ))}
      </select>
      {definicionActual !== undefined && definicionActual.parametros.length > 0 && (
        <div className="parametros">
          {definicionActual.parametros.map((parametro) => (
            <div key={parametro.clave} className="parametro">
              <span className="parametro__etiqueta" title={parametro.descripcion}>
                {parametro.etiqueta}
              </span>
              <input
                type="number"
                className="parametro__valor"
                min={parametro.min}
                max={parametro.max}
                step={parametro.paso}
                value={String(valor.config[parametro.clave] ?? parametro.defecto)}
                aria-label={`${parametro.etiqueta} de ${definicionActual.nombre}`}
                onChange={(evento) => {
                  const numero = Number(evento.target.value);
                  if (Number.isFinite(numero)) {
                    cambiarParametro(parametro.clave, numero);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
      {definicionActual !== undefined && (
        <p className="parametro__etiqueta" style={{ marginTop: '0.4rem' }}>
          {definicionActual.descripcion}
        </p>
      )}
    </div>
  );
}

/** Presets de presupuesto (se aplican a los parámetros por defecto). */
export interface PresetPresupuesto {
  readonly id: string;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly ajustes: Readonly<Record<string, Record<string, number>>>;
}

export const PRESETS_PRESUPUESTO: readonly PresetPresupuesto[] = [
  {
    id: 'rapido',
    etiqueta: 'Rápido',
    descripcion: 'minimax profundidad 2 · MCTS 300 simulaciones',
    ajustes: {
      minimax: { profundidad: 2, nodoLimite: 20000, tiempoLimiteMs: 1000 },
      mcts: { simulaciones: 300, constanteExploracion: 1.4, limiteRollout: 0 },
    },
  },
  {
    id: 'normal',
    etiqueta: 'Normal',
    descripcion: 'minimax profundidad 4 · MCTS 1000 simulaciones',
    ajustes: {
      minimax: { profundidad: 4, nodoLimite: 60000, tiempoLimiteMs: 2000 },
      mcts: { simulaciones: 1000, constanteExploracion: 1.4, limiteRollout: 0 },
    },
  },
  {
    id: 'profundo',
    etiqueta: 'Profundo',
    descripcion: 'minimax profundidad 6 · MCTS 4000 simulaciones (más lento)',
    ajustes: {
      minimax: { profundidad: 6, nodoLimite: 300000, tiempoLimiteMs: 5000 },
      mcts: { simulaciones: 4000, constanteExploracion: 1.4, limiteRollout: 0 },
    },
  },
];

export function aplicarPreset(
  seleccion: SeleccionAgente,
  preset: PresetPresupuesto,
): SeleccionAgente {
  const ajustes = preset.ajustes[seleccion.id];
  if (ajustes === undefined) {
    return { id: seleccion.id, config: configPorDefecto(seleccion.id) };
  }
  return { id: seleccion.id, config: { ...seleccion.config, ...ajustes } };
}
