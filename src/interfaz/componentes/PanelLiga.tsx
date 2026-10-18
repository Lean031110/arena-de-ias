/**
 * Panel de la liga de versiones (Tarea G): exámenes de promoción ejecutados,
 * campeonas vigentes por juego y criterios congelados. Todos los números
 * provienen de eventos reales registrados; sin eventos, estado vacío.
 */

import { useEffect, useState } from 'react';
import type { Almacenamiento, EventoCerebro } from '../../aplicacion/almacen';
import { CRITERIOS_PROMOCION_V1, REFERENCIAS_CONGELADAS } from '../../aplicacion/liga';
import type { CerebroConEstado } from '../../aplicacion/registroCerebros';
import { RegistroCerebros } from '../../aplicacion/registroCerebros';
import { EstadoVacio } from './EstadoVacio';

interface PropsPanelLiga {
  readonly almacen: Almacenamiento;
}

interface DetalleComponente {
  readonly etiqueta: string;
  readonly victorias: number;
  readonly empates: number;
  readonly derrotas: number;
  readonly partidas: number;
  readonly puntuacion: number;
  readonly ic95: readonly [number, number];
  readonly aprobado: boolean;
}

export function PanelLiga({ almacen }: PropsPanelLiga) {
  const [registro] = useState(() => new RegistroCerebros(almacen));
  const [cerebros, setCerebros] = useState<readonly CerebroConEstado[]>([]);
  const [eventos, setEventos] = useState<readonly EventoCerebro[]>([]);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const lista = await registro.listar();
      const { registros } = await almacen.listarEventosCerebros();
      if (cancelado) return;
      setCerebros(lista);
      setEventos(registros);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [registro, almacen]);

  const examenes = eventos.filter((e) => e.tipo === 'examen' || e.tipo === 'promocion');
  const campeonas = cerebros.filter((c) => c.estado === 'campeon');

  return (
    <section className="panel" aria-labelledby="titulo-liga">
      <h2 className="panel__titulo" id="titulo-liga">
        Evolución y evaluación — Liga de versiones
      </h2>
      <p className="panel__descripcion">
        Los estados (candidata, campeona, archivada) se <strong>derivan de eventos
        reales</strong>, nunca se guardan a mano. Los exámenes de promoción usan
        criterios <strong>congelados antes</strong> de ejecutarse (ADR-007): mínimo{' '}
        {CRITERIOS_PROMOCION_V1.partidasMinimas} partidas por componente, puntuación ≥{' '}
        {CRITERIOS_PROMOCION_V1.puntuacionMinima} e IC95 inferior &gt;{' '}
        {CRITERIOS_PROMOCION_V1.ic95InferiorMinimo}. La campeona jamás se sobrescribe.
      </p>

      <h3>Campeonas vigentes</h3>
      {campeonas.length === 0 ? (
        <EstadoVacio
          titulo="Sin campeona todavía"
          descripcion="Ninguna candidata ha superado todavía el examen de promoción. En tres en raya 3×3 la referencia congelada (heurístico) resultó invencible incluso para minimax-d6 (200 empates exactos): el umbral v1 de 0,60 es inalcanzable en este juego y está documentado como propuesta de recalibración v2 para exámenes futuros. No se promueve nada sin evidencia."
        />
      ) : (
        <ul className="lista-simple">
          {campeonas.map((c) => (
            <li key={`${c.registro.agentId}@${c.registro.brainVersion}`}>
              <strong>
                {c.registro.agentId}@{c.registro.brainVersion}
              </strong>{' '}
              — {c.registro.manifiesto.gameId} · promovida por examen aprobado (ver eventos).
            </li>
          ))}
        </ul>
      )}

      <h3>Exámenes registrados</h3>
      {examenes.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay exámenes ejecutados"
          descripcion="Los exámenes se ejecutan con «npm run examinar:candidata <ruta-al-.lba>» o desde el flujo de entrenamiento. Cada examen registra partidas reales, V/E/D, puntuación, IC95, semillas y conclusión."
        />
      ) : (
        <div className="tarjetas-juego">
          {examenes.map((evento) => {
            const componentes = (evento.datos?.componentes as readonly DetalleComponente[] | undefined) ?? [];
            const aprobado = evento.datos?.aprobado === true;
            return (
              <article className="tarjeta-juego" key={evento.id}>
                <header className="tarjeta-juego__cabecera">
                  <h3>
                    {evento.tipo === 'promocion' ? 'Promoción' : 'Examen'} · {evento.agentId}@
                    {evento.brainVersion}
                  </h3>
                  <span className={aprobado ? 'insignia insignia--campeona' : 'insignia insignia--peligro'}>
                    {aprobado ? 'Aprobado' : 'No aprobado'}
                  </span>
                </header>
                <dl className="parametros">
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Fecha</dt>
                    <dd className="parametro__valor">{evento.fecha}</dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Juego</dt>
                    <dd className="parametro__valor">
                      {String(evento.datos?.juegoId ?? '?')} · reglas {String(evento.datos?.reglas ?? '?')}
                    </dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Encuentros</dt>
                    <dd className="parametro__valor">{String(evento.datos?.encuentros ?? '?')} (lados alternos)</dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Simulaciones PUCT</dt>
                    <dd className="parametro__valor">{String(evento.datos?.simulaciones ?? '?')}</dd>
                  </div>
                </dl>
                {componentes.length > 0 && (
                  <table className="tabla-compacta">
                    <caption className="campo__etiqueta">Componentes del examen</caption>
                    <thead>
                      <tr>
                        <th scope="col">Rival</th>
                        <th scope="col">V</th>
                        <th scope="col">E</th>
                        <th scope="col">D</th>
                        <th scope="col">Puntuación</th>
                        <th scope="col">IC95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {componentes.map((c) => (
                        <tr key={c.etiqueta}>
                          <td>{c.etiqueta}</td>
                          <td>{c.victorias}</td>
                          <td>{c.empates}</td>
                          <td>{c.derrotas}</td>
                          <td>{c.puntuacion.toFixed(3)}</td>
                          <td>
                            [{c.ic95[0].toFixed(3)}, {c.ic95[1].toFixed(3)}]
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="nota">{String(evento.datos?.conclusion ?? '')}</p>
              </article>
            );
          })}
        </div>
      )}

      <h3>Referencias congeladas</h3>
      <ul className="lista-simple">
        {Object.entries(REFERENCIAS_CONGELADAS).map(([juegoId, ref]) => (
          <li key={juegoId}>
            <strong>{juegoId}</strong>: {ref.etiqueta}
          </li>
        ))}
      </ul>
      <p className="nota">
        Nota honesta: medición real del techo (scripts/medir-techo-heuristico.ts): minimax-d6
        contra la referencia congelada de 3×3 = 200 empates exactos (puntuación 0,500). El
        umbral v1 (0,60) es matemáticamente inalcanzable en ese juego; la recalibración v2 se
        aplica solo a exámenes futuros, jamás retroactivamente.
      </p>
    </section>
  );
}
