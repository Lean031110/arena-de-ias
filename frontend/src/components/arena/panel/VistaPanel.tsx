'use client';

/**
 * Vista «Panel de control»: estado del sistema.
 *
 * Cada tarjeta declara su servicio y su procedencia; las verificaciones de
 * integridad se CALCULAN en vivo (prueba de humo del motor vendorizado,
 * diagnóstico del navegador), no se decoran con datos inventados.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  EncabezadoVista,
  EstadoVacio,
  InsigniaEstado,
  InsigniaProcedencia,
  MarcaLocal,
  PanelHUD,
  TarjetaMetrica,
} from '@/components/arena/comunes';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { diagnosticarNavegador, obtenerServicios, verificarMotor, type Verificacion } from '@/lib/servicios';
import { juegosImplementados, CATALOGO_JUEGOS } from '@/motor-central/juegos/registro';
import { agentesDisponibles } from '@/motor-central/agentes/registro';
import { formatearFecha, type EstadoServicio } from '@/lib/contratos';
import { MOTOR_ORIGEN } from '@/motor-central/version';
import { navegarA } from '@/components/arena/shell/navegacion';
import { Bot, Cpu, Database, FlaskConical, Gauge, ListChecks, ShieldCheck, Swords, Trophy, Users } from 'lucide-react';

const COLOR_ESTADO_LED: Record<EstadoServicio, string> = {
  conectado: 'bg-exito',
  local: 'bg-acento',
  desconectado: 'bg-muted-foreground/50',
  pendiente: 'bg-advertencia',
  error: 'bg-peligro',
};

export function VistaPanel() {
  const almacen = useAlmacen();
  

  const [verificaciones, setVerificaciones] = React.useState<readonly Verificacion[] | null>(null);
  const [diagnostico, setDiagnostico] = React.useState<readonly Verificacion[] | null>(null);

  React.useEffect(() => {
    // Prueba de humo real: cada juego implementado responde en este navegador.
    const temporizador = window.setTimeout(() => {
      setVerificaciones(verificarMotor());
      setDiagnostico(diagnosticarNavegador());
    }, 60);
    return () => window.clearTimeout(temporizador);
  }, []);

  const servicios = React.useMemo(() => obtenerServicios(), []);
  const juegos = juegosImplementados();
  const agentes = agentesDisponibles();
  const pendientes = CATALOGO_JUEGOS.length - juegos.length;

  const partidasVálidas = almacen.partidas.filter((p) => p.validez === 'verificada').length;

  return (
    <div className="space-y-5">
      <EncabezadoVista
        titulo="Panel de control"
        descripcion="Vista de mando del laboratorio: qué servicios existen, qué se ha medido y qué sigue pendiente de conexión con el núcleo central."
        acciones={<MarcaLocal />}
      />

      <Alert className="border-border bg-card/70">
        <FlaskConical className="size-4 text-acento" aria-hidden="true" />
        <AlertTitle className="text-sm">Prototipo visual independiente</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          Esta consola no está conectada al registro experimental del repositorio central
          (React 19 + Vite). El motor de juegos real está{' '}
          <strong>vendorizado localmente (commit {MOTOR_ORIGEN.commit})</strong> para ejecutar reglas y agentes
          auténticos en tu navegador; todo lo demás declara su estado real.
        </AlertDescription>
      </Alert>

      {/* Métricas clave */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <TarjetaMetrica
          etiqueta="Motor de juegos"
          valor={juegos.length}
          unidad="implementados"
          descripcion={`${pendientes} variantes pendientes en el catálogo del núcleo (Fase 5).`}
          estado="local"
          procedencia={{
            origen: 'calculo-sobre-registros',
            metodo: 'Recuento del catálogo real de juegos (dominio/juegos/registro.ts).',
            fuente: 'motor-local-vendorizado',
            commitMotor: MOTOR_ORIGEN.commit,
          }}
          alVerOrigen={() => navegarA('arena')}
        />
        <TarjetaMetrica
          etiqueta="Agentes disponibles"
          valor={agentes.filter((a) => a.estado === 'disponible').length + 1}
          unidad="automáticos + humano"
          descripcion="Aleatorio, heurístico, minimax α-β y MCTS; el neuronal aguarda la Fase 2."
          estado="local"
          procedencia={{
            origen: 'calculo-sobre-registros',
            metodo: 'Recuento del catálogo real de agentes (dominio/agentes/registro.ts).',
            fuente: 'motor-local-vendorizado',
            commitMotor: MOTOR_ORIGEN.commit,
          }}
          alVerOrigen={() => navegarA('plantel')}
        />
        <TarjetaMetrica
          etiqueta="Partidas locales"
          valor={almacen.partidas.length === 0 ? null : partidasVálidas}
          unidad={almacen.partidas.length === 0 ? undefined : `/ ${almacen.partidas.length} verificadas`}
          descripcion="Ejecutadas con el motor real en este navegador y guardadas en el almacén local del prototipo."
          procedencia={{
            origen: almacen.partidas.length === 0 ? 'ausente' : 'calculo-sobre-registros',
            metodo: 'Recuento del almacén local (localStorage) del prototipo.',
            fuente: 'almacen-local-prototipo',
          }}
          alVerOrigen={() => navegarA('explorador')}
        />
        <TarjetaMetrica
          etiqueta="Entrenamientos"
          valor={null}
          descripcion="La red neuronal y el entrenamiento pertenecen a la Fase 2 del núcleo: sin datos, sin curvas."
          estado="pendiente"
          procedencia={{
            origen: 'ausente',
            metodo: 'Sin operación de entrenamiento disponible; mostrar una cifra sería inventarla.',
            fuente: 'almacen-central',
          }}
          alVerOrigen={() => navegarA('entrenamiento')}
        />
        <TarjetaMetrica
          etiqueta="Torneos"
          valor={null}
          descripcion="Round-robin, eliminatoria y sistema suizo persistentes llegan en la Fase 4 del núcleo."
          estado="pendiente"
          procedencia={{
            origen: 'ausente',
            metodo: 'Sin servicio de torneos conectado; la evaluación comparativa local sí funciona.',
            fuente: 'almacen-central',
          }}
          alVerOrigen={() => navegarA('torneos')}
        />
        <TarjetaMetrica
          etiqueta="Rating por juego"
          valor={null}
          descripcion="Elo y Glicko-2 con trazabilidad: pendientes de la Fase 4. Nada de Elo supuesto."
          estado="pendiente"
          procedencia={{
            origen: 'ausente',
            metodo: 'Sin ratings calculados: no existen mediciones registradas que los respalden.',
            fuente: 'almacen-central',
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Servicios */}
        <PanelHUD etiqueta="Sistema" titulo="Estado de los servicios" acciones={<Gauge className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
          <ul className="space-y-2">
            {servicios.map((servicio) => (
              <li key={servicio.id} className="rounded-lg border border-border/60 bg-card/40 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('led', COLOR_ESTADO_LED[servicio.estado], servicio.estado === 'local' && 'led-animado')} aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground">{servicio.nombre}</span>
                  <InsigniaEstado estado={servicio.estado} />
                  {servicio.fase !== undefined && (
                    <span className="cifras rounded border border-border px-1 text-[9.5px] text-muted-foreground">
                      {servicio.fase}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{servicio.detalle}</p>
              </li>
            ))}
          </ul>
        </PanelHUD>

        <div className="space-y-4">
          {/* Verificaciones de integridad */}
          <PanelHUD
            etiqueta="Integridad"
            titulo="Verificaciones en vivo"
            acciones={<ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          >
            {verificaciones === null ? (
              <EstadoVacio compacto titulo="Comprobando…" descripcion="Ejecutando la prueba de humo del motor vendorizado." />
            ) : (
              <ul className="space-y-1.5">
                {verificaciones.map((verificación) => (
                  <li key={verificación.nombre} className="flex items-start gap-2 text-[11px]">
                    <ListChecks
                      className={cn('mt-0.5 size-3.5 shrink-0', verificación.ok ? 'text-exito' : 'text-peligro')}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{verificación.nombre}</p>
                      <p className="text-muted-foreground">{verificación.detalle}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2">
              <InsigniaProcedencia
                procedencia={{
                  origen: 'medicion-directa',
                  metodo: 'Prueba de humo ejecutada al cargar: estado inicial + jugadas legales de cada juego real.',
                  fuente: 'motor-local-vendorizado',
                  commitMotor: MOTOR_ORIGEN.commit,
                }}
                compacta={false}
              />
            </div>
          </PanelHUD>

          {/* Actividad */}
          <PanelHUD
            etiqueta="Almacén local del prototipo"
            titulo="Actividad reciente"
            acciones={<Database className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          >
            {almacen.eventos.length === 0 ? (
              <EstadoVacio
                compacto
                titulo="Sin actividad registrada"
                descripcion="Juega una partida o ejecuta una evaluación local y aparecerá aquí, marcada como local."
              />
            ) : (
              <ScrollArea className="h-40 pr-3">
                <ol className="space-y-2">
                  {almacen.eventos.slice(0, 12).map((evento) => (
                    <li key={evento.id} className="flex items-start gap-2 text-[11px]">
                      <span
                        className={cn(
                          'mt-1 size-1.5 shrink-0 rounded-full',
                          evento.tipo === 'partida-local' || evento.tipo === 'evaluacion-local'
                            ? 'bg-acento'
                            : 'bg-muted-foreground/60',
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{evento.resumen}</p>
                        {evento.detalle !== undefined && (
                          <p className="truncate text-muted-foreground">{evento.detalle}</p>
                        )}
                        <p className="cifras text-[9.5px] text-texto-tenue">{formatearFecha(evento.fecha)} · local</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </PanelHUD>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { id: 'arena', titulo: 'Simulador de partidas', icono: Swords, detalle: '6 juegos reales · agentes del núcleo' },
          { id: 'tactico', titulo: 'Simulador táctico', icono: Bot, detalle: 'Sandbox visual v0.1.0' },
          { id: 'plantel', titulo: 'Plantel de IAs', icono: Users, detalle: 'Fichas reales del catálogo' },
          { id: 'torneos', titulo: 'Evaluación comparativa', icono: Trophy, detalle: 'Round-robin local con IC de Wilson' },
        ].map((acceso) => (
          <button
            key={acceso.id}
            type="button"
            onClick={() => navegarA(acceso.id)}
            className="panel-hud group rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-acento/40 hover:bg-acento/[0.05]"
          >
            <acceso.icono className="mb-2 size-5 text-acento" aria-hidden="true" />
            <p className="display-tactico text-sm font-semibold text-foreground">{acceso.titulo}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{acceso.detalle}</p>
          </button>
        ))}
      </div>

      {/* Diagnóstico */}
      <PanelHUD etiqueta="Compatibilidad" titulo="Diagnóstico del navegador" acciones={<Cpu className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
        {diagnostico === null ? (
          <EstadoVacio compacto titulo="Comprobando…" descripcion="Midiendo capacidades reales del navegador." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {diagnostico.map((prueba) => (
              <div key={prueba.nombre} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-2">
                <span className={cn('led', prueba.ok ? 'bg-exito' : 'bg-peligro')} aria-hidden="true" />
                <span className="cifras text-[11px] font-medium text-foreground">{prueba.nombre}</span>
                <span className="ml-auto truncate text-[10px] text-muted-foreground">{prueba.detalle}</span>
              </div>
            ))}
          </div>
        )}
      </PanelHUD>
    </div>
  );
}
