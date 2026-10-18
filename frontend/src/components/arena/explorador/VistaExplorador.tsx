'use client';

/**
 * Vista «Búsqueda y repetición».
 *
 * - Estadísticas de búsqueda REALES por jugada: proceden de
 *   RegistroPartida.movimientos[].estadisticas (medidas por el motor).
 * - El árbol de búsqueda completo NO lo expone el núcleo todavía: se
 *   declara la ausencia y se ofrece una estructura sintética de
 *   demostración (identificada prominentemente) para validar el diseño.
 * - Distingue siempre estimación vs resultado comprobado.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, MarcaDemo, PanelHUD } from '@/components/arena/comunes';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { ReproductorRegistro } from '@/components/arena/arena/ReproductorRegistro';
import { formatearDuracion, formatearFecha } from '@/lib/contratos';
import type { RegistroPartida } from '@/motor-central/motor/partida';
import { obtenerDefinicionAgente } from '@/motor-central/agentes/registro';
import { GitBranch, ListOrdered, Network, Play } from 'lucide-react';

/* ─── Árbol sintético de demostración (NO es una búsqueda real) ─────── */

interface NodoDemo {
  notacion: string;
  visitas: number;
  valorMedio: number | null;
  hijos: NodoDemo[];
}

const ÁRBOL_DEMO: NodoDemo = {
  notacion: 'raíz',
  visitas: 4200,
  valorMedio: 0.12,
  hijos: [
    {
      notacion: 'b2',
      visitas: 1900,
      valorMedio: 0.31,
      hijos: [
        { notacion: 'a1', visitas: 640, valorMedio: 0.18, hijos: [] },
        { notacion: 'c3', visitas: 810, valorMedio: 0.42, hijos: [] },
        { notacion: 'd2', visitas: 450, valorMedio: -0.05, hijos: [] },
      ],
    },
    {
      notacion: 'a1',
      visitas: 1200,
      valorMedio: 0.08,
      hijos: [
        { notacion: 'b1', visitas: 700, valorMedio: 0.14, hijos: [] },
        { notacion: 'c2', visitas: 500, valorMedio: -0.02, hijos: [] },
      ],
    },
    { notacion: 'c3', visitas: 1100, valorMedio: -0.21, hijos: [] },
  ],
};

function NodoArbol({ nodo, profundidad = 0 }: { nodo: NodoDemo; profundidad?: number }) {
  const [abierto, setAbierto] = React.useState(profundidad < 1);
  const proporción = nodo.visitas / ÁRBOL_DEMO.visitas;
  return (
    <li className="relative">
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]',
          profundidad === 0 ? 'border-acento/40 bg-acento/10' : 'border-border/60 bg-card/40',
        )}
        style={{ marginLeft: profundidad * 18 }}
      >
        {nodo.hijos.length > 0 ? (
          <button
            type="button"
            className="cifras size-4 shrink-0 rounded border border-border text-[9px] leading-none text-muted-foreground hover:text-foreground"
            aria-label={abierto ? `Contraer ${nodo.notacion}` : `Expandir ${nodo.notacion}`}
            aria-expanded={abierto}
            onClick={() => setAbierto((previo) => !previo)}
          >
            {abierto ? '−' : '+'}
          </button>
        ) : (
          <span className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="cifras w-9 shrink-0 font-bold text-foreground">{nodo.notacion}</span>
        <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="block h-full rounded-full bg-faccion-b" style={{ width: `${Math.max(4, proporción * 100)}%` }} />
        </span>
        <span className="cifras shrink-0 text-[10px] text-muted-foreground">{nodo.visitas} vis.</span>
        {nodo.valorMedio !== null && (
          <span
            className={cn(
              'cifras ml-auto shrink-0 text-[10px] font-semibold',
              nodo.valorMedio > 0.05 ? 'text-exito' : nodo.valorMedio < -0.05 ? 'text-peligro' : 'text-muted-foreground',
            )}
          >
            {nodo.valorMedio >= 0 ? '+' : ''}
            {nodo.valorMedio.toFixed(2)}
          </span>
        )}
      </div>
      {abierto && nodo.hijos.length > 0 && (
        <ul className="mt-1 space-y-1">
          {nodo.hijos.map((hijo) => (
            <NodoArbol key={hijo.notacion} nodo={hijo} profundidad={profundidad + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ─── Vista ─────────────────────────────────────────────────────────── */

export function VistaExplorador() {
  const almacen = useAlmacen();
  const [idSeleccionado, setIdSeleccionado] = React.useState<string | null>(almacen.partidas[0]?.id ?? null);
  const [demoVisible, setDemoVisible] = React.useState(false);

  const registro = React.useMemo<RegistroPartida | null>(
    () => almacen.partidas.find((p) => p.id === idSeleccionado) ?? null,
    [almacen.partidas, idSeleccionado],
  );

  const presupuesto = React.useMemo(() => {
    if (registro === null) return null;
    const límites = registro.agentes.map((agente) => agente.config);
    const consumos = registro.resumenAgentes.map((resumen) => ({
      nodos: resumen.nodosTotales ?? null,
      simulaciones: resumen.simulacionesTotales ?? null,
      tiempoMs: resumen.tiempoTotalMs,
      agotado: resumen.presupuestoAgotado,
    }));
    return { límites, consumos };
  }, [registro]);

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Explorador de búsqueda y repetición"
        descripcion="Estadísticas de búsqueda medidas por el motor para cada jugada, repeticiones depurables y trazabilidad del presupuesto. El árbol completo por jugada llegará con la integración."
      />

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Lista de partidas */}
        <PanelHUD etiqueta="Almacén local" titulo="Partidas registradas">
          {almacen.partidas.length === 0 ? (
            <EstadoVacio
              compacto
              titulo="Sin partidas"
              descripcion="Juega una partida en el simulador para poder explorar sus estadísticas de búsqueda reales."
              icono={Play}
            />
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <ul className="space-y-1">
                {almacen.partidas.map((partida) => (
                  <li key={partida.id}>
                    <button
                      type="button"
                      onClick={() => setIdSeleccionado(partida.id)}
                      className={cn(
                        'w-full rounded-md border px-2.5 py-1.5 text-left transition-colors',
                        idSeleccionado === partida.id
                          ? 'border-acento/40 bg-acento/10'
                          : 'border-transparent hover:bg-secondary/70',
                      )}
                    >
                      <p className="truncate text-[11px] font-medium text-foreground">
                        {partida.agentes[0]?.nombre} vs {partida.agentes[1]?.nombre}
                      </p>
                      <p className="cifras text-[10px] text-muted-foreground">
                        {partida.juego.id} · {partida.movimientos.length} jugadas · {formatearFecha(partida.fecha)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </PanelHUD>

        <div className="space-y-4">
          {registro === null ? (
            <PanelHUD etiqueta="Reproducción" titulo="Ninguna partida seleccionada">
              <EstadoVacio
                titulo="Sin registros que explorar"
                descripcion="Las estadísticas de búsqueda (nodos, simulaciones, profundidad, tiempo, presupuesto agotado) se extraen de partidas reales guardadas localmente."
                icono={ListOrdered}
              />
            </PanelHUD>
          ) : (
            <>
              <PanelHUD
                etiqueta="Repetición depurable"
                titulo={`${registro.agentes[0]?.nombre} vs ${registro.agentes[1]?.nombre}`}
                acciones={
                  <span className="cifras text-[10px] text-muted-foreground">
                    semilla {registro.semilla} · {registro.validez}
                  </span>
                }
              >
                <ReproductorRegistro registro={registro} compacto />
              </PanelHUD>

              {/* Estadísticas por jugada */}
              <PanelHUD etiqueta="Registro real de búsqueda" titulo="Estadísticas por jugada">
                <div className="overflow-hidden rounded-md border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8 text-[10px] uppercase tracking-wider">#</TableHead>
                        <TableHead className="h-8 text-[10px] uppercase tracking-wider">Jug</TableHead>
                        <TableHead className="h-8 text-[10px] uppercase tracking-wider">Notación</TableHead>
                        <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">Nodos</TableHead>
                        <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">Simul.</TableHead>
                        <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">Prof.</TableHead>
                        <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">Tiempo</TableHead>
                        <TableHead className="h-8 text-center text-[10px] uppercase tracking-wider">Agotado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registro.movimientos.map((movimiento) => (
                        <TableRow key={movimiento.indice} className="text-[11px]">
                          <TableCell className="cifras py-1.5">{movimiento.indice + 1}</TableCell>
                          <TableCell className="py-1.5">
                            <span
                              className={cn(
                                'inline-block size-2 rounded-full',
                                movimiento.jugador === 1 ? 'bg-faccion-a' : 'bg-faccion-b',
                              )}
                              aria-label={`Jugador ${movimiento.jugador}`}
                            />
                          </TableCell>
                          <TableCell className="cifras py-1.5 font-semibold">{movimiento.notacion}</TableCell>
                          <TableCell className="cifras py-1.5 text-right text-muted-foreground">
                            {movimiento.estadisticas.nodos?.toLocaleString('es-ES') ?? '—'}
                          </TableCell>
                          <TableCell className="cifras py-1.5 text-right text-muted-foreground">
                            {movimiento.estadisticas.simulaciones?.toLocaleString('es-ES') ?? '—'}
                          </TableCell>
                          <TableCell className="cifras py-1.5 text-right text-muted-foreground">
                            {movimiento.estadisticas.profundidad ?? '—'}
                          </TableCell>
                          <TableCell className="cifras py-1.5 text-right text-muted-foreground">
                            {formatearDuracion(movimiento.estadisticas.tiempoMs)}
                          </TableCell>
                          <TableCell className="py-1.5 text-center">
                            {movimiento.estadisticas.presupuestoAgotado === true ? (
                              <span className="text-[10px] font-semibold text-advertencia">sí</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">no</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <InsigniaProcedencia
                    procedencia={{
                      origen: 'medicion-directa',
                      metodo: 'EstadisticasBusqueda medidas por el motor durante la partida (nodos/simulaciones contadas, tiempo con performance.now).',
                      fuente: 'almacen-local-prototipo',
                      identificador: registro.id,
                    }}
                    compacta={false}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Presencia de «—» = el agente no reporta esa métrica (p. ej. heurístico no cuenta nodos).
                  </p>
                </div>
              </PanelHUD>

              {/* Presupuesto */}
              {presupuesto !== null && (
                <PanelHUD etiqueta="Trazabilidad" titulo="Presupuesto consumido por bando">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {registro.agentes.map((agente, índice) => {
                      const límite = presupuesto.límites[índice] ?? {};
                      const consumo = presupuesto.consumos[índice];
                      const definición = obtenerDefinicionAgente(agente.id);
                      return (
                        <div key={agente.id + índice} className="rounded-lg border border-border/70 bg-card/50 p-3">
                          <p className="display-tactico mb-1.5 text-xs font-semibold text-foreground">
                            {agente.nombre} <span className="cifras text-[10px] text-muted-foreground">v{agente.version}</span>
                          </p>
                          <div className="space-y-1">
                            {definición.parametros.map((parámetro) => (
                              <div key={parámetro.clave} className="flex justify-between gap-2 text-[11px]">
                                <span className="text-muted-foreground">{parámetro.etiqueta} configurado</span>
                                <span className="cifras text-foreground">
                                  {String(límite[parámetro.clave] ?? parámetro.defecto)}
                                </span>
                              </div>
                            ))}
                            {consumo?.nodos !== null && consumo?.nodos !== undefined && (
                              <div className="flex justify-between gap-2 text-[11px]">
                                <span className="text-muted-foreground">nodos totales</span>
                                <span className="cifras text-foreground">{consumo.nodos.toLocaleString('es-ES')}</span>
                              </div>
                            )}
                            {consumo?.simulaciones !== null && consumo?.simulaciones !== undefined && (
                              <div className="flex justify-between gap-2 text-[11px]">
                                <span className="text-muted-foreground">simulaciones totales</span>
                                <span className="cifras text-foreground">{consumo.simulaciones.toLocaleString('es-ES')}</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-2 text-[11px]">
                              <span className="text-muted-foreground">tiempo total</span>
                              <span className="cifras text-foreground">{formatearDuracion(consumo?.tiempoMs ?? 0)}</span>
                            </div>
                            <div className="flex justify-between gap-2 text-[11px]">
                              <span className="text-muted-foreground">presupuesto agotado</span>
                              <span className={cn('text-[11px] font-semibold', consumo?.agotado ? 'text-advertencia' : 'text-exito')}>
                                {consumo?.agotado ? 'en alguna jugada' : 'nunca'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PanelHUD>
              )}
            </>
          )}

          {/* Árbol de búsqueda */}
          <PanelHUD
            etiqueta="Árbol de búsqueda"
            titulo="Exploración por nodo"
            acciones={
              demoVisible ? <MarcaDemo /> : undefined
            }
          >
            {!demoVisible ? (
              <EstadoVacio
                titulo="El núcleo no expone aún el árbol por jugada"
                descripcion="El motor central publica por jugada estadísticas agregadas (nodos, simulaciones, profundidad, tiempo), no el árbol de nodos con visitas y valores. Pendiente de integración. Puedes cargar una estructura sintética para validar el diseño de esta vista."
                icono={GitBranch}
                accion={{ etiqueta: 'Cargar estructura de ejemplo (demostración)', alPulsar: () => setDemoVisible(true) }}
              />
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-faccion-b/40 bg-faccion-b/[0.07] px-3 py-2">
                  <MarcaDemo />
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                    Esta estructura es <strong>sintética</strong>: existe solo para validar el diseño visual del
                    explorador. No procede de ninguna búsqueda real y sus números no describen a ningún agente.
                    Las «visitas relativas» ilustran cómo se representará la distribución de exploración.
                  </p>
                </div>
                <ScrollArea className="max-h-72 pr-3">
                  <ul className="space-y-1">
                    <NodoArbol nodo={ÁRBOL_DEMO} />
                  </ul>
                </ScrollArea>
                <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => setDemoVisible(false)}>
                  Ocultar demostración
                </Button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Network className="size-3.5 shrink-0" aria-hidden="true" />
              Cuando exista, cada nodo mostrará: visitas, valor medio, profundidad, perspectiva y eventos
              tácticos identificados — todo con procedencia del registro real.
            </div>
          </PanelHUD>
        </div>
      </div>
    </div>
  );
}
