import { useState } from 'react';
import { aCSVEvaluacion, aCSVPartidas, aJSON, descargarArchivo } from '../../dominio/motor/exportacion';
import type { EstadoAlmacen } from '../ganchos/useAlmacen';
import type { RegistroPartida } from '../../dominio/motor/partida';
import { EstadoVacio } from './EstadoVacio';

interface PropsPanelResultados {
  almacen: EstadoAlmacen;
  alIrAArena: () => void;
  onReproducir: (registro: RegistroPartida) => void;
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function BarraIC({ inferior, superior, puntuacion }: { inferior: number; superior: number; puntuacion: number }) {
  const aPorcentaje = (valor: number) => `${(valor * 100).toFixed(1)}%`;
  return (
    <span className="barra-ic" title={`IC 95 %: [${inferior.toFixed(3)}, ${superior.toFixed(3)}]`}>
      <span
        className="barra-ic__rango"
        style={{ left: aPorcentaje(inferior), width: `${((superior - inferior) * 100).toFixed(1)}%` }}
      />
      <span className="barra-ic__punto" style={{ left: aPorcentaje(puntuacion) }} />
    </span>
  );
}

export function PanelResultados({ almacen, alIrAArena, onReproducir }: PropsPanelResultados) {
  const [ampliada, setAmpliada] = useState<string | null>(null);

  if (almacen.evaluaciones.length === 0) {
    return (
      <section className="panel" aria-labelledby="titulo-resultados">
        <h2 className="panel__titulo" id="titulo-resultados">
          Resultados
        </h2>
        <EstadoVacio
          titulo="Sin datos — aún no se ha ejecutado ninguna evaluación"
          descripcion="Aquí aparecerán las evaluaciones con victorias, empates, derrotas, puntuación e intervalos de confianza, calculados únicamente sobre partidas reales."
          accion={{ etiqueta: 'Ejecutar la primera evaluación', onClic: alIrAArena }}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-resultados">
      <div className="panel">
        <h2 className="panel__titulo" id="titulo-resultados">
          Resultados medidos ({almacen.evaluaciones.length} evaluaciones)
        </h2>
        <p className="panel__descripcion">
          Puntuación = (victorias + empates/2) / partidas. Los intervalos son de Wilson al 95 %:
          no constituyen una garantía absoluta. Elo y Glicko-2 llegarán en la Fase 4 — hoy muestran
          «Sin datos».
        </p>
      </div>

      {almacen.evaluaciones.map((evaluacion) => {
        const abierta = ampliada === evaluacion.id;
        return (
          <div className="panel" key={evaluacion.id}>
            <h3 className="panel__titulo">
              {evaluacion.juego.id} · {evaluacion.encuentrosPorPar} encuentros por par
            </h3>
            <p className="panel__descripcion">
              {formatearFecha(evaluacion.fecha)} · semilla base {evaluacion.semillaBase} ·{' '}
              {evaluacion.partidas.length} partidas registradas
              {evaluacion.invalidas > 0 && (
                <strong style={{ color: 'var(--peligro)' }}> · {evaluacion.invalidas} inválidas</strong>
              )}
            </p>

            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Agente</th>
                    <th scope="col" className="num">Victorias</th>
                    <th scope="col" className="num">Empates</th>
                    <th scope="col" className="num">Derrotas</th>
                    <th scope="col" className="num">Puntuación</th>
                    <th scope="col">IC 95 %</th>
                    <th scope="col" className="num">Tiempo medio</th>
                    <th scope="col" className="num">Nodos/sim. por jugada</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluacion.resumenPorAgente.map((resumen) => (
                    <tr key={resumen.agenteId}>
                      <td>{resumen.nombre}</td>
                      <td className="num">{resumen.victorias}</td>
                      <td className="num">{resumen.empates}</td>
                      <td className="num">{resumen.derrotas}</td>
                      <td className="num">
                        {resumen.partidas === 0 ? 'Sin datos' : resumen.puntuacion.toFixed(3)}
                      </td>
                      <td>
                        {resumen.ic95.disponible ? (
                          <BarraIC
                            inferior={resumen.ic95.inferior}
                            superior={resumen.ic95.superior}
                            puntuacion={resumen.puntuacion}
                          />
                        ) : (
                          'Sin datos'
                        )}
                      </td>
                      <td className="num">
                        {resumen.tiempoMedioMs === null ? '—' : `${(resumen.tiempoMedioMs / 1000).toFixed(2)} s`}
                      </td>
                      <td className="num">
                        {resumen.nodosMedios !== null
                          ? `${resumen.nodosMedios} nodos`
                          : resumen.simulacionesMedias !== null
                            ? `${resumen.simulacionesMedias} sim.`
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="acciones">
              <button
                type="button"
                className="boton boton--peque"
                onClick={() => setAmpliada(abierta ? null : evaluacion.id)}
                aria-expanded={abierta}
              >
                {abierta ? 'Ocultar partidas' : `Ver las ${evaluacion.partidas.length} partidas`}
              </button>
              <button
                type="button"
                className="boton boton--peque"
                onClick={() =>
                  descargarArchivo(
                    `evaluacion-${evaluacion.id}.json`,
                    aJSON(evaluacion),
                    'application/json',
                  )
                }
              >
                Exportar JSON
              </button>
              <button
                type="button"
                className="boton boton--peque"
                onClick={() =>
                  descargarArchivo(
                    `evaluacion-${evaluacion.id}-partidas.csv`,
                    aCSVPartidas(evaluacion.partidas),
                    'text/csv',
                  )
                }
              >
                Exportar CSV de partidas
              </button>
              <button
                type="button"
                className="boton boton--peque"
                onClick={() =>
                  descargarArchivo(
                    `evaluacion-${evaluacion.id}-resumen.csv`,
                    aCSVEvaluacion(evaluacion),
                    'text/csv',
                  )
                }
              >
                Exportar CSV de resumen
              </button>
            </div>

            {abierta && (
              <div className="tabla-contenedor" style={{ marginTop: '0.8rem' }}>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Semilla</th>
                      <th scope="col">✕ (jugador 1)</th>
                      <th scope="col">◯ (jugador 2)</th>
                      <th scope="col">Resultado</th>
                      <th scope="col" className="num">Jugadas</th>
                      <th scope="col" className="num">Duración</th>
                      <th scope="col">Validez</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {evaluacion.partidas.slice(0, 100).map((partida) => (
                      <tr key={partida.id}>
                        <td className="num">{partida.semilla}</td>
                        <td>{partida.agentes[0]?.id}</td>
                        <td>{partida.agentes[1]?.id}</td>
                        <td>
                          {partida.resultado === null
                            ? 'inválida'
                            : partida.resultado.tipo === 'empate'
                              ? 'empate'
                              : `ganó ${partida.resultado.ganador === 1 ? '✕' : '◯'}`}
                        </td>
                        <td className="num">{partida.movimientos.length}</td>
                        <td className="num">{(partida.duracionMs / 1000).toFixed(2)} s</td>
                        <td>
                          <span
                            className={`insignia insignia--${partida.validez === 'verificada' ? 'verificada' : 'invalida'}`}
                          >
                            {partida.validez}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="boton boton--peque"
                            onClick={() => onReproducir(partida)}
                          >
                            Reproducir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evaluacion.partidas.length > 100 && (
                  <p className="parametro__etiqueta">
                    Mostrando las primeras 100 de {evaluacion.partidas.length}; exporta el CSV/JSON
                    para el registro completo.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
