'use client';

/**
 * Vista «Estrategias y auditoría».
 *
 * - Catálogo de estrategias: SIN REGISTROS (el descubrimiento pertenece a
 *   la Fase 5 del núcleo). Se muestra el esquema que tendrá cada hallazgo.
 * - Auditoría: cada métrica visible en la consola se rastrea hasta su
 *   origen real, con acciones «Ver origen» navegables.
 */

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, MarcaLocal, PanelHUD, DatoEtiquetado } from '@/components/arena/comunes';
import { navegarA } from '@/components/arena/shell/navegacion';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { diagnosticarNavegador, obtenerServicios } from '@/lib/servicios';
import { juegosImplementados, CATALOGO_JUEGOS } from '@/motor-central/juegos/registro';
import { agentesDisponibles } from '@/motor-central/agentes/registro';
import { MOTOR_ORIGEN } from '@/motor-central/version';
import { BookOpenCheck, Compass, FileSearch, Info, ListOrdered } from 'lucide-react';

const CAMPOS_HALLAZGO: ReadonlyArray<{ campo: string; detalle: string }> = [
  { campo: 'Identificador y juego', detalle: 'id único + juego + versión de reglas del hallazgo.' },
  { campo: 'Secuencia y estado', detalle: 'estado inicial y secuencia de jugadas que lo producen.' },
  { campo: 'Partida de origen', detalle: 'registro exacto del que se extrajo (reproducible).' },
  { campo: 'Autoría', detalle: 'agente y versión del cerebro que la ejecutó, rivales enfrentados.' },
  { campo: 'Frecuencia', detalle: 'cuántas veces apareció en registros reales.' },
  { campo: 'Validación', detalle: 'descubierto / candidato / validado — nunca «estrategia» sin comprobar.' },
  { campo: 'Duplicados', detalle: 'detección de repeticiones y transposiciones conocidas.' },
];

const CADENA_TRazabilidad = [
  { paso: 'Medición directa', detalle: 'El motor mide nodos, simulaciones, tiempos y resultados jugada a jugada.' },
  { paso: 'Registro serializado', detalle: 'Cada partida/evaluación se guarda con huella de integridad y semilla.' },
  { paso: 'Cálculo sobre registros', detalle: 'Los agregados (V/E/D, IC de Wilson) se derivan solo de registros guardados.' },
  { paso: 'Presentación', detalle: 'La interfaz muestra el dato + su procedencia + acción «Ver origen».' },
];

export function VistaEstrategias() {
  
  const almacen = useAlmacen();
  const servicios = obtenerServicios();
  const servicioEstrategias = servicios.find((s) => s.id === 'estrategias');

  const métricasAuditables = [
    {
      etiqueta: 'Juegos implementados',
      valor: String(juegosImplementados().length),
      origen: 'Recuento del catálogo real del motor vendorizado',
      destino: 'arena',
    },
    {
      etiqueta: 'Agentes disponibles',
      valor: String(agentesDisponibles().filter((a) => a.estado === 'disponible').length),
      origen: 'Recuento del catálogo real de agentes',
      destino: 'plantel',
    },
    {
      etiqueta: 'Partidas locales',
      valor: almacen.partidas.length === 0 ? 'Sin datos' : String(almacen.partidas.length),
      origen: 'Almacén local del prototipo (motor real)',
      destino: 'explorador',
    },
    {
      etiqueta: 'Evaluaciones locales',
      valor: almacen.evaluaciones.length === 0 ? 'Sin datos' : String(almacen.evaluaciones.length),
      origen: 'Almacén local del prototipo (motor real)',
      destino: 'torneos',
    },
    {
      etiqueta: 'Elo por juego',
      valor: 'Sin datos',
      origen: 'Requiere Fase 4 (ratings calculados sobre registros)',
      destino: 'torneos',
    },
    {
      etiqueta: 'Pérdidas de entrenamiento',
      valor: 'Sin datos',
      origen: 'Requiere Fase 2 (operaciones de entrenamiento)',
      destino: 'entrenamiento',
    },
  ];

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Estrategias y auditoría"
        descripcion="Catálogo consultable de estrategias descubiertas y vista de auditoría donde cada métrica de la consola se rastrea hasta su registro de origen."
        acciones={<MarcaLocal />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Catálogo de estrategias */}
        <PanelHUD etiqueta="Catálogo" titulo="Estrategias, aperturas y patrones">
          <EstadoVacio
            titulo="Sin registros: descubrimiento en Fase 5"
            descripcion={
              servicioEstrategias?.detalle ??
              'El detector de aperturas, trampas y patrones validados está planificado en la Fase 5 del núcleo central.'
            }
            icono={Compass}
          />
          <div className="mt-4">
            <p className="etiqueta-hud mb-2">Qué contendrá cada hallazgo (esquema previsto)</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {CAMPOS_HALLAZGO.map((campo) => (
                <li key={campo.campo} className="rounded-md border border-border/60 bg-card/40 px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-foreground">{campo.campo}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{campo.detalle}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3">
            <InsigniaProcedencia
              procedencia={{
                origen: 'ausente',
                metodo: 'No existen hallazgos: el descubrimiento de estrategias llega con la Fase 5 del núcleo.',
                fuente: 'almacen-central',
              }}
              compacta={false}
            />
          </div>
        </PanelHUD>

        {/* Auditoría */}
        <PanelHUD etiqueta="Auditoría" titulo="Trazabilidad de las métricas de la consola">
          <div className="space-y-2">
            {métricasAuditables.map((métrica) => (
              <div
                key={métrica.etiqueta}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">
                    {métrica.etiqueta}: <span className="cifras">{métrica.valor}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">Origen: {métrica.origen}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[10px]"
                  onClick={() => navegarA(métrica.destino)}
                >
                  <FileSearch className="size-3" aria-hidden="true" />
                  Ver origen
                </Button>
              </div>
            ))}
          </div>
        </PanelHUD>
      </div>

      {/* Cadena de trazabilidad */}
      <PanelHUD etiqueta="Metodología" titulo="Cadena de trazabilidad de los datos">
        <ol className="grid gap-2 md:grid-cols-4">
          {CADENA_TRazabilidad.map((eslabón, índice) => (
            <li key={eslabón.paso} className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="cifras flex size-5 items-center justify-center rounded-full border border-acento/40 bg-acento/10 text-[10px] font-bold text-acento">
                  {índice + 1}
                </span>
                <p className="text-[11px] font-semibold text-foreground">{eslabón.paso}</p>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">{eslabón.detalle}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <DatoEtiquetado etiqueta="Motor vendorizado" mono>
            {MOTOR_ORIGEN.repositorio.split('/').slice(-1)[0]}@{MOTOR_ORIGEN.commit}
          </DatoEtiquetado>
          <DatoEtiquetado etiqueta="Juegos del catálogo" mono>
            {CATALOGO_JUEGOS.length} ({juegosImplementados().length} implementados · {CATALOGO_JUEGOS.length - juegosImplementados().length} pendientes)
          </DatoEtiquetado>
          <DatoEtiquetado etiqueta="Almacén del prototipo" mono>
            {almacen.partidas.length} partidas · {almacen.evaluaciones.length} evaluaciones · {almacen.eventos.length} eventos
          </DatoEtiquetado>
        </div>
      </PanelHUD>

      <Alert className="border-border bg-card/70">
        <Info className="size-4 text-acento" aria-hidden="true" />
        <AlertTitle className="text-sm">Regla de la casa</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          Ninguna métrica aparece en esta consola sin declarar su origen: medición directa, cálculo sobre
          registros, estimación o ausencia. Las estructuras sintéticas (sandbox táctico, árbol demo) llevan
          marca permanente de demostración. Los estados de ejemplo de desarrollo nunca se presentan como
          resultados reales.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icono: ListOrdered, título: 'Registros completos', detalle: 'Cada partida guarda agentes, config, semilla, huella y estadísticas por jugada.' },
          { icono: BookOpenCheck, título: 'Validación por replay', detalle: 'El núcleo revalida cada partida por reproducción antes de marcarla «verificada».' },
          { icono: FileSearch, título: 'Origen navegable', detalle: '«Ver origen» lleva a la vista donde vive el registro que respalda cada cifra.' },
        ].map((tarjeta) => (
          <div key={tarjeta.título} className="rounded-xl border border-border/70 bg-card/50 p-4">
            <tarjeta.icono className="mb-2 size-5 text-acento" aria-hidden="true" />
            <p className="display-tactico text-sm font-semibold text-foreground">{tarjeta.título}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{tarjeta.detalle}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        Diagnóstico de compatibilidad disponible en Ajustes · {diagnosticarNavegador().length} comprobaciones en vivo
      </p>
    </div>
  );
}
