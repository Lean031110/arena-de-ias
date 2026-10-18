'use client';

/**
 * Componentes comunes del sistema visual Arena de IAs.
 *
 * Convenciones:
 * - Todo dato mostrado lleva su procedencia (InsigniaProcedencia).
 * - Todo estado «sin conexión» usa EstadoVacio con explicación útil.
 * - Los paneles clave usan .panel-hud (corchetes de esquina, CSS puro).
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ETIQUETA_ORIGEN, type EstadoServicio, type MetricProvenance, type OrigenDato } from '@/lib/contratos';
import { Eye, Inbox, type LucideIcon } from 'lucide-react';

/* ─── EstadoVacio ─────────────────────────────────────────────────── */

export function EstadoVacio({
  titulo,
  descripcion,
  icono: Icono = Inbox,
  accion,
  compacto = false,
}: {
  titulo: string;
  descripcion: string;
  icono?: LucideIcon;
  accion?: { etiqueta: string; alPulsar: () => void };
  compacto?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center',
        compacto ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      )}
      role="status"
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <Icono className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="display-tactico text-sm font-semibold text-foreground">{titulo}</p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">{descripcion}</p>
      </div>
      {accion !== undefined && (
        <Button variant="outline" size="sm" onClick={accion.alPulsar} className="mt-1">
          {accion.etiqueta}
        </Button>
      )}
    </div>
  );
}

/* ─── Insignia de estado de servicio ───────────────────────────────── */

const MAPA_ESTADO_SERVICIO: Record<EstadoServicio, { etiqueta: string; clase: string; led: string }> = {
  conectado: { etiqueta: 'Conectado', clase: 'bg-exito/12 text-exito border-exito/30', led: 'bg-exito text-exito' },
  local: { etiqueta: 'Local', clase: 'bg-acento/12 text-acento border-acento/30', led: 'bg-acento text-acento' },
  desconectado: { etiqueta: 'Desconectado', clase: 'bg-muted text-muted-foreground border-border', led: 'bg-muted-foreground text-muted-foreground' },
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-advertencia/12 text-advertencia border-advertencia/30', led: 'bg-advertencia text-advertencia' },
  error: { etiqueta: 'Error', clase: 'bg-peligro/12 text-peligro border-peligro/30', led: 'bg-peligro text-peligro' },
};

export function InsigniaEstado({ estado, conLed = false }: { estado: EstadoServicio; conLed?: boolean }) {
  const definicion = MAPA_ESTADO_SERVICIO[estado];
  return (
    <Badge variant="outline" className={cn('gap-1.5 border font-medium', definicion.clase)}>
      {conLed && <span className={cn('led', definicion.led, estado === 'local' && 'led-animado')} aria-hidden="true" />}
      {definicion.etiqueta}
    </Badge>
  );
}

/* ─── Insignia de procedencia del dato ─────────────────────────────── */

const MAPA_ORIGEN: Record<OrigenDato, string> = {
  'medicion-directa': 'bg-exito/10 text-exito border-exito/25',
  'calculo-sobre-registros': 'bg-info/10 text-info border-info/25',
  estimacion: 'bg-advertencia/10 text-advertencia border-advertencia/25',
  ausente: 'bg-muted text-muted-foreground border-border',
  'sintetico-demo': 'bg-faccion-b/10 text-faccion-b border-faccion-b/25',
};

export function InsigniaProcedencia({ procedencia, compacta = true }: { procedencia: MetricProvenance; compacta?: boolean }) {
  const clase = MAPA_ORIGEN[procedencia.origen];
  if (compacta) {
    return (
      <Badge variant="outline" className={cn('border font-medium', clase)} title={procedencia.metodo}>
        {ETIQUETA_ORIGEN[procedencia.origen]}
      </Badge>
    );
  }
  return (
    <div className={cn('inline-flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left', clase)}>
      <span className="text-[11px] font-semibold">{ETIQUETA_ORIGEN[procedencia.origen]}</span>
      <span className="text-[10px] leading-snug opacity-80">{procedencia.metodo}</span>
    </div>
  );
}

/** Marca fija para datos sintéticos de demostración — imposible de confundir. */
export function MarcaDemo() {
  return (
    <Badge className="border border-faccion-b/40 bg-faccion-b/15 text-faccion-b gap-1 font-semibold uppercase tracking-wider text-[10px]">
      <span aria-hidden="true">◇</span> Datos sintéticos de demostración
    </Badge>
  );
}

/** Marca fija para resultados calculados en este prototipo. */
export function MarcaLocal() {
  return (
    <Badge className="border border-acento/40 bg-acento/15 text-acento gap-1 font-semibold uppercase tracking-wider text-[10px]">
      <span aria-hidden="true">◆</span> Local · prototipo
    </Badge>
  );
}

/* ─── PanelHUD ─────────────────────────────────────────────────────── */

export function PanelHUD({
  titulo,
  etiqueta,
  acciones,
  children,
  className,
  contenidoClassName,
}: {
  titulo?: string;
  etiqueta?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contenidoClassName?: string;
}) {
  return (
    <Card className={cn('panel-hud border-border/80 shadow-sm', className)}>
      {(titulo !== undefined || acciones !== undefined) && (
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 py-3">
          <div className="min-w-0">
            {etiqueta !== undefined && <p className="etiqueta-hud mb-0.5">{etiqueta}</p>}
            {titulo !== undefined && (
              <CardTitle className="display-tactico truncate text-sm font-semibold tracking-wide">{titulo}</CardTitle>
            )}
          </div>
          {acciones !== undefined && <div className="flex shrink-0 items-center gap-1.5">{acciones}</div>}
        </CardHeader>
      )}
      <CardContent className={cn('p-4', contenidoClassName)}>{children}</CardContent>
    </Card>
  );
}

/* ─── Tarjeta de métrica con trazabilidad ──────────────────────────── */

export function TarjetaMetrica({
  etiqueta,
  valor,
  unidad,
  descripcion,
  procedencia,
  alVerOrigen,
  estado,
}: {
  etiqueta: string;
  valor: string | number | null;
  unidad?: string;
  descripcion: string;
  procedencia: MetricProvenance;
  alVerOrigen?: () => void;
  estado?: EstadoServicio;
}) {
  const sinDato = valor === null || procedencia.origen === 'ausente';
  return (
    <Card className="panel-hud border-border/80 shadow-sm">
      <CardContent className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="etiqueta-hud">{etiqueta}</p>
          {estado !== undefined && <InsigniaEstado estado={estado} />}
        </div>
        <div className="flex items-baseline gap-1.5">
          {sinDato ? (
            <span className="display-tactico text-lg font-semibold text-muted-foreground/70">Sin datos</span>
          ) : (
            <>
              <span className="cifras display-tactico text-2xl font-bold leading-none text-foreground">{valor}</span>
              {unidad !== undefined && <span className="text-xs text-muted-foreground">{unidad}</span>}
            </>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{descripcion}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <InsigniaProcedencia procedencia={procedencia} />
          {alVerOrigen !== undefined && !sinDato && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={alVerOrigen}
            >
              <Eye className="size-3" aria-hidden="true" />
              Ver origen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Encabezado de vista ──────────────────────────────────────────── */

export function EncabezadoVista({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion: string;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="display-tactico text-xl font-bold tracking-wide text-foreground">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{descripcion}</p>
      </div>
      {acciones !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

/* ─── Fila de dato con etiqueta ────────────────────────────────────── */

export function DatoEtiquetado({
  etiqueta,
  children,
  mono = false,
}: {
  etiqueta: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 first:pt-0 last:pb-0">
      <span className="etiqueta-hud shrink-0">{etiqueta}</span>
      <span className={cn('min-w-0 truncate text-right text-xs text-foreground', mono && 'cifras')}>{children}</span>
    </div>
  );
}
