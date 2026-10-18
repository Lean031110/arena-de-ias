'use client';

/**
 * Vista «Plantel de IAs» — fichas del catálogo REAL de agentes del núcleo.
 *
 * No hay agentes preentrenados: el neuronal está pendiente (Fase 2) y se
 * muestra con candado. Los resultados históricos solo provienen de las
 * partidas guardadas en el almacén local del prototipo, contadas aquí en
 * vivo y marcadas como locales. Nombres y avatares personalizados son
 * solo cosmética local.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, MarcaLocal, PanelHUD, DatoEtiquetado } from '@/components/arena/comunes';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { CATALOGO_AGENTES, obtenerDefinicionAgente } from '@/motor-central/agentes/registro';
import type { RegistroPartida } from '@/motor-central/motor/partida';
import { borrarPersona, guardarPersona } from '@/lib/almacen-local';
import { toast } from '@/hooks/use-toast';
import { navegarA } from '@/components/arena/shell/navegacion';
import {
  Brain,
  BrainCircuit,
  Columns3,
  Dices,
  GitCompareArrows,
  Lightbulb,
  Lock,
  Scale,
  Sparkles,
  User,
  X,
} from 'lucide-react';

const ICONO_AGENTE: Record<string, React.ComponentType<{ className?: string }>> = {
  humano: User,
  aleatorio: Dices,
  heuristico: Lightbulb,
  minimax: Columns3,
  mcts: Brain,
  neural: BrainCircuit,
};

const COLOR_AGENTE: Record<string, string> = {
  humano: '#9aacc9',
  aleatorio: '#3ecf8e',
  heuristico: '#6fb3ff',
  minimax: '#e8b64c',
  mcts: '#f2994a',
  neural: '#7cc4ff',
};

const ESTILO_AGENTE: Record<string, string> = {
  humano: 'Intuición humana',
  aleatorio: 'Referencia mínima',
  heuristico: 'Patrones tácticos inmediatos',
  minimax: 'Cálculo exhaustivo con poda',
  mcts: 'Exploración por simulaciones',
  neural: 'Política + valor (pendiente)',
};

interface ResultadoLocal {
  victorias: number;
  empates: number;
  derrotas: number;
  partidas: number;
}

function resultadosLocales(partidas: readonly RegistroPartida[], idAgente: string): ResultadoLocal {
  const propias = partidas.filter(
    (p) => p.agentes[0]?.id === idAgente || p.agentes[1]?.id === idAgente,
  );
  let victorias = 0;
  let empates = 0;
  let derrotas = 0;
  for (const partida of propias) {
    if (partida.resultado === null || partida.validez !== 'verificada') continue;
    if (partida.resultado.tipo === 'empate') {
      empates += 1;
    } else {
      const índice = partida.agentes[0]?.id === idAgente ? 1 : 2;
      if ((partida.resultado.ganador ?? 1) === índice) victorias += 1;
      else derrotas += 1;
    }
  }
  return { victorias, empates, derrotas, partidas: propias.length };
}

function AvatarAgente({ id, tamaño = 40 }: { id: string; tamaño?: number }) {
  const Icono = ICONO_AGENTE[id] ?? Brain;
  const color = COLOR_AGENTE[id] ?? '#9aacc9';
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-lg border"
      style={{ width: tamaño, height: tamaño, borderColor: `${color}55`, background: `${color}18`, color }}
      aria-hidden="true"
    >
      <Icono className="size-1/2" />
    </span>
  );
}

export function VistaPlantel() {
  const almacen = useAlmacen();
  
  const [comparar, setComparar] = React.useState<string[]>([]);
  const [nombreEditable, setNombreEditable] = React.useState('');

  const alternarComparar = (id: string): void => {
    setComparar((previo) =>
      previo.includes(id) ? previo.filter((x) => x !== id) : previo.length < 2 ? [...previo, id] : [previo[1]!, id],
    );
  };

  const agentesComparados = comparar.map((id) => obtenerDefinicionAgente(id));

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Plantel de IAs"
        descripcion="Catálogo real de agentes del motor central con sus niveles, parámetros y estado. Sin «preentrenados» sin artefacto verificable: el neuronal declara su pendencia."
        acciones={<MarcaLocal />}
      />

      {/* Fichas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CATALOGO_AGENTES.map((agente) => {
          const persona = almacen.personas[agente.id];
          const resultados = resultadosLocales(almacen.partidas, agente.id);
          const pendiente = agente.estado === 'pendiente';
          return (
            <div
              key={agente.id}
              className={cn(
                'panel-hud rounded-xl border p-4 transition-colors',
                pendiente ? 'border-border/50 opacity-80' : 'border-border/70 hover:border-acento/40',
              )}
            >
              <div className="flex items-start gap-3">
                <AvatarAgente id={agente.id} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="display-tactico truncate text-sm font-bold text-foreground">
                      {persona?.nombreVisible ?? agente.nombre}
                    </h3>
                    {persona !== undefined && (
                      <span className="etiqueta-hud !text-acento" title="Nombre personalizado local">
                        local
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Nivel {agente.nivel} · {ESTILO_AGENTE[agente.id] ?? '—'}
                  </p>
                </div>
                {pendiente ? (
                  <span className="flex items-center gap-1 rounded-md border border-advertencia/30 bg-advertencia/10 px-1.5 py-1 text-[10px] font-semibold text-advertencia">
                    <Lock className="size-3" aria-hidden="true" /> Fase 2
                  </span>
                ) : agente.estado === 'humano' ? (
                  <span className="rounded-md border border-border bg-muted px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">
                    Humano
                  </span>
                ) : (
                  <span className="rounded-md border border-exito/30 bg-exito/10 px-1.5 py-1 text-[10px] font-semibold text-exito">
                    Disponible
                  </span>
                )}
              </div>

              <p className="mt-2.5 line-clamp-2 min-h-[2.4em] text-[11px] leading-snug text-muted-foreground">
                {agente.descripcion}
              </p>

              <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2.5">
                <DatoEtiquetado etiqueta="Versión del cerebro" mono>
                  {pendiente ? 'sin artefacto' : `v${agente.version}`}
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="Juegos compatibles">todos los implementados</DatoEtiquetado>
                <DatoEtiquetado etiqueta="Estado de carga" mono>
                  {pendiente ? 'no cargable aún' : agente.estado === 'humano' ? 'tú decides' : 'motor local'}
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="Entrenamiento">
                  {pendiente ? 'pendiente (Fase 2)' : 'no aplica (algoritmo clásico)'}
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="Ranking" mono>
                  Sin datos · Fase 4
                </DatoEtiquetado>
                <DatoEtiquetado etiqueta="Historial local" mono>
                  {resultados.partidas === 0
                    ? 'sin partidas'
                    : `${resultados.victorias}V ${resultados.empates}E ${resultados.derrotas}D (${resultados.partidas})`}
                </DatoEtiquetado>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-[11px]">
                      Abrir ficha
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="display-tactico flex items-center gap-2 pr-6">
                        <AvatarAgente id={agente.id} tamaño={28} />
                        {persona?.nombreVisible ?? agente.nombre}
                      </DialogTitle>
                      <DialogDescription className="text-xs leading-relaxed">{agente.descripcion}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[52vh] pr-3">
                      <div className="space-y-3">
                        {agente.parametros.length > 0 ? (
                          <div>
                            <p className="etiqueta-hud mb-1.5">Parámetros validables</p>
                            <ul className="space-y-1.5">
                              {agente.parametros.map((parámetro) => (
                                <li key={parámetro.clave} className="rounded-md border border-border/70 bg-card/50 px-2.5 py-2">
                                  <p className="text-xs font-semibold text-foreground">{parámetro.etiqueta}</p>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">{parámetro.descripcion}</p>
                                  <p className="cifras mt-1 text-[10px] text-texto-tenue">
                                    rango [{parámetro.min} – {parámetro.max}] · paso {parámetro.paso} · defecto {parámetro.defecto}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Este agente no expone parámetros configurables.</p>
                        )}
                        <div>
                          <p className="etiqueta-hud mb-1.5">Partidas locales recientes</p>
                          {resultados.partidas === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Sin partidas en el almacén local. Juega en el simulador y aparecerán aquí.
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {almacen.partidas
                                .filter((p) => p.agentes[0]?.id === agente.id || p.agentes[1]?.id === agente.id)
                                .slice(0, 5)
                                .map((partida) => (
                                  <li key={partida.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                                    <span className="truncate text-muted-foreground">
                                      vs {partida.agentes[0]?.id === agente.id ? partida.agentes[1]?.nombre : partida.agentes[0]?.nombre}
                                    </span>
                                    <span className="cifras shrink-0 text-foreground">
                                      {partida.resultado?.tipo === 'victoria'
                                        ? partida.agentes[(partida.resultado.ganador ?? 1) - 1]?.id === agente.id
                                          ? 'victoria'
                                          : 'derrota'
                                        : partida.resultado?.tipo === 'empate'
                                          ? 'empate'
                                          : 'inválida'}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </div>
                        <div className="rounded-md border border-border/70 bg-card/50 p-2.5">
                          <p className="etiqueta-hud mb-1">Personalización local</p>
                          <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                            Solo cambia nombre visible y color del avatar en este navegador. No crea modelos,
                            partidas ni métricas.
                          </p>
                          <div className="flex gap-1.5">
                            <Input
                              aria-label="Nombre visible"
                              className="h-8 text-xs"
                              placeholder={agente.nombre}
                              value={nombreEditable}
                              onChange={(evento) => setNombreEditable(evento.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 shrink-0 gap-1 text-xs"
                              onClick={() => {
                                guardarPersona(agente.id, {
                                  nombreVisible: nombreEditable.trim() || agente.nombre,
                                  colorAvatar: COLOR_AGENTE[agente.id] ?? '#e8b64c',
                                });
                                toast({ title: 'Personalización guardada', description: 'Aplica solo a este navegador (almacén local).' });
                              }}
                            >
                              <Sparkles className="size-3.5" aria-hidden="true" /> Guardar
                            </Button>
                            {persona !== undefined && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 shrink-0 text-xs"
                                onClick={() => borrarPersona(agente.id)}
                              >
                                <X className="size-3.5" aria-hidden="true" /> Quitar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>

                <Button
                  variant={comparar.includes(agente.id) ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => alternarComparar(agente.id)}
                  disabled={pendiente}
                >
                  <GitCompareArrows className="size-3.5" aria-hidden="true" />
                  {comparar.includes(agente.id) ? 'Quitar' : 'Comparar'}
                </Button>

                {resultados.partidas > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-muted-foreground"
                    onClick={() => navegarA('explorador')}
                  >
                    Consultar partidas
                  </Button>
                )}
              </div>

              {resultados.partidas > 0 && (
                <div className="mt-2.5">
                  <InsigniaProcedencia
                    procedencia={{
                      origen: 'calculo-sobre-registros',
                      metodo: 'Recuento sobre las partidas del almacén local del prototipo ejecutadas con el motor real.',
                      fuente: 'almacen-local-prototipo',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparación */}
      <PanelHUD
        etiqueta="Comparación"
        titulo={agentesComparados.length === 2 ? `${agentesComparados[0]?.nombre} vs ${agentesComparados[1]?.nombre}` : 'Comparador de agentes'}
        acciones={<Scale className="size-3.5 text-muted-foreground" aria-hidden="true" />}
      >
        {agentesComparados.length < 2 ? (
          <EstadoVacio
            compacto
            titulo="Selecciona dos agentes"
            descripcion="Pulsa «Comparar» en las fichas para enfrentar sus definiciones: nivel, parámetros, estilo y resultados locales."
            icono={GitCompareArrows}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {agentesComparados.map((agente) => {
              const resultados = resultadosLocales(almacen.partidas, agente.id);
              return (
                <div key={agente.id} className="rounded-lg border border-border/70 bg-card/50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <AvatarAgente id={agente.id} tamaño={30} />
                    <div>
                      <p className="display-tactico text-xs font-bold text-foreground">{agente.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">Nivel {agente.nivel} · v{agente.version}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <DatoEtiquetado etiqueta="Parámetros" mono>
                      {agente.parametros.length === 0 ? 'ninguno' : agente.parametros.map((p) => p.clave).join(' · ')}
                    </DatoEtiquetado>
                    <DatoEtiquetado etiqueta="Estilo">{ESTILO_AGENTE[agente.id] ?? '—'}</DatoEtiquetado>
                    <DatoEtiquetado etiqueta="Local V/E/D" mono>
                      {resultados.victorias} / {resultados.empates} / {resultados.derrotas}
                    </DatoEtiquetado>
                    <DatoEtiquetado etiqueta="Partidas locales" mono>
                      {resultados.partidas}
                    </DatoEtiquetado>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{agente.descripcion}</p>
                </div>
              );
            })}
            <p className="col-span-full text-center text-[10px] text-muted-foreground">
              Los resultados locales provienen del almacén del prototipo; para comparaciones estadísticas
              rigurosas usa la evaluación con IC de Wilson en «Torneos».
            </p>
          </div>
        )}
      </PanelHUD>
    </div>
  );
}
