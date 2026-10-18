'use client';

/**
 * Vista «Entrenamiento» — panel honesto.
 *
 * El entrenamiento neuronal pertenece a la Fase 2 del núcleo y NO está
 * conectado. Esta vista muestra los estados que tendrá, qué datos exigirá
 * y qué se puede hacer HOY de verdad (evaluación comparativa local).
 * Ninguna barra de progreso animada finge un entrenamiento.
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, PanelHUD, DatoEtiquetado } from '@/components/arena/comunes';
import { navegarA } from '@/components/arena/shell/navegacion';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { Activity, CircleSlash, Info, ListChecks, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const ESTADOS_TAREA: ReadonlyArray<{ estado: string; descripcion: string }> = [
  { estado: 'Pendiente', descripcion: 'Definida por el usuario, aún sin enviar al motor.' },
  { estado: 'En cola', descripcion: 'Aceptada por el planificador del motor, esperando turno.' },
  { estado: 'Ejecutando', descripcion: 'Motor entrenando; el progreso lo comunica el motor, no la interfaz.' },
  { estado: 'Pausado', descripcion: 'Detenida sin cancelar; se reanudará desde el último punto estable.' },
  { estado: 'Cancelado', descripcion: 'Abortada por el usuario; los parámetros quedan registrados.' },
  { estado: 'Fallido', descripcion: 'El motor reportó error; el mensaje se conserva íntegro.' },
  { estado: 'Completado', descripcion: 'Terminó; evaluación y checkpoints disponibles.' },
];

export function VistaEntrenamiento() {
  
  const almacen = useAlmacen();

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Entrenamiento"
        descripcion="Panel de tareas de entrenamiento del motor central. Hoy no hay ninguna operación real disponible: sin red, sin pesos, sin pérdidas medibles."
        acciones={
          <span className="flex items-center gap-1.5 rounded-md border border-advertencia/30 bg-advertencia/10 px-2 py-1 text-[10px] font-semibold text-advertencia">
            <CircleSlash className="size-3" aria-hidden="true" /> Fase 2 · no conectado
          </span>
        }
      />

      <Alert className="border-border bg-card/70">
        <Info className="size-4 text-acento" aria-hidden="true" />
        <AlertTitle className="text-sm">Ningún dato de entrenamiento es mostrable</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          El agente neuronal del núcleo está <strong>pendiente de implementación (Fase 2)</strong>: no existen
          pesos, entrenamientos ni pérdidas medidas. Presentar curvas o barras aquí sería fabricar datos. Esta
          vista describe qué existirá y cómo se distinguirá un estado real de una ausencia.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelHUD etiqueta="Estado actual" titulo="Tareas de entrenamiento">
          <EstadoVacio
            titulo="Sin tareas: el servicio no existe"
            descripcion="Cuando la Fase 2 conecte el entrenamiento, aquí se listarán las ejecuciones con su estado real comunicado por el motor (pendiente, en cola, ejecutando, pausado, cancelado, fallido o completado), su presupuesto consumido, sus pérdidas medidas y sus checkpoints."
            icono={Activity}
            accion={{
              etiqueta: 'Comparar agentes clásicos (disponible hoy)',
              alPulsar: () => navegarA('torneos'),
            }}
          />
          <div className="mt-3">
            <InsigniaProcedencia
              procedencia={{
                origen: 'ausente',
                metodo: 'No hay operación de entrenamiento disponible; mostrar cifras sería inventarlas.',
                fuente: 'almacen-central',
              }}
              compacta={false}
            />
          </div>
        </PanelHUD>

        <PanelHUD etiqueta="Referencia" titulo="Estados que distinguirá el panel">
          <ul className="space-y-1.5">
            {ESTADOS_TAREA.map((tarea) => (
              <li key={tarea.estado} className="flex items-start gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-2">
                <ListChecks className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-[11px] font-semibold text-foreground">{tarea.estado}</p>
                  <p className="text-[10px] leading-snug text-muted-foreground">{tarea.descripcion}</p>
                </div>
              </li>
            ))}
          </ul>
        </PanelHUD>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelHUD etiqueta="Requisitos" titulo="Qué exigirá el motor real">
          <div className="space-y-1">
            <DatoEtiquetado etiqueta="Modelo de origen">red de política y valor (Fase 2)</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Presupuesto">autojuegos · pasos · tiempo, medidos</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Pérdidas">registradas por el motor cada N pasos</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Checkpoints">versionados y recuperables</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Evaluación">del cerebro resultante, con IC</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Promoción">criterios de docs/CRITERIOS_ACEPTACION.md</DatoEtiquetado>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            Ninguna cifra aparecerá en este panel sin provenir de una operación real del motor.
          </p>
        </PanelHUD>

        <PanelHUD etiqueta="Alternativa real hoy" titulo="Evaluación comparativa local">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Aunque no exista entrenamiento, el motor real permite <strong>medir comparaciones rigurosas entre
            agentes clásicos</strong> con intervalo de confianza de Wilson. Es la única competición estadística
            ejecutable hoy y está disponible en la vista de torneos.
          </p>
          <div className="mt-3 space-y-1">
            <DatoEtiquetado etiqueta="Partidas locales" mono>
              {almacen.partidas.length}
            </DatoEtiquetado>
            <DatoEtiquetado etiqueta="Evaluaciones locales" mono>
              {almacen.evaluaciones.length}
            </DatoEtiquetado>
          </div>
          <Button variant="secondary" size="sm" className={cn('mt-3 gap-1.5')} onClick={() => navegarA('torneos')}>
            <Trophy className="size-3.5" aria-hidden="true" />
            Ir a evaluación comparativa
          </Button>
        </PanelHUD>
      </div>
    </div>
  );
}
