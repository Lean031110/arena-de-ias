/**
 * Exportación de datos: JSON íntegro y CSV (UTF-8 con BOM para compatibilidad
 * con hojas de cálculo). El escapado CSV sigue la norma RFC 4180 (comillas
 * dobles dobladas).
 */

import type { RegistroEvaluacion } from './evaluacion';
import type { RegistroPartida } from './partida';

export function escaparCSV(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n\r;]/.test(texto)) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

function lineaCSV(campos: readonly (string | number | null | undefined)[]): string {
  return campos.map(escaparCSV).join(',');
}

function resultadoTexto(partida: RegistroPartida): string {
  if (partida.resultado === null) return 'invalida';
  if (partida.resultado.tipo === 'empate') return 'empate';
  return `gana-jugador-${partida.resultado.ganador}`;
}

/** CSV de partidas: una fila por partida (docs/MODELO_DATOS.md §10). */
export function aCSVPartidas(partidas: readonly RegistroPartida[]): string {
  const cabecera = lineaCSV([
    'id',
    'fecha',
    'juego',
    'reglas_version',
    'semilla',
    'agente1_id',
    'agente1_version',
    'agente2_id',
    'agente2_version',
    'resultado',
    'jugadas',
    'duracion_ms',
    'validez',
    'huella',
  ]);
  const filas = partidas.map((partida) =>
    lineaCSV([
      partida.id,
      partida.fecha,
      partida.juego.id,
      partida.juego.reglasVersion,
      partida.semilla,
      partida.agentes[0]?.id ?? '',
      partida.agentes[0]?.version ?? '',
      partida.agentes[1]?.id ?? '',
      partida.agentes[1]?.version ?? '',
      resultadoTexto(partida),
      partida.movimientos.length,
      Math.round(partida.duracionMs),
      partida.validez,
      partida.huella,
    ]),
  );
  return '\uFEFF' + [cabecera, ...filas].join('\r\n') + '\r\n';
}

/** CSV de resumen de evaluación: una fila por agente. */
export function aCSVEvaluacion(registro: RegistroEvaluacion): string {
  const cabecera = lineaCSV([
    'evaluacion_id',
    'fecha',
    'juego',
    'agente',
    'victorias',
    'empates',
    'derrotas',
    'partidas',
    'invalidas',
    'puntuacion',
    'ic95_inferior',
    'ic95_superior',
    'tiempo_medio_ms',
    'nodos_medios',
    'simulaciones_medias',
  ]);
  const filas = registro.resumenPorAgente.map((resumen) =>
    lineaCSV([
      registro.id,
      registro.fecha,
      registro.juego.id,
      resumen.agenteId,
      resumen.victorias,
      resumen.empates,
      resumen.derrotas,
      resumen.partidas,
      resumen.invalidas,
      resumen.puntuacion,
      resumen.ic95.disponible ? resumen.ic95.inferior : '',
      resumen.ic95.disponible ? resumen.ic95.superior : '',
      resumen.tiempoMedioMs ?? '',
      resumen.nodosMedios ?? '',
      resumen.simulacionesMedias ?? '',
    ]),
  );
  return '\uFEFF' + [cabecera, ...filas].join('\r\n') + '\r\n';
}

/** JSON legible de cualquier registro (mismo esquema, misma huella). */
export function aJSON(valor: unknown): string {
  return JSON.stringify(valor, null, 2);
}

/** Descarga en navegador; no-op documentado en Node. */
export function descargarArchivo(nombre: string, contenido: string, tipo: string): boolean {
  const globalWindow = globalThis as {
    document?: Document;
    URL?: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };
  };
  if (
    typeof globalWindow.document === 'undefined' ||
    typeof globalWindow.URL?.createObjectURL !== 'function'
  ) {
    return false;
  }
  const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
  const url = globalWindow.URL.createObjectURL(blob);
  const enlace = globalWindow.document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  globalWindow.document.body.appendChild(enlace);
  enlace.click();
  globalWindow.document.body.removeChild(enlace);
  globalWindow.URL.revokeObjectURL(url);
  return true;
}
