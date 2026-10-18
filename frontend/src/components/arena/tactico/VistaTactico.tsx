'use client';

/**
 * Vista «Simulador táctico» — SANDBOX VISUAL.
 *
 * Terreno de observación del simulador competitivo futuro. El contrato
 * (arena-tactica-2d v0.1.0-sandbox) es propio del prototipo: cuando el
 * núcleo central implemente la simulación, este adaptador se sustituye
 * por el real sin cambiar la interfaz. Las IAs de las facciones son
 * conductas heurísticas de demostración, no modelos entrenados.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, MarcaDemo, PanelHUD, DatoEtiquetado } from '@/components/arena/comunes';
import { SimulacionTactica } from '@/lib/sandbox/tactico/nucleo';
import { SIMULACION_TACTICA, type FaccionTactica, type SimulationState, type OrdenTactica } from '@/lib/contratos';
import { RendererMapa } from './RendererMapa';
import { Flag, Gauge, Pause, Play, RotateCcw, Shield, Swords, Trophy } from 'lucide-react';

const VELOCIDADES_TACTICO = [
  { valor: 0.5, ms: 1600, etiqueta: '0.5×' },
  { valor: 1, ms: 800, etiqueta: '1×' },
  { valor: 2, ms: 400, etiqueta: '2×' },
  { valor: 4, ms: 200, etiqueta: '4×' },
] as const;

const NOMBRE_ROL: Record<string, string> = {
  infanteria: 'Infantería',
  explorador: 'Explorador',
  francotirador: 'Francotirador',
  blindado: 'Blindado',
};

function TarjetaFacción({ facción, activa }: { facción: FaccionTactica; activa: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', activa ? 'border-acento/40 bg-acento/[0.06]' : 'border-border/70 bg-card/50')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="display-tactico flex items-center gap-1.5 text-xs font-bold" style={{ color: facción.color }}>
          <span className="size-2.5 rounded-full" style={{ background: facción.color }} aria-hidden="true" />
          {facción.nombre}
        </span>
        {activa && <span className="etiqueta-hud !text-acento">Bajo tu control</span>}
      </div>
      <div className="space-y-1">
        <DatoEtiquetado etiqueta="Créditos" mono>
          {facción.creditos}
        </DatoEtiquetado>
        <DatoEtiquetado etiqueta="Unidades" mono>
          {facción.unidadesVivas}
        </DatoEtiquetado>
        <DatoEtiquetado etiqueta="Zonas" mono>
          {facción.zonasControladas}
        </DatoEtiquetado>
      </div>
    </div>
  );
}

export function VistaTactico() {
  const simulación = React.useMemo(() => new SimulacionTactica(), []);
  const estado = React.useSyncExternalStore(
    React.useCallback((oyente) => simulación.suscribir(oyente), [simulación]),
    React.useCallback(() => simulación.obtenerEstado(), [simulación]),
  );

  const [velocidad, setVelocidad] = React.useState(1);
  const [selección, setSelección] = React.useState<{ tipo: 'unidad' | 'edificio'; id: string } | null>(null);
  const [controlAuriga, setControlAuriga] = React.useState(false);

  // Reloj de ticks
  React.useEffect(() => {
    if (estado.estado !== 'ejecutando') return;
    const ms = VELOCIDADES_TACTICO.find((v) => v.valor === velocidad)?.ms ?? 800;
    const temporizador = window.setInterval(() => simulación.avanzarTick(), ms);
    return () => window.clearInterval(temporizador);
  }, [estado.estado, velocidad, simulación]);

  React.useEffect(() => {
    simulación.establecerControl('auriga', controlAuriga);
  }, [controlAuriga, simulación]);

  React.useEffect(() => {
    return () => simulación.despachar({ tipo: 'pausar' });
  }, [simulación]);

  const unidadSeleccionada =
    selección?.tipo === 'unidad' ? estado.unidades.find((u) => u.id === selección.id) ?? null : null;
  const edificioSeleccionado =
    selección?.tipo === 'edificio' ? estado.edificios.find((e) => e.id === selección.id) ?? null : null;

  const órdenes = React.useMemo<readonly OrdenTactica[]>(
    () => (unidadSeleccionada !== null ? simulación.ordenesDisponibles(unidadSeleccionada.id) : []),
    [unidadSeleccionada, simulación, estado],
  );

  const celdasAlcanzables = React.useMemo(() => {
    const celdas = new Set<string>();
    if (controlAuriga && unidadSeleccionada?.faccion === 'auriga') {
      for (const orden of órdenes) {
        if (orden.tipo === 'mover' && orden.filaObjetivo !== undefined && orden.columnaObjetivo !== undefined) {
          celdas.add(`${orden.filaObjetivo},${orden.columnaObjetivo}`);
        }
      }
    }
    return celdas;
  }, [órdenes, controlAuriga, unidadSeleccionada]);

  const objetivosAtacables = React.useMemo(() => {
    const ids = new Set<string>();
    if (controlAuriga && unidadSeleccionada?.faccion === 'auriga') {
      for (const orden of órdenes) {
        if (orden.tipo === 'atacar' && orden.objetivoId !== undefined) ids.add(orden.objetivoId);
      }
    }
    return ids;
  }, [órdenes, controlAuriga, unidadSeleccionada]);

  const emitirOrden = (orden: OrdenTactica): void => {
    simulación.despachar({ tipo: 'orden', orden });
  };

  const facciónAuriga = estado.facciones[0];
  const facciónVector = estado.facciones[1];

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Simulador táctico 2D"
        descripcion="Terreno del simulador competitivo futuro: dos facciones, economía, capturas y objetivos. Contrato propio del prototipo, separado del motor central de juegos por turnos."
        acciones={<MarcaDemo />}
      />

      <Alert className="border-faccion-b/30 bg-faccion-b/[0.06]">
        <Gauge className="size-4 text-faccion-b" aria-hidden="true" />
        <AlertTitle className="text-sm">
          Sandbox visual · {SIMULACION_TACTICA.id} v{SIMULACION_TACTICA.versionReglas}
        </AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          La lógica de combate, economía y movimiento vive en el núcleo de simulación del prototipo
          (separado del renderizador). Las decisiones de las facciones son <strong>heurísticas de
          demostración</strong>; no son agentes entrenados del motor central ni resultados medidos.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Columna del mapa */}
        <div className="space-y-4">
          <PanelHUD
            etiqueta="Terreno"
            titulo={`Tick ${estado.tick} · ${estado.estado}`}
            acciones={
              <span className="cifras text-[10px] text-muted-foreground">
                {estado.unidades.length} unidades · {estado.edificios.length} edificios
              </span>
            }
          >
            <RendererMapa
              estado={estado}
              selección={selección}
              alSeleccionar={setSelección}
              celdasAlcanzables={celdasAlcanzables}
              objetivosAtacables={objetivosAtacables}
              facciónControlada={controlAuriga ? 'auriga' : null}
              alClicCelda={() => undefined}
            />

            {/* Controles de simulación */}
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2.5">
                {estado.estado === 'finalizada' ? (
                  <Button size="sm" className="gap-1.5" onClick={() => simulación.despachar({ tipo: 'reiniciar' })}>
                    <RotateCcw className="size-3.5" aria-hidden="true" /> Nueva simulación
                  </Button>
                ) : estado.estado === 'ejecutando' ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => simulación.despachar({ tipo: 'pausar' })}>
                    <Pause className="size-3.5" aria-hidden="true" /> Pausar
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1.5" onClick={() => simulación.despachar({ tipo: estado.tick === 0 ? 'iniciar' : 'reanudar' })}>
                    <Play className="size-3.5" aria-hidden="true" /> {estado.tick === 0 ? 'Iniciar' : 'Reanudar'}
                  </Button>
                )}
                <div className="flex items-center gap-1" role="group" aria-label="Velocidad de simulación">
                  {VELOCIDADES_TACTICO.map((v) => (
                    <Button
                      key={v.valor}
                      variant={velocidad === v.valor ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      aria-pressed={velocidad === v.valor}
                      onClick={() => setVelocidad(v.valor)}
                    >
                      {v.etiqueta}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto gap-1.5 text-peligro hover:text-peligro"
                  onClick={() => simulación.despachar({ tipo: 'reiniciar' })}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Reiniciar
                </Button>
              </div>

              {/* Línea de tiempo */}
              <div className="rounded-lg border border-border/70 bg-card/60 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="etiqueta-hud">Reproducción temporal</span>
                  <span className="cifras text-[10px] text-muted-foreground">
                    {estado.instantaneas} instantáneas · desliza para retroceder
                  </span>
                </div>
                <Slider
                  value={[Math.min(estado.tick, simulación.tickActual)]}
                  min={0}
                  max={Math.max(1, simulación.tickActual)}
                  step={1}
                  aria-label="Tick reproducido"
                  onValueChange={([valor]) => simulación.despachar({ tipo: 'saltar-a-tick', tick: valor ?? 0 })}
                />
              </div>

              {estado.ganador !== null && (
                <p className="flex items-center justify-center gap-2 rounded-md border border-exito/40 bg-exito/10 px-3 py-2 text-sm font-semibold text-exito">
                  <Trophy className="size-4" aria-hidden="true" />
                  Victoria de {estado.ganador === 'auriga' ? facciónAuriga?.nombre : facciónVector?.nombre} en el tick {estado.tick}
                </p>
              )}
              {estado.estado === 'finalizada' && estado.ganador === null && (
                <p className="rounded-md border border-advertencia/40 bg-advertencia/10 px-3 py-2 text-center text-sm font-semibold text-advertencia">
                  Límite de ticks alcanzado sin vencedor
                </p>
              )}
            </div>
          </PanelHUD>

          {/* Facciones */}
          <div className="grid gap-3 sm:grid-cols-2">
            <TarjetaFacción facción={facciónAuriga!} activa={controlAuriga} />
            <TarjetaFacción facción={facciónVector!} activa={false} />
          </div>
        </div>

        {/* Columna de información */}
        <div className="space-y-4">
          <PanelHUD etiqueta="Intervención" titulo="Control de facción">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="control-auriga" className="text-xs font-medium text-foreground">
                    Controlar Áuriga manualmente
                  </Label>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    Detiene la IA de demostración de esa facción y te cede sus órdenes.
                  </p>
                </div>
                <Switch
                  id="control-auriga"
                  checked={controlAuriga}
                  onCheckedChange={setControlAuriga}
                  aria-label="Controlar manualmente la facción Áuriga"
                />
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Al activarlo, selecciona unidades áureas en el mapa: verás sus celdas alcanzables (ámbar) y
                objetivos a distancia (rojo). Véctor sigue gobernado por la heurística.
              </p>
            </div>
          </PanelHUD>

          {/* Panel contextual */}
          {unidadSeleccionada !== null ? (
            <PanelHUD etiqueta="Unidad seleccionada" titulo={`${NOMBRE_ROL[unidadSeleccionada.rol] ?? unidadSeleccionada.rol} · ${unidadSeleccionada.id}`}>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <DatoEtiquetado etiqueta="Facción">
                    {unidadSeleccionada.faccion === 'auriga' ? 'Áuriga' : 'Véctor'}
                  </DatoEtiquetado>
                  <DatoEtiquetado etiqueta="PV" mono>
                    {unidadSeleccionada.puntosVida} / {unidadSeleccionada.puntosVidaMax}
                  </DatoEtiquetado>
                  <DatoEtiquetado etiqueta="Ataque · rango" mono>
                    {unidadSeleccionada.ataque} · {unidadSeleccionada.rango}
                  </DatoEtiquetado>
                  <DatoEtiquetado etiqueta="Acción" mono>
                    {unidadSeleccionada.puntosAccion} / {unidadSeleccionada.puntosAccionMax} PA
                  </DatoEtiquetado>
                  <DatoEtiquetado etiqueta="Posición" mono>
                    ({unidadSeleccionada.fila}, {unidadSeleccionada.columna})
                  </DatoEtiquetado>
                </div>

                <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                  <p className="etiqueta-hud">Órdenes según las reglas del sandbox</p>
                  {controlAuriga && unidadSeleccionada.faccion === 'auriga' ? (
                    órdenes.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Sin acciones disponibles este tick.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {órdenes
                          .filter((o) => o.tipo !== 'mover')
                          .map((orden) => (
                            <Button
                              key={`${orden.tipo}-${orden.objetivoId ?? 'x'}`}
                              variant={orden.tipo === 'atacar' ? 'destructive' : 'outline'}
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px]"
                              onClick={() => emitirOrden(orden)}
                            >
                              {orden.tipo === 'atacar' && <Swords className="size-3" aria-hidden="true" />}
                              {orden.tipo === 'capturar' && <Flag className="size-3" aria-hidden="true" />}
                              {orden.tipo === 'mantener' && <Shield className="size-3" aria-hidden="true" />}
                              {orden.tipo === 'atacar' ? `Atacar ${orden.objetivoId}` : orden.tipo === 'capturar' ? `Capturar ${orden.objetivoId}` : 'Mantener'}
                            </Button>
                          ))}
                        <p className="w-full text-[10px] text-muted-foreground">
                          Movimiento: pulsa una celda ámbar del mapa.
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Activa el control de Áuriga para emitir órdenes con esta unidad. En modo observación
                      solo se inspecciona.
                    </p>
                  )}
                </div>
              </div>
            </PanelHUD>
          ) : edificioSeleccionado !== null ? (
            <PanelHUD etiqueta="Edificio seleccionado" titulo={`${edificioSeleccionado.tipo} · ${edificioSeleccionado.id}`}>
              <div className="space-y-1">
                <DatoEtiquetado etiqueta="Facción">
                  {edificioSeleccionado.faccion === 'auriga' ? 'Áuriga' : edificioSeleccionado.faccion === 'vector' ? 'Véctor' : 'Neutral'}
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="PV" mono>
                  {edificioSeleccionado.puntosVida} / {edificioSeleccionado.puntosVidaMax}
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="Posición" mono>
                  ({edificioSeleccionado.fila}, {edificioSeleccionado.columna})
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="Efecto">
                  {edificioSeleccionado.tipo === 'base'
                    ? 'Produce unidades · +2 créditos/tick'
                    : edificioSeleccionado.tipo === 'generador'
                      ? '+3 créditos/tick al dueño'
                      : edificioSeleccionado.tipo === 'nodo-recursos'
                        ? '+5 créditos/tick al dueño · capturable'
                        : 'Condición de dominio · capturable'}
                </DatoEtiquetado>
              </div>
            </PanelHUD>
          ) : (
            <PanelHUD etiqueta="Contexto" titulo="Nada seleccionado">
              <EstadoVacio
                compacto
                titulo="Selecciona en el mapa"
                descripcion="Pulsa una unidad o un edificio para inspeccionarlos y ver las órdenes que permiten las reglas del sandbox."
                icono={Swords}
              />
            </PanelHUD>
          )}

          {/* Registro de eventos */}
          <PanelHUD etiqueta="Crónica" titulo="Registro de eventos">
            {estado.eventos.length === 0 ? (
              <EstadoVacio compacto titulo="Sin eventos" descripcion="Inicia la simulación y la crónica se escribirá tick a tick." />
            ) : (
              <ScrollArea className="h-56 pr-3">
                <ol className="space-y-1.5">
                  {estado.eventos.slice(0, 40).map((evento, índice) => (
                    <li key={`${evento.tick}-${índice}`} className="flex items-baseline gap-2 text-[11px]">
                      <span className="cifras w-10 shrink-0 text-texto-tenue">t{evento.tick}</span>
                      <span
                        className={cn(
                          'size-1.5 shrink-0 translate-y-[-1px] rounded-full',
                          evento.faccion === 'auriga' ? 'bg-faccion-a' : evento.faccion === 'vector' ? 'bg-faccion-b' : 'bg-muted-foreground/60',
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-muted-foreground">{evento.descripcion}</span>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </PanelHUD>

          <PanelHUD etiqueta="Contrato" titulo="Integración futura">
            <div className="space-y-1">
              <DatoEtiquetado etiqueta="Identificador">{SIMULACION_TACTICA.id}</DatoEtiquetado>
              <DatoEtiquetado etiqueta="Versión de reglas" mono>
                {SIMULACION_TACTICA.versionReglas}
              </DatoEtiquetado>
              <DatoEtiquetado etiqueta="Esquema observación">{SIMULACION_TACTICA.esquemaObservacion}</DatoEtiquetado>
              <DatoEtiquetado etiqueta="Acciones" mono>
                {SIMULACION_TACTICA.catalogoAcciones.join(' · ')}
              </DatoEtiquetado>
            </div>
            <div className="mt-2">
              <InsigniaProcedencia
                procedencia={{
                  origen: 'sintetico-demo',
                  metodo: 'Sandbox visual: la simulación corre localmente con reglas v0.1.0 propias; no son resultados del motor central.',
                  fuente: 'demo-sandbox',
                }}
                compacta={false}
              />
            </div>
          </PanelHUD>
        </div>
      </div>
    </div>
  );
}
