import { useMemo, useState } from 'react';
import { obtenerJuego } from '../../dominio/juegos/registro';
import type { ConfigPartida } from '../../dominio/motor/partida';
import type { RegistroEvaluacion } from '../../dominio/motor/evaluacion';
import { configPorDefecto } from '../../dominio/agentes/registro';
import type { ClienteTrabajador } from '../../trabajadores/cliente';
import type { EstadoAlmacen } from '../ganchos/useAlmacen';
import { usePartida } from '../ganchos/usePartida';
import { Tablero } from './Tablero';
import { SelectorAgente, PRESETS_PRESUPUESTO, aplicarPreset } from './SelectorAgente';
import { SelectorJuego } from './SelectorJuego';
import type { SeleccionAgente } from './SelectorAgente';
import { BarraProgreso } from './EstadoVacio';

interface PropsPanelArena {
  cliente: ClienteTrabajador;
  almacen: EstadoAlmacen;
  alIrAResultados: () => void;
}

function semillaAleatoria(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function PanelArena({ cliente, almacen, alIrAResultados }: PropsPanelArena) {
  const [juegoId, setJuegoId] = useState('tres-en-raya-3');
  const [agente1, setAgente1] = useState<SeleccionAgente>({ id: 'heuristico', config: configPorDefecto('heuristico') });
  const [agente2, setAgente2] = useState<SeleccionAgente>({ id: 'aleatorio', config: configPorDefecto('aleatorio') });
  const [preset, setPreset] = useState('normal');
  const [semilla, setSemilla] = useState<number>(() => semillaAleatoria());
  const [encuentrosPorPar, setEncuentrosPorPar] = useState(40);
  const [evaluando, setEvaluando] = useState(false);
  const [progreso, setProgreso] = useState({ completadas: 0, total: 0 });
  const [errorEvaluacion, setErrorEvaluacion] = useState<string | null>(null);

  const partida = usePartida(cliente);
  const juego = useMemo(() => obtenerJuego(juegoId), [juegoId]);

  const aplicarPresetAmbos = (presetId: string) => {
    const presetEncontrado = PRESETS_PRESUPUESTO.find((p) => p.id === presetId);
    setPreset(presetId);
    if (presetEncontrado === undefined) return;
    setAgente1((actual) => aplicarPreset(actual, presetEncontrado));
    setAgente2((actual) => aplicarPreset(actual, presetEncontrado));
  };

  const construirConfig = (): ConfigPartida => ({
    juegoId,
    semilla: Number.isFinite(semilla) && semilla >= 0 ? Math.floor(semilla) : semillaAleatoria(),
    agentes: [
      { id: agente1.id, config: agente1.config },
      { id: agente2.id, config: agente2.config },
    ],
  });

  const iniciarPartida = async () => {
    setErrorEvaluacion(null);
    await partida.iniciar(construirConfig());
  };

  const iniciarEvaluacion = async () => {
    if (evaluando) return;
    setErrorEvaluacion(null);
    setEvaluando(true);
    setProgreso({ completadas: 0, total: 0 });
    const configuracion = {
      juegoId,
      semillaBase: semillaAleatoria(),
      encuentrosPorPar,
      agentes: [
        { id: agente1.id, config: agente1.config },
        { id: agente2.id, config: agente2.config },
      ],
    };
    try {
      const resultado = await cliente.ejecutarEvaluacion(configuracion, (completadas, total) => {
        setProgreso({ completadas, total });
      });
      if ('cancelada' in resultado && resultado.cancelada) {
        for (const registro of resultado.partidas) {
          await almacen.guardarPartida(registro);
        }
        await almacen.registrarEvento(
          'evaluacion-cancelada',
          `Evaluación cancelada tras ${resultado.completadas} de ${resultado.total} partidas; ` +
            'las partidas completadas se han guardado individualmente.',
          { juegoId, completadas: resultado.completadas, total: resultado.total },
        );
      } else {
        await almacen.guardarEvaluacion(resultado as RegistroEvaluacion);
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      setErrorEvaluacion(mensaje);
      await almacen.registrarEvento('error', `Fallo al ejecutar la evaluación: ${mensaje}`, {
        juegoId,
      });
    } finally {
      setEvaluando(false);
    }
  };

  const { estado: estadoPartida } = partida;
  const enConfiguracion = estadoPartida === null;
  const fase = estadoPartida?.fase;

  const turnoSiguiente =
    estadoPartida !== null && fase?.tipo === 'en-curso'
      ? juego.jugadorActual(juego.decodificar(estadoPartida.estadoCodificado))
      : null;

  const guardarPartidaTerminada = async () => {
    if (fase?.tipo !== 'terminada') return;
    await almacen.guardarPartida(fase.registro);
  };

  return (
    <section aria-labelledby="titulo-arena">
      <div className="panel">
        <h2 className="panel__titulo" id="titulo-arena">
          Arena — configura el duelo
        </h2>
        <p className="panel__descripcion">
          Elige juego, agentes y presupuesto. Toda partida se ejecuta con una semilla registrada y
          se valida por reproducción; toda cifra mostrada proviene de mediciones reales.
        </p>

        <SelectorJuego valor={juegoId} onCambio={setJuegoId} />

        <div className="campo__fila">
          <SelectorAgente
            etiqueta="Primer jugador"
            valor={agente1}
            onCambio={setAgente1}
            excluidos={['humano']}
          />
          <SelectorAgente
            etiqueta="Segundo jugador"
            valor={agente2}
            onCambio={setAgente2}
            excluidos={['humano']}
          />
        </div>

        <div className="campo__fila">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor="preset">
              Presupuesto de búsqueda
            </label>
            <select
              id="preset"
              className="seleccion"
              value={preset}
              onChange={(evento) => aplicarPresetAmbos(evento.target.value)}
            >
              {PRESETS_PRESUPUESTO.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta} — {p.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="campo__etiqueta" htmlFor="semilla">
              Semilla
            </label>
            <div className="campo__fila" style={{ flexWrap: 'nowrap' }}>
              <input
                id="semilla"
                className="campo__control"
                type="number"
                min={0}
                step={1}
                value={String(semilla)}
                onChange={(evento) => setSemilla(Number(evento.target.value))}
              />
              <button
                type="button"
                className="boton boton--peque"
                onClick={() => setSemilla(semillaAleatoria())}
                title="Generar semilla aleatoria"
              >
                Aleatoria
              </button>
            </div>
          </div>
        </div>

        <div className="acciones">
          <button
            type="button"
            className="boton boton--primario"
            disabled={!enConfiguracion || evaluando}
            onClick={() => void iniciarPartida()}
          >
            Jugar partida (paso a paso)
          </button>
          <div className="campo" style={{ margin: 0, flex: '0 1 130px' }}>
            <label className="campo__etiqueta" htmlFor="encuentros">
              Encuentros por par
            </label>
            <input
              id="encuentros"
              className="campo__control"
              type="number"
              min={10}
              max={200}
              step={2}
              value={String(encuentrosPorPar)}
              onChange={(evento) => {
                const numero = Number(evento.target.value);
                if (Number.isFinite(numero)) {
                  setEncuentrosPorPar(Math.max(2, Math.min(200, Math.floor(numero))));
                }
              }}
              disabled={evaluando}
            />
          </div>
          <button
            type="button"
            className="boton"
            disabled={!enConfiguracion || evaluando}
            onClick={() => void iniciarEvaluacion()}
          >
            Ejecutar evaluación ({encuentrosPorPar} partidas)
          </button>
        </div>

        {evaluando && (
          <div className="campo">
            <BarraProgreso
              valor={progreso.completadas}
              total={progreso.total}
              etiqueta="Evaluación"
            />
            <button
              type="button"
              className="boton boton--peligro boton--peque"
              onClick={() => cliente.cancelar()}
            >
              Cancelar (se guardan las partidas completadas)
            </button>
          </div>
        )}
        {errorEvaluacion !== null && (
          <div className="aviso aviso--error" role="alert">
            La evaluación falló: {errorEvaluacion}. El fallo quedó registrado en el registro de
            eventos.
          </div>
        )}
      </div>

      {estadoPartida !== null && (
        <div className="panel dos-columnas">
          <div>
            <h3 className="panel__titulo">
              {fase?.tipo === 'reproduccion' ? 'Reproducción de partida' : 'Partida en curso'}
            </h3>
            <div className="estado-partida">
              {fase?.tipo === 'en-curso' && fase.pensando && (
                <span className="insignia insignia--nivel">La IA está pensando…</span>
              )}
              {fase?.tipo === 'en-curso' && fase.pendienteHumano && (
                <span className="insignia insignia--nivel">
                  Tu turno — pulsa una casilla habilitada
                </span>
              )}
              {fase?.tipo === 'en-curso' && turnoSiguiente !== null && (
                <span>
                  Turno:{' '}
                  {turnoSiguiente === 1 ? agente1.id === 'humano' ? 'tú (✕)' : `${agente1.id} (✕)` : `${agente2.id} (◯)`}
                </span>
              )}
              {fase?.tipo === 'terminada' && (
                <>
                  <span className="insignia insignia--verificada">
                    {fase.registro.validez === 'verificada' ? 'Verificada por replay' : 'Inválida'}
                  </span>
                  <span>
                    {fase.registro.resultado === null
                      ? 'Sin resultado (partida inválida)'
                      : fase.registro.resultado.tipo === 'empate'
                        ? 'Empate'
                        : `Ganó el jugador ${fase.registro.resultado.ganador} (${
                            fase.registro.resultado.ganador === 1 ? agente1.id : agente2.id
                          })`}
                  </span>
                  <span className="parametro__etiqueta">
                    {fase.registro.movimientos.length} jugadas ·{' '}
                    {fase.registro.duracionMs.toFixed(0)} ms · semilla {fase.registro.semilla}
                  </span>
                </>
              )}
            </div>

            <Tablero
              juego={juego}
              estadoCodificado={estadoPartida.estadoCodificado}
              interactiva={fase?.tipo === 'en-curso' && fase.pendienteHumano}
              onJugada={(movimiento) => {
                const notacion = juego.formatearMovimiento(movimiento);
                partida.jugarHumano(notacion);
              }}
              anuncio={
                fase?.tipo === 'terminada'
                  ? fase.registro.resultado === null
                    ? 'Partida inválida'
                    : fase.registro.resultado.tipo === 'empate'
                      ? 'Empate'
                      : `Ganó el jugador ${fase.registro.resultado.ganador}`
                  : undefined
              }
            />

            {fase?.tipo === 'reproduccion' && (
              <div className="reproduccion" role="group" aria-label="Controles de reproducción">
                <button type="button" className="boton boton--peque" onClick={() => partida.moverReproduccion(0)}>
                  ⏮ Inicio
                </button>
                <button
                  type="button"
                  className="boton boton--peque"
                  onClick={() => partida.moverReproduccion(fase.indice - 1)}
                >
                  ◀ Anterior
                </button>
                <button
                  type="button"
                  className="boton boton--peque"
                  onClick={() => partida.alternarReproduccionAutomatica()}
                  aria-pressed={fase.automatica}
                >
                  {fase.automatica ? '⏸ Pausa' : '▶ Automática'}
                </button>
                <button
                  type="button"
                  className="boton boton--peque"
                  onClick={() => partida.moverReproduccion(fase.indice + 1)}
                >
                  Siguiente ▶
                </button>
                <button
                  type="button"
                  className="boton boton--peque"
                  onClick={() => partida.moverReproduccion(fase.registro.movimientos.length)}
                >
                  Final ⏭
                </button>
                <span className="reproduccion__contador">
                  jugada {fase.indice} de {fase.registro.movimientos.length}
                </span>
              </div>
            )}

            {fase?.tipo === 'terminada' && (
              <div className="acciones">
                <button type="button" className="boton" onClick={() => void guardarPartidaTerminada()}>
                  Guardar en el registro
                </button>
                <button type="button" className="boton" onClick={() => partida.reproducir(fase.registro)}>
                  Reproducir
                </button>
                <button type="button" className="boton boton--primario" onClick={() => partida.salirDeReproduccion()}>
                  Nueva partida
                </button>
              </div>
            )}
            {fase?.tipo === 'en-curso' && (
              <div className="acciones">
                <button type="button" className="boton boton--peligro" onClick={() => partida.cancelar()}>
                  Abandonar partida
                </button>
              </div>
            )}
            {fase?.tipo === 'reproduccion' && (
              <div className="acciones">
                <button type="button" className="boton boton--primario" onClick={() => partida.salirDeReproduccion()}>
                  Volver a la configuración
                </button>
              </div>
            )}
          </div>

          <aside>
            <h3 className="panel__titulo">Jugadas y mediciones</h3>
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Jugador</th>
                    <th scope="col">Jugada</th>
                    <th scope="col" className="num">
                      Nodos/sim.
                    </th>
                    <th scope="col" className="num">
                      ms
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {estadoPartida.jugadas.map((jugada, indice) => (
                    <tr key={indice}>
                      <td className="num">{indice + 1}</td>
                      <td>{jugada.jugador === 1 ? '✕' : '◯'}</td>
                      <td>{jugada.notacion}</td>
                      <td className="num">
                        {jugada.estadisticas.nodos !== undefined
                          ? jugada.estadisticas.nodos
                          : jugada.estadisticas.simulaciones !== undefined
                            ? jugada.estadisticas.simulaciones
                            : '—'}
                      </td>
                      <td className="num">{jugada.estadisticas.tiempoMs.toFixed(1)}</td>
                    </tr>
                  ))}
                  {estadoPartida.jugadas.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--texto-suave)' }}>
                        Sin jugadas todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {fase?.tipo === 'terminada' && (
              <p className="parametro__etiqueta" style={{ marginTop: '0.6rem' }}>
                Huella de integridad (no criptográfica): {fase.registro.huella}
                <br />
                La misma semilla reproduce exactamente esta partida en el mismo motor JS.
              </p>
            )}
          </aside>
        </div>
      )}

      {!cliente.disponible && (
        <div className="aviso aviso--info">
          El trabajador web no está disponible en este entorno: los cálculos se ejecutan en el
          hilo principal y la interfaz puede entrecortarse durante las búsquedas largas.
        </div>
      )}

      <button
        type="button"
        className="boton boton--peque"
        onClick={alIrAResultados}
        style={{ marginTop: '0.5rem' }}
      >
        Ver resultados medidos →
      </button>
    </section>
  );
}
