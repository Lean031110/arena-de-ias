'use client';

/**
 * Vista «Simulador de partidas».
 *
 * Ejecuta partidas REALES del motor central (juegos + agentes vendorizados)
 * con controles de reproducción en vivo, historial, candidatos y
 * estadísticas de búsqueda. Partidas y evaluaciones se guardan en el
 * almacén LOCAL del prototipo, jamás se presentan como registros del
 * núcleo central.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, MarcaLocal, PanelHUD } from '@/components/arena/comunes';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { CATALOGO_JUEGOS, juegosImplementados, obtenerJuego } from '@/motor-central/juegos/registro';
import { agentesDisponibles, configPorDefecto, obtenerDefinicionAgente } from '@/motor-central/agentes/registro';
import type { ConfigAgentePartida, RegistroPartida } from '@/motor-central/motor/partida';
import type { MovimientoConcreto, VistaTablero } from '@/motor-central/motor/tipos';
import { formatearDuracion, formatearFecha } from '@/lib/contratos';
import { guardarPartidaLocal } from '@/lib/almacen-local';
import { toast } from '@/hooks/use-toast';
import { CorredorPartida, calcularCandidatos, type JugadaVisible } from './corredor';
import { Tablero } from './Tablero';
import { ReproductorRegistro } from './ReproductorRegistro';
import {
  Cpu,
  Dices,
  History,
  ListOrdered,
  Pause,
  Play,
  Radar as RadarIcon,
  Square,
  StepForward,
} from 'lucide-react';

/* ─── Configuración de un bando ─────────────────────────────────────── */

interface ConfigBando {
  id: string;
  config: Record<string, number | boolean>;
}

function SelectorBando({
  titulo,
  color,
  valor,
  onChange,
  bloqueado,
}: {
  titulo: string;
  color: 'a' | 'b';
  valor: ConfigBando;
  onChange: (valor: ConfigBando) => void;
  bloqueado: boolean;
}) {
  const definicion = obtenerDefinicionAgente(valor.id);
  const opciones = agentesDisponibles();

  const cambiarAgente = (id: string): void => {
    onChange({ id, config: configPorDefecto(id) });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span
            className={cn('size-2.5 rounded-full', color === 'a' ? 'bg-faccion-a' : 'bg-faccion-b')}
            aria-hidden="true"
          />
          {titulo}
        </Label>
        <span className="cifras text-[10px] text-muted-foreground">v{definicion.version}</span>
      </div>
      <Select value={valor.id} onValueChange={cambiarAgente} disabled={bloqueado}>
        <SelectTrigger className="h-8 text-xs" aria-label={`Agente de ${titulo}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((agente) => (
            <SelectItem key={agente.id} value={agente.id} className="text-xs">
              {agente.nombre} · nivel {agente.nivel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {definicion.parametros.length > 0 && (
        <div className="space-y-1.5">
          {definicion.parametros.map((parametro) => (
            <div key={parametro.clave} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Label htmlFor={`${titulo}-${parametro.clave}`} className="truncate text-[11px] text-muted-foreground" title={parametro.descripcion}>
                {parametro.etiqueta}
              </Label>
              <Input
                id={`${titulo}-${parametro.clave}`}
                type="number"
                min={parametro.min}
                max={parametro.max}
                step={parametro.paso}
                disabled={bloqueado}
                className="cifras h-7 w-24 border-border/70 bg-background/60 text-right text-xs"
                value={String(valor.config[parametro.clave] ?? parametro.defecto)}
                onChange={(evento) => {
                  const numero = Number(evento.target.value);
                  if (Number.isFinite(numero)) {
                    onChange({ ...valor, config: { ...valor.config, [parametro.clave]: numero } });
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
      <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{definicion.descripcion}</p>
    </div>
  );
}

/* ─── Estadísticas acumuladas por bando ────────────────────────────── */

interface ResumenBando {
  jugadas: number;
  nodos: number | null;
  simulaciones: number | null;
  profundidadMaxima: number | null;
  tiempoTotalMs: number;
  presupuestoAgotado: number;
}

function acumular(jugadas: readonly JugadaVisible[], jugador: 1 | 2): ResumenBando {
  const propias = jugadas.filter((jugada) => jugada.jugador === jugador);
  return {
    jugadas: propias.length,
    nodos: propias.some((j) => j.estadisticas.nodos !== undefined)
      ? propias.reduce((total, j) => total + (j.estadisticas.nodos ?? 0), 0)
      : null,
    simulaciones: propias.some((j) => j.estadisticas.simulaciones !== undefined)
      ? propias.reduce((total, j) => total + (j.estadisticas.simulaciones ?? 0), 0)
      : null,
    profundidadMaxima: propias.some((j) => j.estadisticas.profundidad !== undefined)
      ? Math.max(...propias.map((j) => j.estadisticas.profundidad ?? 0))
      : null,
    tiempoTotalMs: propias.reduce((total, j) => total + j.estadisticas.tiempoMs, 0),
    presupuestoAgotado: propias.filter((j) => j.estadisticas.presupuestoAgotado === true).length,
  };
}

function TarjetaBando({
  titulo,
  nombre,
  config,
  resumen,
}: {
  titulo: string;
  nombre: string;
  config: ConfigBando;
  resumen: ResumenBando;
}) {
  const definicion = obtenerDefinicionAgente(config.id);
  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="etiqueta-hud">{titulo}</p>
        <span className="cifras text-[10px] text-muted-foreground">{resumen.jugadas} jugadas</span>
      </div>
      <p className="display-tactico truncate text-xs font-semibold text-foreground">{nombre}</p>
      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        {resumen.nodos !== null && (
          <p className="cifras flex justify-between">
            <span>nodos</span>
            <span className="text-foreground">{resumen.nodos.toLocaleString('es-ES')}</span>
          </p>
        )}
        {resumen.simulaciones !== null && (
          <p className="cifras flex justify-between">
            <span>simulaciones</span>
            <span className="text-foreground">{resumen.simulaciones.toLocaleString('es-ES')}</span>
          </p>
        )}
        {resumen.profundidadMaxima !== null && (
          <p className="cifras flex justify-between">
            <span>profundidad máx.</span>
            <span className="text-foreground">{resumen.profundidadMaxima}</span>
          </p>
        )}
        <p className="cifras flex justify-between">
          <span>tiempo total</span>
          <span className="text-foreground">{formatearDuracion(resumen.tiempoTotalMs)}</span>
        </p>
        <p className="cifras flex justify-between">
          <span>presupuesto agotado</span>
          <span className={resumen.presupuestoAgotado > 0 ? 'text-advertencia' : 'text-foreground'}>
            {resumen.presupuestoAgotado} / {resumen.jugadas}
          </span>
        </p>
        {definicion.parametros.length > 0 && (
          <p className="cifras truncate pt-1 text-[10px] text-texto-tenue" title={definicion.parametros.map((p) => `${p.clave}=${String(config.config[p.clave] ?? p.defecto)}`).join(' · ')}>
            {definicion.parametros.map((p) => `${p.clave}=${String(config.config[p.clave] ?? p.defecto)}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Vista principal ───────────────────────────────────────────────── */

const VELOCIDADES = [
  { valor: 0.5, ms: 1800, etiqueta: '0.5×' },
  { valor: 1, ms: 900, etiqueta: '1×' },
  { valor: 2, ms: 450, etiqueta: '2×' },
  { valor: 4, ms: 220, etiqueta: '4×' },
] as const;

export function VistaArena() {
  const almacen = useAlmacen();

  // Configuración
  const [juegoId, setJuegoId] = React.useState('tres-en-raya-3');
  const [bando1, setBando1] = React.useState<ConfigBando>({ id: 'humano', config: {} });
  const [bando2, setBando2] = React.useState<ConfigBando>({ id: 'heuristico', config: {} });
  const [semilla, setSemilla] = React.useState(() => Math.floor(Math.random() * 1_000_000_000));

  // Estado en vivo
  const [corriendo, setCorriendo] = React.useState(false);
  const [pausada, setPausada] = React.useState(false);
  const [velocidad, setVelocidad] = React.useState(1);
  const [vista, setVista] = React.useState<VistaTablero | null>(null);
  const [estadoVivo, setEstadoVivo] = React.useState<unknown>(null);
  const [jugadas, setJugadas] = React.useState<readonly JugadaVisible[]>([]);
  const [pensando, setPensando] = React.useState<{ jugador: 1 | 2; humano: boolean } | null>(null);
  const [finalizada, setFinalizada] = React.useState(false);
  const [mostrarAnalisis, setMostrarAnalisis] = React.useState(true);
  const [repeticion, setRepeticion] = React.useState<RegistroPartida | null>(null);

  const corredorRef = React.useRef<CorredorPartida | null>(null);
  const juego = React.useMemo(() => obtenerJuego(juegoId), [juegoId]);
  const juegosPendientes = CATALOGO_JUEGOS.filter((entrada) => entrada.estado === 'pendiente');

  const nombreAgente = (config: ConfigBando): string => obtenerDefinicionAgente(config.id).nombre;

  const reiniciarEstado = React.useCallback(() => {
    setVista(null);
    setJugadas([]);
    setPensando(null);
    setFinalizada(false);
    setPausada(false);
  }, []);

  const detener = React.useCallback(() => {
    corredorRef.current?.compuerta.cancelar();
    corredorRef.current = null;
    setCorriendo(false);
    setPensando(null);
  }, []);

  const iniciar = React.useCallback(() => {
    detener();
    setRepeticion(null);
    reiniciarEstado();
    const config = {
      juegoId,
      semilla,
      agentes: [
        { id: bando1.id, config: bando1.config },
        { id: bando2.id, config: bando2.config },
      ] as const,
    };
    const corredor = new CorredorPartida(config, {
      onVista: (nuevaVista) => {
        setVista(nuevaVista);
        setEstadoVivo(corredor.obtenerEstadoActual());
      },
      onPensando: (jugador, humano) => setPensando(jugador === null ? null : { jugador, humano }),
      onJugada: (jugada, vistaTras) => {
        setJugadas((previas) => [...previas, jugada]);
        setVista(vistaTras);
      },
      onFinal: (registro) => {
        // La vista terminal es la última emitida por onJugada; aquí solo se registra.
        guardarPartidaLocal(registro);
        setFinalizada(true);
        toast({
          title: 'Partida finalizada',
          description:
            (registro.resultado?.tipo === 'victoria'
              ? `Victoria de ${registro.agentes[(registro.resultado.ganador ?? 1) - 1]?.nombre ?? '?'}`
              : registro.resultado?.tipo === 'empate'
                ? 'Empate'
                : 'Partida inválida') + ' · guardada en el almacén local del prototipo',
        });
      },
      onAbortada: () => {
        /* el observador detuvo la partida: no se registra */
      },
    });
    corredor.compuerta.velocidadMs = VELOCIDADES.find((v) => v.valor === velocidad)?.ms ?? 900;
    corredorRef.current = corredor;
    setCorriendo(true);
    void corredor
      .ejecutar()
      .catch((error: unknown) => {
        toast({
          title: 'La partida falló',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      })
      .finally(() => {
        setCorriendo(false);
        setPensando(null);
      });
  }, [bando1, bando2, detener, velocidad, reiniciarEstado, semilla, setVista, juegoId, juego]);

  // El registro recién guardado llega por el almacén (registroUltimo) y
  // alimenta el rótulo de resultado tras finalizar.
  const registroUltimo = almacen.partidas[0];

  const aplicarVelocidad = (valor: number): void => {
    setVelocidad(valor);
    const ms = VELOCIDADES.find((v) => v.valor === valor)?.ms ?? 900;
    if (corredorRef.current !== null) corredorRef.current.compuerta.velocidadMs = ms;
  };

  const alternarPausa = (): void => {
    const corredor = corredorRef.current;
    if (corredor === null) return;
    if (pausada) {
      corredor.compuerta.reanudar();
      setPausada(false);
    } else {
      corredor.compuerta.pausar();
      setPausada(true);
    }
  };

  const paso = (): void => {
    const corredor = corredorRef.current;
    if (corredor === null) return;
    setPausada(true);
    corredor.compuerta.paso();
  };

  const jugadaHumana = (movimiento: MovimientoConcreto): void => {
    corredorRef.current?.jugarHumano(movimiento);
  };

  const validarMovimiento = React.useCallback(
    (movimiento: MovimientoConcreto): { valido: boolean; motivo?: string } => {
      const estado = corredorRef.current?.obtenerEstadoActual();
      if (estado === null || estado === undefined) return { valido: false, motivo: 'sin partida en curso' };
      return juego.validarMovimiento(estado, movimiento);
    },
    [juego],
  );

  const candidatos = React.useMemo(() => {
    if (vista === null || finalizada || !corriendo) return [];
    if (estadoVivo === null) return [];
    if (!(pensando?.humano === true || mostrarAnalisis)) return [];
    return calcularCandidatos(juego, estadoVivo);
  }, [vista, finalizada, corriendo, estadoVivo, pensando, mostrarAnalisis, juego]);

  const resumen1 = React.useMemo(() => acumular(jugadas, 1), [jugadas]);
  const resumen2 = React.useMemo(() => acumular(jugadas, 2), [jugadas]);

  const resultadoTexto =
    registroUltimo !== undefined && finalizada && jugadas.length > 0
      ? registroUltimo.resultado === null
        ? 'Partida inválida'
        : registroUltimo.resultado.tipo === 'victoria'
          ? `Victoria de ${registroUltimo.agentes[(registroUltimo.resultado.ganador ?? 1) - 1]?.nombre ?? `J${registroUltimo.resultado.ganador ?? 1}`}`
          : 'Empate'
      : null;

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Simulador de partidas"
        descripcion="Juegos por turnos del motor central con agentes reales. La legalidad, el resultado y las estadísticas los decide el motor; la interfaz solo observa y reproduce."
        acciones={<MarcaLocal />}
      />

      <Alert className="border-acento/30 bg-acento/[0.06]">
        <Cpu className="size-4 text-acento" aria-hidden="true" />
        <AlertTitle className="text-sm">Motor local vendorizado — reglas y agentes reales</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          Las partidas se ejecutan con el código real del núcleo (mismas reglas, semillas y presupuestos), pero en este
          navegador. Se guardan en el almacén local del prototipo; el registro experimental central no está conectado.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* ── Columna de configuración ── */}
        <div className="space-y-4">
          <PanelHUD etiqueta="Configuración" titulo="Partida nueva">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Juego</Label>
                <Select
                  value={juegoId}
                  onValueChange={(valor) => {
                    setJuegoId(valor);
                    detener();
                    reiniciarEstado();
                  }}
                  disabled={corriendo}
                >
                  <SelectTrigger className="text-xs" aria-label="Juego">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {juegosImplementados().map((entrada) => (
                      <SelectItem key={entrada.id} value={entrada.id} className="text-xs">
                        {entrada.nombre} · v{entrada.juego?.reglasVersion ?? '?'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {juego.descripcion}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {juegosPendientes.length} variantes pendientes en el núcleo (Fase 5):{' '}
                  <span className="text-texto-tenue">{juegosPendientes.slice(0, 4).map((j) => j.nombre).join(', ')}…</span>
                </p>
              </div>

              <SelectorBando titulo="Jugador 1" color="a" valor={bando1} onChange={setBando1} bloqueado={corriendo} />
              <SelectorBando titulo="Jugador 2" color="b" valor={bando2} onChange={setBando2} bloqueado={corriendo} />

              <div className="space-y-1.5">
                <Label htmlFor="semilla-partida" className="text-xs font-semibold">
                  Semilla
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="semilla-partida"
                    type="number"
                    min={0}
                    className="cifras h-8 text-xs"
                    value={semilla}
                    disabled={corriendo}
                    onChange={(evento) => setSemilla(Math.max(0, Number(evento.target.value) || 0))}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label="Semilla aleatoria"
                    disabled={corriendo}
                    onClick={() => setSemilla(Math.floor(Math.random() * 1_000_000_000))}
                  >
                    <Dices className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  La misma semilla reproduce la misma partida (motor determinista documentado).
                </p>
              </div>

              <Button className="w-full font-semibold" onClick={iniciar}>
                <Play className="size-4" aria-hidden="true" />
                {corriendo ? 'Reiniciar partida' : 'Iniciar partida'}
              </Button>
            </div>
          </PanelHUD>

          <PanelHUD etiqueta="Almacén local del prototipo" titulo="Repeticiones disponibles">
            {almacen.partidas.length === 0 ? (
              <EstadoVacio
                compacto
                titulo="Sin partidas registradas"
                descripcion="Juega una partida y quedará disponible aquí para repetirla (almacén local del prototipo)."
              />
            ) : (
              <ScrollArea className="h-52 pr-3">
                <ul className="space-y-1">
                  {almacen.partidas.map((partida) => (
                    <li key={partida.id}>
                      <button
                        type="button"
                        onClick={() => {
                          detener();
                          setRepeticion(partida);
                        }}
                        className={cn(
                          'w-full rounded-md border px-2.5 py-1.5 text-left transition-colors',
                          repeticion?.id === partida.id
                            ? 'border-acento/40 bg-acento/10'
                            : 'border-transparent hover:bg-secondary/70',
                        )}
                      >
                        <p className="truncate text-[11px] font-medium text-foreground">
                          {partida.agentes[0]?.nombre} vs {partida.agentes[1]?.nombre}
                        </p>
                        <p className="cifras text-[10px] text-muted-foreground">
                          {partida.juego.id} · {partida.movimientos.length} jugadas ·{' '}
                          {partida.resultado?.tipo === 'victoria'
                            ? `gana J${partida.resultado.ganador}`
                            : partida.resultado?.tipo === 'empate'
                              ? 'empate'
                              : 'inválida'}{' '}
                          · {formatearFecha(partida.fecha)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </PanelHUD>
        </div>

        {/* ── Columna central: tablero ── */}
        <div className="space-y-4">
          {repeticion !== null ? (
            <PanelHUD
              etiqueta="Repetición"
              titulo={`Partida registrada · ${repeticion.agentes[0]?.nombre} vs ${repeticion.agentes[1]?.nombre}`}
              acciones={
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRepeticion(null)}>
                  Cerrar repetición
                </Button>
              }
            >
              <ReproductorRegistro registro={repeticion} />
            </PanelHUD>
          ) : (
            <PanelHUD
              etiqueta="Terreno de juego"
              titulo={juego.nombre}
              acciones={
                <span className="cifras text-[10px] text-muted-foreground">
                  v{juego.reglasVersion} · {juego.familia === 'celda' ? 'por celda' : 'por columna'}
                </span>
              }
            >
              <div className="space-y-3">
                {vista === null ? (
                  <EstadoVacio
                    titulo="Sin partida en curso"
                    descripcion="Configura los bandos y pulsa «Iniciar partida». El motor ejecuta las reglas; tú observas, pausas, avanzas o juegas si un bando es humano."
                    icono={RadarIcon}
                    compacto
                  />
                ) : (
                  <Tablero
                    juego={juego}
                    vista={vista}
                    aceptaEntrada={pensando?.humano === true}
                    onJugada={jugadaHumana}
                    validar={validarMovimiento}
                  />
                )}

                {/* Franja de estado y controles */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2.5">
                  {corriendo ? (
                    <>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={alternarPausa}>
                        {pausada ? (
                          <>
                            <Play className="size-3.5" aria-hidden="true" /> Reanudar
                          </>
                        ) : (
                          <>
                            <Pause className="size-3.5" aria-hidden="true" /> Pausar
                          </>
                        )}
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={paso}>
                        <StepForward className="size-3.5" aria-hidden="true" /> Paso
                      </Button>
                      <ToggleGroup
                        type="single"
                        value={String(velocidad)}
                        onValueChange={(valor) => valor !== '' && aplicarVelocidad(Number(valor))}
                        variant="outline"
                        size="sm"
                        aria-label="Velocidad de reproducción"
                        className="h-8"
                      >
                        {VELOCIDADES.map((v) => (
                          <ToggleGroupItem key={v.valor} value={String(v.valor)} className="h-7 px-2 text-[11px]">
                            {v.etiqueta}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-8 gap-1.5 text-peligro hover:text-peligro"
                        onClick={() => {
                          detener();
                          reiniciarEstado();
                        }}
                      >
                        <Square className="size-3.5" aria-hidden="true" /> Detener
                      </Button>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Controles disponibles durante la partida.</p>
                  )}
                  <span className="cifras order-first w-full text-[11px] text-muted-foreground sm:order-none sm:w-auto sm:ml-auto sm:mr-0">
                    {pensando !== null
                      ? pensando.humano
                        ? `Turno J${pensando.jugador} · esperando tu jugada`
                        : `J${pensando.jugador} pensando…`
                      : resultadoTexto !== null
                        ? resultadoTexto
                        : `${jugadas.length} jugadas`}
                  </span>
                </div>

                {resultadoTexto !== null && (
                  <p
                    className={cn(
                      'rounded-md border px-3 py-2 text-center text-sm font-semibold',
                      registroUltimo?.resultado?.tipo === 'victoria'
                        ? 'border-exito/40 bg-exito/10 text-exito'
                        : 'border-advertencia/40 bg-advertencia/10 text-advertencia',
                    )}
                  >
                    {resultadoTexto} · registro guardado en el almacén local del prototipo
                  </p>
                )}
              </div>
            </PanelHUD>
          )}
        </div>

        {/* ── Columna derecha: estado de agentes ── */}
        <div className="space-y-4">
          <PanelHUD etiqueta="Estado de los agentes" titulo="Bandos en liza">
            <div className="space-y-2.5">
              <TarjetaBando titulo="Jugador 1" nombre={nombreAgente(bando1)} config={bando1} resumen={resumen1} />
              <TarjetaBando titulo="Jugador 2" nombre={nombreAgente(bando2)} config={bando2} resumen={resumen2} />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Agentes genéricos del núcleo: compatibles con todos los juegos implementados. Estadísticas medidas por
                el motor durante esta partida.
              </p>
            </div>
          </PanelHUD>

          <PanelHUD
            etiqueta="Análisis de posición"
            titulo="Jugadas candidatas"
            acciones={
              <div className="flex items-center gap-1.5">
                <Switch
                  id="analisis-posicion"
                  checked={mostrarAnalisis}
                  onCheckedChange={setMostrarAnalisis}
                  aria-label="Mostrar análisis de posición"
                  className="scale-90"
                />
                <Label htmlFor="analisis-posicion" className="text-[10px] text-muted-foreground">
                  Auto
                </Label>
              </div>
            }
          >
            {candidatos.length === 0 ? (
              <EstadoVacio
                compacto
                titulo="Sin candidatos"
                descripcion="Jugadas legales del motor con su evaluación heurística. Se muestran en tu turno (humano) o con el análisis activado."
                icono={ListOrdered}
              />
            ) : (
              <ScrollArea className="h-56 pr-3">
                <ul className="space-y-1" aria-label="Jugadas candidatas">
                  {candidatos
                    .slice()
                    .sort((x, y) => y.valorEstimado - x.valorEstimado)
                    .map((candidato) => (
                      <li key={candidato.notacion}>
                        <button
                          type="button"
                          disabled={pensando?.humano !== true}
                          onClick={() => jugadaHumana(candidato.movimiento)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors',
                            pensando?.humano === true && 'hover:border-acento/40 hover:bg-acento/10',
                          )}
                        >
                          <span className="cifras w-9 shrink-0 text-center text-[11px] font-bold text-foreground">
                            {candidato.notacion}
                          </span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <span
                              className="block h-full rounded-full bg-faccion-a"
                              style={{ width: `${Math.round(((candidato.valorEstimado + 1) / 2) * 100)}%` }}
                            />
                          </span>
                          <span className="cifras w-12 shrink-0 text-right text-[10px] text-muted-foreground">
                            {candidato.valorEstimado >= 0 ? '+' : ''}
                            {candidato.valorEstimado.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </ScrollArea>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <InsigniaProcedencia
                procedencia={{
                  origen: 'estimacion',
                  metodo: 'juego.evaluar() del motor: heurística posicional en [-1, 1]. No es política neuronal.',
                  fuente: 'motor-local-vendorizado',
                  commitMotor: 'a908319',
                }}
                compacta={false}
              />
            </div>
          </PanelHUD>

          <PanelHUD etiqueta="Cronología" titulo="Historial de jugadas" acciones={<History className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
            {jugadas.length === 0 ? (
              <EstadoVacio compacto titulo="Sin jugadas" descripcion="El historial aparecerá conforme avance la partida." />
            ) : (
              <ScrollArea className="h-48 pr-3">
                <ol className="space-y-1" aria-label="Historial de jugadas">
                  {jugadas
                    .slice()
                    .reverse()
                    .map((jugada) => (
                      <li key={jugada.indice} className="flex items-baseline gap-2 text-[11px]">
                        <span className="cifras w-8 shrink-0 text-texto-tenue">#{jugada.indice + 1}</span>
                        <span className={cn('size-2 shrink-0 translate-y-[-1px] rounded-full', jugada.jugador === 1 ? 'bg-faccion-a' : 'bg-faccion-b')} aria-hidden="true" />
                        <span className="cifras font-semibold text-foreground">{jugada.notacion}</span>
                        <span className="cifras ml-auto text-right text-[10px] text-muted-foreground">
                          {jugada.estadisticas.nodos !== undefined && `${jugada.estadisticas.nodos}n · `}
                          {jugada.estadisticas.simulaciones !== undefined && `${jugada.estadisticas.simulaciones}s · `}
                          {formatearDuracion(jugada.estadisticas.tiempoMs)}
                        </span>
                      </li>
                    ))}
                </ol>
              </ScrollArea>
            )}
          </PanelHUD>
        </div>
      </div>
    </div>
  );
}
