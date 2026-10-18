/**
 * Fase 3 — Políticas de agregación de propuestas (funciones PURAS).
 *
 * Regla de desempate (documentada y probada): ante empate de valor (votos o
 * peso acumulado), gana el movimiento con MENOR notación en orden
 * lexicográfico. Determinista: la misma entrada produce siempre la misma
 * decisión, sin RNG ni orden de llegada.
 */

import type {
  DecisionEquipo,
  MiembroEquipo,
  PoliticaAgregacion,
  PropuestaMiembro,
  RecuentoNotacion,
} from './tipos';

function recuentoDesde(
  propuestas: readonly PropuestaMiembro[],
  miembros: readonly MiembroEquipo[],
  politica: PoliticaAgregacion,
): RecuentoNotacion[] {
  const porNotacion = new Map<string, { valor: number; votantes: string[] }>();
  for (const propuesta of propuestas) {
    const peso =
      politica === 'ponderado'
        ? Math.max(0, miembros.find((m) => m.alias === propuesta.alias)?.pesoMedido ?? 0)
        : 1;
    const entrada = porNotacion.get(propuesta.notacion) ?? { valor: 0, votantes: [] };
    entrada.valor += peso;
    entrada.votantes.push(propuesta.alias);
    porNotacion.set(propuesta.notacion, entrada);
  }
  return [...porNotacion.entries()]
    .map(([notacion, { valor, votantes }]) => ({
      notacion,
      valor: Number(valor.toFixed(6)),
      votantes: [...votantes].sort(),
    }))
    .sort((a, b) => {
      // Mayor valor primero; empate → menor notación (determinista).
      if (b.valor !== a.valor) return b.valor - a.valor;
      return a.notacion < b.notacion ? -1 : a.notacion > b.notacion ? 1 : 0;
    });
}

function estadisticasAgregadas(propuestas: readonly PropuestaMiembro[]) {
  return {
    nodos: propuestas.reduce((total, p) => total + (p.estadisticas.nodos ?? 0), 0),
    simulaciones: propuestas.reduce((total, p) => total + (p.estadisticas.simulaciones ?? 0), 0),
    profundidad: Math.max(0, ...propuestas.map((p) => p.estadisticas.profundidad ?? 0)),
    presupuestoAgotado: propuestas.some((p) => p.estadisticas.presupuestoAgotado === true),
    tiempoMs: propuestas.reduce((total, p) => total + p.estadisticas.tiempoMs, 0),
  };
}

/**
 * Agrega propuestas en una decisión final según la política indicada.
 * Lanza si no hay propuestas (un equipo sin miembros no decide nada).
 */
export function agregarPropuestas(
  propuestas: readonly PropuestaMiembro[],
  miembros: readonly MiembroEquipo[],
  politica: PoliticaAgregacion,
  protocolo: 'consulta',
): DecisionEquipo {
  if (propuestas.length === 0) {
    throw new Error('la agregación exige al menos una propuesta');
  }
  if (politica === 'ponderado') {
    const sinPeso = miembros.filter((m) => m.pesoMedido < 0);
    if (sinPeso.length > 0) {
      throw new Error(
        `pesos medidos negativos (no provienen de resultados medidos): ${sinPeso
          .map((m) => m.alias)
          .join(', ')}`,
      );
    }
  }
  const recuento = recuentoDesde(propuestas, miembros, politica);
  const ganadora = recuento[0] as RecuentoNotacion;
  return {
    notacion: ganadora.notacion,
    politica,
    protocolo,
    recuento,
    elegidoPor: ganadora.votantes,
    estadisticas: estadisticasAgregadas(propuestas),
  };
}

/** Votos por notación (para pruebas e interfaz). */
export function votosPorNotacion(
  propuestas: readonly PropuestaMiembro[],
): Map<string, number> {
  const votos = new Map<string, number>();
  for (const propuesta of propuestas) {
    votos.set(propuesta.notacion, (votos.get(propuesta.notacion) ?? 0) + 1);
  }
  return votos;
}

/** Peso acumulado por notación con los pesos medidos de los miembros. */
export function pesoPorNotacion(
  propuestas: readonly PropuestaMiembro[],
  miembros: readonly MiembroEquipo[],
): Map<string, number> {
  const pesos = new Map<string, number>();
  for (const propuesta of propuestas) {
    const peso = Math.max(0, miembros.find((m) => m.alias === propuesta.alias)?.pesoMedido ?? 0);
    pesos.set(propuesta.notacion, (pesos.get(propuesta.notacion) ?? 0) + peso);
  }
  return pesos;
}
