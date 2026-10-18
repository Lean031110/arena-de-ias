import { CATALOGO_AGENTES } from '../../dominio/agentes/registro';
import { CATALOGO_JUEGOS } from '../../dominio/juegos/registro';

export function PanelAgentes() {
  return (
    <section aria-labelledby="titulo-agentes">
      <div className="panel">
        <h2 className="panel__titulo" id="titulo-agentes">
          Agentes disponibles
        </h2>
        <p className="panel__descripcion">
          Niveles de fuerza del proyecto. El nivel 5 (red de política y valor) está{' '}
          <strong>pendiente de implementación</strong> en la Fase 2: no se muestra ninguna métrica
          porque todavía no existen datos de entrenamiento.
        </p>
        <div className="tarjetas-agente">
          {CATALOGO_AGENTES.map((agente) => (
            <article className="tarjeta-agente" key={agente.id}>
              <div className="tarjeta-agente__cabecera">
                <span className="tarjeta-agente__nombre">{agente.nombre}</span>
                {agente.estado === 'pendiente' ? (
                  <span className="insignia insignia--pendiente">Pendiente · Fase 2</span>
                ) : (
                  <span className="insignia insignia--nivel">Nivel {agente.nivel}</span>
                )}
              </div>
              <p className="tarjeta-agente__descripcion">{agente.descripcion}</p>
              <p className="tarjeta-agente__pie">
                <span>versión {agente.version}</span>
                {agente.parametros.length > 0 && (
                  <span>
                    parámetros:{' '}
                    {agente.parametros.map((parametro) => parametro.etiqueta).join(', ')}
                  </span>
                )}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="panel__titulo">Catálogo de juegos</h3>
        <p className="panel__descripcion">
          Estado real de las 15 variantes exigidas por la especificación. Las pendientes no son
          jugables y no muestran datos.
        </p>
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Juego</th>
                <th scope="col">Identificador</th>
                <th scope="col">Estado</th>
                <th scope="col">Notas</th>
              </tr>
            </thead>
            <tbody>
              {CATALOGO_JUEGOS.map((entrada) => (
                <tr key={entrada.id}>
                  <td>{entrada.nombre}</td>
                  <td>
                    <code>{entrada.id}</code>
                  </td>
                  <td>
                    {entrada.estado === 'implementado' ? (
                      <span className="insignia insignia--verificada">implementado</span>
                    ) : (
                      <span className="insignia insignia--pendiente">pendiente · Fase 5</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'normal' }}>{entrada.notas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
