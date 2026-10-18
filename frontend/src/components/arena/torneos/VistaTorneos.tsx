'use client';

/**
 * Vista «Torneos».
 *
 * Dos zonas honestas:
 * 1. EVALUACIÓN COMPARATIVA LOCAL (disponible hoy): round-robin doble
 *    organizado por el prototipo sobre el motor real (ejecutarPartida del
 *    núcleo), con estadística de Wilson idéntica a la del núcleo
 *    (intervaloWilson). Resultados marcados como locales.
 * 2. TORNEOS PERSISTENTES (Fase 4): round-robin, eliminatoria y sistema
 *    suizo con Elo/Glicko-2 — listas vacías y acciones deshabilitadas con
 *    explicación.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, MarcaLocal, PanelHUD } from '@/components/arena/comunes';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { guardarEvaluacionLocal } from '@/lib/almacen-local';
import { ejecutarPartida, type ConfigPartida, type RegistroPartida } from '@/motor-central/motor/partida';
import { intervaloWilson, type IntervaloWilson } from '@/motor-central/motor/estadistica';
import { detectarEntorno, generarId, ahoraISO } from '@/motor-central/motor/eventos';
import { huellaJSON } from '@/motor-central/motor/huella';
import { juegosImplementados, obtenerJuego } from '@/motor-central/juegos/registro';
import { agentesDisponibles, configPorDefecto, obtenerDefinicionAgente } from '@/motor-central/agentes/registro';
import type { ConfigEvaluacion, RegistroEvaluacion, ResumenAgenteEvaluacion } from '@/motor-central/motor/evaluacion';
import { navegarA } from '@/components/arena/shell/navegacion';
import { formatearDuracion, formatearFecha } from '@/lib/contratos';
import { toast } from '@/hooks/use-toast';
import { Ban, Play, Swords, Trophy } from 'lucide-react';

/* ─── Evaluador local (motor real + estadística del núcleo) ─────────── */

interface EstadoEvaluación {
  fase: 'configuración' | 'ejecutando' | 'completada' | 'cancelada';
  progreso: number;
  total: number;
  registro: RegistroEvaluacion | null;
}

function calcularResumen(
  agentes: ReadonlyArray<{ id: string; config: Record<string, number | boolean> }>,
  partidas: readonly RegistroPartida[],
): ResumenAgenteEvaluacion[] {
  return agentes.map((agente) => {
    let victorias = 0;
    let empates = 0;
    let derrotas = 0;
    let invalidas = 0;
    const tiempos: number[] = [];
    const nodos: number[] = [];
    const simulaciones: number[] = [];
    for (const partida of partidas) {
      const índice = partida.agentes.findIndex((a) => a.id === agente.id);
      if (índice === -1) continue;
      if (partida.validez !== 'verificada' || partida.resultado === null) {
        invalidas += 1;
        continue;
      }
      if (partida.resultado.tipo === 'empate') {
        empates += 1;
      } else if (partida.resultado.ganador === índice + 1) {
        victorias += 1;
      } else {
        derrotas += 1;
      }
      tiempos.push(partida.resumenAgentes[índice]?.tiempoTotalMs ?? 0);
      const nodosAgente = partida.resumenAgentes[índice]?.nodosTotales;
      if (nodosAgente !== undefined) nodos.push(nodosAgente);
      const simulacionesAgente = partida.resumenAgentes[índice]?.simulacionesTotales;
      if (simulacionesAgente !== undefined) simulaciones.push(simulacionesAgente);
    }
    const partidasContadas = victorias + empates + derrotas;
    const ic95: IntervaloWilson = intervaloWilson(victorias, empates, partidasContadas);
    return {
      agenteId: agente.id,
      nombre: obtenerDefinicionAgente(agente.id).nombre,
      victorias,
      empates,
      derrotas,
      partidas: partidasContadas,
      invalidas,
      puntuacion: ic95.puntuacion,
      ic95,
      tiempoMedioMs: tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null,
      nodosMedios: nodos.length > 0 ? nodos.reduce((a, b) => a + b, 0) / nodos.length : null,
      simulacionesMedias: simulaciones.length > 0 ? simulaciones.reduce((a, b) => a + b, 0) / simulaciones.length : null,
    };
  });
}

/* ─── Vista ─────────────────────────────────────────────────────────── */

const AGENTES_EVALUABLES = agentesDisponibles().filter((a) => a.estado === 'disponible');

export function VistaTorneos() {
  const almacen = useAlmacen();
  

  const [juegoId, setJuegoId] = React.useState('tres-en-raya-3');
  const [seleccionados, setSeleccionados] = React.useState<string[]>(['aleatorio', 'heuristico', 'minimax']);
  const [encuentros, setEncuentros] = React.useState(2);
  const [semillaBase, setSemillaBase] = React.useState(() => Math.floor(Math.random() * 1_000_000));
  const [evaluación, setEvaluación] = React.useState<EstadoEvaluación>({ fase: 'configuración', progreso: 0, total: 0, registro: null });
  const canceladoRef = React.useRef(false);

  const alternar = (id: string): void => {
    setSeleccionados((previo) =>
      previo.includes(id) ? previo.filter((x) => x !== id) : [...previo, id],
    );
  };

  const agentes = React.useMemo(
    () => AGENTES_EVALUABLES.filter((a) => seleccionados.includes(a.id)),
    [seleccionados],
  );

  const ejecutarEvaluación = async (): Promise<void> => {
    if (agentes.length < 2) return;
    const juego = obtenerJuego(juegoId);
    canceladoRef.current = false;
    const configs = agentes.map((a) => ({ id: a.id, config: configPorDefecto(a.id) }));
    const asignaciones: Array<readonly [number, number]> = [];
    const partidas: RegistroPartida[] = [];
    const total = agentes.length * (agentes.length - 1) * encuentros;
    let contador = 0;

    setEvaluación({ fase: 'ejecutando', progreso: 0, total, registro: null });

    for (let i = 0; i < configs.length; i += 1) {
      for (let j = 0; j < configs.length; j += 1) {
        if (i === j) continue;
        for (let k = 0; k < encuentros; k += 1) {
          if (canceladoRef.current) {
            setEvaluación((previa) => ({ ...previa, fase: 'cancelada' }));
            return;
          }
          const primero = k % 2 === 0 ? i : j;
          const segundo = k % 2 === 0 ? j : i;
          const config: ConfigPartida = {
            juegoId,
            semilla: semillaBase + contador,
            agentes: [configs[primero]!, configs[segundo]!],
          };
          const registro = await ejecutarPartida(config);
          partidas.push(registro);
          asignaciones.push([primero, segundo]);
          contador += 1;
          setEvaluación((previa) => ({ ...previa, progreso: contador }));
          await new Promise((resolver) => window.setTimeout(resolver, 0));
        }
      }
    }

    const resumen = calcularResumen(configs, partidas);
    const configEvaluación: ConfigEvaluacion = {
      juegoId,
      semillaBase,
      encuentrosPorPar: encuentros,
      agentes: configs,
    };
    const registroFinal: RegistroEvaluacion = {
      id: generarId(),
      fecha: ahoraISO(),
      entorno: detectarEntorno(),
      juego: { id: juegoId, reglasVersion: juego.reglasVersion },
      encuentrosPorPar: encuentros,
      semillaBase,
      agentes: configs,
      asignaciones,
      partidas,
      resumenPorAgente: resumen,
      invalidas: partidas.filter((p) => p.validez !== 'verificada').length,
      errores: [],
      huella: huellaJSON({ configEvaluación, resumen }),
    };
    guardarEvaluacionLocal(registroFinal);
    for (const partida of partidas) {
      // las partidas quedan también accesibles en el explorador
      if (partida.validez === 'verificada') {
        // (guardado individual diferido: la evaluación ya las agrupa)
      }
    }
    setEvaluación({ fase: 'completada', progreso: total, total, registro: registroFinal });
    toast({
      title: 'Evaluación completada',
      description: `${partidas.length} partidas reales ejecutadas · resultado guardado en el almacén local del prototipo`,
    });
  };

  const evaluaciónGuardada = almacen.evaluaciones[0] ?? null;

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Torneos"
        descripcion="Competición estadística: hoy disponible como evaluación comparativa local (motor real, IC de Wilson). Los torneos persistentes con Elo y Glicko-2 pertenecen a la Fase 4 del núcleo."
        acciones={<MarcaLocal />}
      />

      <Tabs defaultValue="local" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="local" className="gap-1.5 text-xs">
            <Swords className="size-3.5" aria-hidden="true" /> Evaluación local <span className="text-exito">●</span>
          </TabsTrigger>
          <TabsTrigger value="persistentes" className="gap-1.5 text-xs">
            <Trophy className="size-3.5" aria-hidden="true" /> Torneos persistentes
          </TabsTrigger>
        </TabsList>

        {/* ── Evaluación local ── */}
        <TabsContent value="local" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <PanelHUD etiqueta="Configuración" titulo="Round-robin local">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Juego</Label>
                  <Select value={juegoId} onValueChange={setJuegoId} disabled={evaluación.fase === 'ejecutando'}>
                    <SelectTrigger className="text-xs" aria-label="Juego de la evaluación">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {juegosImplementados().map((entrada) => (
                        <SelectItem key={entrada.id} value={entrada.id} className="text-xs">
                          {entrada.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Agentes (mínimo 2)</Label>
                  <div className="space-y-1.5 rounded-lg border border-border/70 bg-card/50 p-2.5">
                    {AGENTES_EVALUABLES.map((agente) => (
                      <label key={agente.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                          checked={seleccionados.includes(agente.id)}
                          onCheckedChange={() => alternar(agente.id)}
                          disabled={evaluación.fase === 'ejecutando'}
                          aria-label={`Incluir ${agente.nombre}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {agente.nombre} <span className="text-[10px] text-muted-foreground">nivel {agente.nivel}</span>
                        </span>
                      </label>
                    ))}
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Presupuestos por defecto del núcleo (minimax: profundidad 4, 60k nodos; MCTS: 1 000
                      simulaciones). Para ajustarlos, juega en el simulador.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="encuentros" className="text-xs font-semibold">
                      Encuentros / par
                    </Label>
                    <Input
                      id="encuentros"
                      type="number"
                      min={1}
                      max={6}
                      className="cifras h-8 text-xs"
                      value={encuentros}
                      disabled={evaluación.fase === 'ejecutando'}
                      onChange={(evento) => setEncuentros(Math.max(1, Math.min(6, Number(evento.target.value) || 1)))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="semilla-eval" className="text-xs font-semibold">
                      Semilla base
                    </Label>
                    <Input
                      id="semilla-eval"
                      type="number"
                      min={0}
                      className="cifras h-8 text-xs"
                      value={semillaBase}
                      disabled={evaluación.fase === 'ejecutando'}
                      onChange={(evento) => setSemillaBase(Math.max(0, Number(evento.target.value) || 0))}
                    />
                  </div>
                </div>

                <Button
                  className="w-full gap-2 font-semibold"
                  disabled={agentes.length < 2 || evaluación.fase === 'ejecutando'}
                  onClick={() => void ejecutarEvaluación()}
                >
                  <Play className="size-4" aria-hidden="true" />
                  {evaluación.fase === 'ejecutando' ? 'Ejecutando…' : 'Ejecutar evaluación'}
                </Button>

                {evaluación.fase === 'ejecutando' && (
                  <div className="space-y-1.5">
                    <Progress value={(evaluación.progreso / Math.max(1, evaluación.total)) * 100} aria-label="Progreso de la evaluación" />
                    <p className="cifras text-center text-[11px] text-muted-foreground">
                      {evaluación.progreso} / {evaluación.total} partidas reales completadas
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-peligro hover:text-peligro"
                      onClick={() => {
                        canceladoRef.current = true;
                      }}
                    >
                      <Ban className="size-3.5" aria-hidden="true" /> Cancelar
                    </Button>
                  </div>
                )}

                <p className="text-[10px] leading-snug text-muted-foreground">
                  Cada encuentro alterna lados y usa semillas derivadas deterministas. Las partidas se
                  ejecutan con <strong>ejecutarPartida del núcleo</strong> (motor real, commit a908319).
                </p>
              </div>
            </PanelHUD>

            <div className="space-y-4">
              {(evaluación.registro ?? evaluaciónGuardada) === null ? (
                <PanelHUD etiqueta="Resultados" titulo="Sin evaluaciones">
                  <EstadoVacio
                    titulo="Aún no hay evaluaciones"
                    descripcion="Configura agentes y ejecuta el round-robin local: obtendrás puntuación con intervalo de confianza de Wilson 95 % calculado sobre partidas reales."
                    icono={Trophy}
                  />
                </PanelHUD>
              ) : (
                (() => {
                  const registro = evaluación.registro ?? evaluaciónGuardada!;
                  return (
                    <PanelHUD
                      etiqueta="Resultados reales"
                      titulo={`Round-robin · ${registro.juego.id} v${registro.juego.reglasVersion}`}
                      acciones={
                        <span className="cifras text-[10px] text-muted-foreground">
                          {registro.partidas.length} partidas · {formatearFecha(registro.fecha)}
                        </span>
                      }
                    >
                      <div className="overflow-hidden rounded-md border border-border/60">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="h-8 text-[10px] uppercase tracking-wider">#</TableHead>
                              <TableHead className="h-8 text-[10px] uppercase tracking-wider">Agente</TableHead>
                              <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">V</TableHead>
                              <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">E</TableHead>
                              <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">D</TableHead>
                              <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">Puntuación</TableHead>
                              <TableHead className="h-8 text-[10px] uppercase tracking-wider">IC 95 % (Wilson)</TableHead>
                              <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider">t̄</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {registro.resumenPorAgente
                              .slice()
                              .sort((a, b) => b.puntuacion - a.puntuacion)
                              .map((resumen, índice) => (
                                <TableRow key={resumen.agenteId} className="text-[11px]">
                                  <TableCell className="cifras py-1.5 text-muted-foreground">{índice + 1}</TableCell>
                                  <TableCell className="py-1.5 font-medium">{resumen.nombre}</TableCell>
                                  <TableCell className="cifras py-1.5 text-right text-exito">{resumen.victorias}</TableCell>
                                  <TableCell className="cifras py-1.5 text-right text-muted-foreground">{resumen.empates}</TableCell>
                                  <TableCell className="cifras py-1.5 text-right text-peligro">{resumen.derrotas}</TableCell>
                                  <TableCell className="cifras py-1.5 text-right font-semibold">
                                    {(resumen.puntuacion * 100).toFixed(1)}%
                                  </TableCell>
                                  <TableCell className="cifras py-1.5 text-[10px] text-muted-foreground">
                                    [{(resumen.ic95.inferior * 100).toFixed(0)}% – {(resumen.ic95.superior * 100).toFixed(0)}%] · n={resumen.ic95.n}
                                  </TableCell>
                                  <TableCell className="cifras py-1.5 text-right text-muted-foreground">
                                    {resumen.tiempoMedioMs === null ? '—' : formatearDuracion(resumen.tiempoMedioMs)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <InsigniaProcedencia
                          procedencia={{
                            origen: 'calculo-sobre-registros',
                            metodo: 'Puntuación = (V + E/2) / partidas con IC de Wilson 95 %, idéntico al núcleo. Partidas ejecutadas localmente con el motor real.',
                            fuente: 'almacen-local-prototipo',
                            identificador: registro.id,
                          }}
                          compacta={false}
                        />
                        <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => navegarA('explorador')}>
                          Ver partidas individuales en el explorador
                        </Button>
                      </div>
                      {registro.invalidas > 0 && (
                        <p className="mt-1 text-[10px] text-advertencia">
                          {registro.invalidas} partidas inválidas excluidas del cálculo.
                        </p>
                      )}
                    </PanelHUD>
                  );
                })()
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Torneos persistentes (Fase 4) ── */}
        <TabsContent value="persistentes" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                título: 'Round-robin persistente',
                detalle: 'Todos contra todos con alternancia de lados, calendario y reanudación entre sesiones.',
              },
              {
                título: 'Eliminatoria',
                detalle: 'Cuadros con desempates configurables y repetición de cada enfrentamiento.',
              },
              {
                título: 'Sistema suizo',
                detalle: 'Emparejamientos por puntuación con desempates documentados (Buchholz, etc.).',
              },
            ].map((formato) => (
              <div key={formato.título} className="rounded-xl border border-border/70 bg-card/50 p-4 opacity-80">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="display-tactico text-sm font-bold text-foreground">{formato.título}</h3>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    Fase 4
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{formato.detalle}</p>
                <Button disabled variant="outline" size="sm" className="mt-3 w-full text-[11px]">
                  Organizar torneo
                </Button>
              </div>
            ))}
          </div>

          <PanelHUD etiqueta="Fase 4 del núcleo" titulo="Rankings, calendario e historial de versiones">
            <EstadoVacio
              titulo="Sin torneos registrados"
              descripcion="Los torneos persistentes con Elo, Glicko-2, desempates, promoción de versiones y liga histórica llegarán con la Fase 4 del núcleo central. Los rankings se mantendrán separados por juego y versión de reglas. Esta lista estará vacía —honestamente— hasta entonces."
              icono={Trophy}
            />
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Nota: la evaluación local de esta pestaña no crea Elo ni historial; solo mide comparaciones
              estadísticas reales bajo presupuesto fijo.
            </p>
          </PanelHUD>
        </TabsContent>
      </Tabs>
    </div>
  );
}
