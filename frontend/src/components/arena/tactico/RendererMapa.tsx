'use client';

/**
 * Renderizador SVG del simulador táctico.
 *
 * SOLO PRESENTA el SimulationState del núcleo (lib/sandbox/tactico):
 * no decide reglas, solo dibuja. Zoom con rueda y botones, arrastre para
 * desplazar, flechas para mover la cámara con teclado, clic para
 * seleccionar unidades y edificios.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SimulationState, TipoTerreno } from '@/lib/contratos';
import { Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';

const CELDA = 48;

const RECORTE_TERRENO: Record<TipoTerreno, React.SVGProps<SVGRectElement>> = {
  llanura: {},
  carretera: { fill: 'rgba(217, 191, 138, 0.16)' },
  bosque: { fill: 'rgba(62, 207, 142, 0.09)' },
  agua: { fill: 'rgba(124, 196, 255, 0.15)' },
  montana: { fill: 'rgba(154, 172, 201, 0.10)' },
  ruinas: { fill: 'rgba(232, 182, 76, 0.06)' },
};

function DecoraciónTerreno({ tipo, x, y }: { tipo: TipoTerreno; x: number; y: number }) {
  switch (tipo) {
    case 'bosque':
      return (
        <g stroke="rgba(62, 207, 142, 0.55)" strokeWidth={1.4} fill="none" aria-hidden="true">
          <path d={`M${x + 14} ${y + 30} l4 -8 l4 8`} />
          <path d={`M${x + 24} ${y + 36} l5 -10 l5 10`} />
          <path d={`M${x + 33} ${y + 26} l4 -8 l4 8`} />
        </g>
      );
    case 'agua':
      return (
        <g stroke="rgba(124, 196, 255, 0.45)" strokeWidth={1.3} fill="none" aria-hidden="true">
          <path d={`M${x + 10} ${y + 20} q4 -4 8 0 t8 0`} />
          <path d={`M${x + 22} ${y + 34} q4 -4 8 0 t8 0`} />
        </g>
      );
    case 'montana':
      return (
        <g stroke="rgba(154, 172, 201, 0.6)" strokeWidth={1.5} fill="rgba(154, 172, 201, 0.06)" aria-hidden="true">
          <path d={`M${x + 10} ${y + 36} L${x + 19} ${y + 14} L${x + 28} ${y + 36} Z`} />
          <path d={`M${x + 24} ${y + 38} L${x + 33} ${y + 20} L${x + 42} ${y + 38} Z`} />
        </g>
      );
    case 'ruinas':
      return (
        <g stroke="rgba(232, 182, 76, 0.4)" strokeWidth={1.1} fill="none" strokeDasharray="4 3" aria-hidden="true">
          <rect x={x + 14} y={y + 16} width={20} height={16} />
          <path d={`M${x + 20} ${y + 16} v-5 h8 v5`} />
        </g>
      );
    case 'carretera':
      return (
        <g stroke="rgba(217, 191, 138, 0.5)" strokeWidth={1} strokeDasharray="2 6" aria-hidden="true">
          <line x1={x} y1={y + CELDA / 2} x2={x + CELDA} y2={y + CELDA / 2} />
          <line x1={x + CELDA / 2} y1={y} x2={x + CELDA / 2} y2={y + CELDA} />
        </g>
      );
    default:
      return null;
  }
}

function GlifoRol({ rol, x, y }: { rol: string; x: number; y: number }) {
  const cx = x + CELDA / 2;
  const cy = y + CELDA / 2;
  switch (rol) {
    case 'infanteria':
      return <path d={`M${cx} ${cy - 8} l7 3 v6 q0 6 -7 8 q-7 -2 -7 -8 v-6 Z`} fill="rgba(10, 15, 28, 0.55)" aria-hidden="true" />;
    case 'explorador':
      return <path d={`M${cx - 7} ${cy - 6} l6 6 l-6 6 M${cx} ${cy - 6} l6 6 l-6 6`} stroke="rgba(10, 15, 28, 0.55)" strokeWidth={2.4} fill="none" aria-hidden="true" />;
    case 'francotirador':
      return (
        <g stroke="rgba(10, 15, 28, 0.55)" strokeWidth={2} fill="none" aria-hidden="true">
          <circle cx={cx} cy={cy} r={6} />
          <path d={`M${cx} ${cy - 9} v4 M${cx} ${cy + 5} v4 M${cx - 9} ${cy} h4 M${cx + 5} ${cy} h4`} />
        </g>
      );
    case 'blindado':
      return <path d={`M${cx - 7} ${cy - 4} l7 -5 l7 5 v7 l-7 5 l-7 -5 Z`} fill="rgba(10, 15, 28, 0.55)" aria-hidden="true" />;
    default:
      return null;
  }
}

export interface PropsRenderer {
  estado: SimulationState;
  selección: { tipo: 'unidad' | 'edificio'; id: string } | null;
  alSeleccionar: (selección: { tipo: 'unidad' | 'edificio'; id: string } | null) => void;
  /** Celdas alcanzables por la unidad seleccionada (clave «fila,columna»). */
  celdasAlcanzables: ReadonlySet<string>;
  /** Ids de unidades/edificios atacables por la unidad seleccionada. */
  objetivosAtacables: ReadonlySet<string>;
  /** El observador controla manualmente la facción indicada. */
  facciónControlada: 'auriga' | 'vector' | null;
  alClicCelda: (fila: number, columna: number) => void;
}

export function RendererMapa({
  estado,
  selección,
  alSeleccionar,
  celdasAlcanzables,
  objetivosAtacables,
  facciónControlada,
  alClicCelda,
}: PropsRenderer) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [cámara, setCámara] = React.useState({ escala: 1, x: 0, y: 0 });
  const [arrastrando, setArrastrando] = React.useState(false);
  const arrastre = React.useRef<{ x: number; y: number; cámaraX: number; cámaraY: number } | null>(null);

  const anchoPx = estado.ancho * CELDA;
  const altoPx = estado.alto * CELDA;

  const ajustarEscala = (delta: number, centro?: { x: number; y: number }): void => {
    setCámara((previa) => {
      const nuevaEscala = Math.min(2.6, Math.max(0.55, previa.escala * delta));
      if (centro === undefined || nuevaEscala === previa.escala) return { ...previa, escala: nuevaEscala };
      const factor = nuevaEscala / previa.escala;
      return {
        escala: nuevaEscala,
        x: centro.x - (centro.x - previa.x) * factor,
        y: centro.y - (centro.y - previa.y) * factor,
      };
    });
  };

  const alRueda = (evento: React.WheelEvent<SVGSVGElement>): void => {
    evento.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    ajustarEscala(evento.deltaY < 0 ? 1.12 : 0.89, { x: evento.clientX - rect.left, y: evento.clientY - rect.top });
  };

  const colorFacción = (facción: string): string =>
    facción === 'auriga' ? 'var(--faccion-a)' : facción === 'vector' ? 'var(--faccion-b)' : 'var(--texto-tenue)';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="icon" className="size-8" aria-label="Acercar" onClick={() => ajustarEscala(1.18)}>
          <Plus className="size-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="size-8" aria-label="Alejar" onClick={() => ajustarEscala(0.85)}>
          <Minus className="size-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="size-8" aria-label="Restablecer vista" onClick={() => setCámara({ escala: 1, x: 0, y: 0 })}>
          <RotateCcw className="size-4" aria-hidden="true" />
        </Button>
        <span className="cifras ml-1 text-[10px] text-muted-foreground">
          {Math.round(cámara.escala * 100)} % · arrastra para desplazar · rueda para zoom
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-tablero-fondo">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${anchoPx} ${altoPx}`}
          role="application"
          aria-label="Mapa táctico del simulador. Flechas para desplazar la cámara, más y menos para zoom."
          tabIndex={0}
          className={cn('block h-auto w-full cursor-mapa touch-none select-none', arrastrando && 'cursor-grabbing')}
          onWheel={alRueda}
          onPointerDown={(evento) => {
            arrastre.current = { x: evento.clientX, y: evento.clientY, cámaraX: cámara.x, cámaraY: cámara.y };
            setArrastrando(true);
          }}
          onPointerMove={(evento) => {
            if (arrastre.current === null || svgRef.current === null) return;
            const rect = svgRef.current.getBoundingClientRect();
            const factor = anchoPx / rect.width;
            setCámara((previa) => ({
              ...previa,
              x: arrastre.current!.cámaraX + (evento.clientX - arrastre.current!.x) * factor,
              y: arrastre.current!.cámaraY + (evento.clientY - arrastre.current!.y) * factor,
            }));
          }}
          onPointerUp={() => {
            arrastre.current = null;
            setArrastrando(false);
          }}
          onPointerLeave={() => {
            arrastre.current = null;
            setArrastrando(false);
          }}
          onKeyDown={(evento) => {
            const paso = 40;
            if (evento.key.startsWith('Arrow')) evento.preventDefault();
            if (evento.key === 'ArrowUp') setCámara((p) => ({ ...p, y: p.y + paso }));
            if (evento.key === 'ArrowDown') setCámara((p) => ({ ...p, y: p.y - paso }));
            if (evento.key === 'ArrowLeft') setCámara((p) => ({ ...p, x: p.x + paso }));
            if (evento.key === 'ArrowRight') setCámara((p) => ({ ...p, x: p.x - paso }));
            if (evento.key === '+' || evento.key === '=') ajustarEscala(1.15);
            if (evento.key === '-') ajustarEscala(0.87);
          }}
        >
          <g transform={`translate(${cámara.x} ${cámara.y}) scale(${cámara.escala})`}>
            {/* Terreno */}
            <rect x={0} y={0} width={anchoPx} height={altoPx} fill="var(--tablero-fondo)" />
            {estado.terreno.map((tipo, índice) => {
              const fila = Math.floor(índice / estado.ancho);
              const columna = índice % estado.ancho;
              const x = columna * CELDA;
              const y = fila * CELDA;
              return (
                <g key={`t-${índice}`}>
                  <rect
                    x={x}
                    y={y}
                    width={CELDA}
                    height={CELDA}
                    fill="var(--tablero-fondo)"
                    {...(RECORTE_TERRENO[tipo] ?? {})}
                    stroke="var(--tablero-lineas)"
                    strokeWidth={0.5}
                    opacity={0.95}
                  />
                  <DecoraciónTerreno tipo={tipo} x={x} y={y} />
                  {celdasAlcanzables.has(`${fila},${columna}`) && (
                    <rect x={x + 4} y={y + 4} width={CELDA - 8} height={CELDA - 8} fill="var(--acento)" opacity={0.22} stroke="var(--acento)" strokeWidth={1.2} rx={4} className="pointer-events-none" />
                  )}
                </g>
              );
            })}

            {/* Edificios */}
            {estado.edificios.map((edificio) => {
              const x = edificio.columna * CELDA;
              const y = edificio.fila * CELDA;
              const cx = x + CELDA / 2;
              const cy = y + CELDA / 2;
              const esSeleccionado = selección?.tipo === 'edificio' && selección.id === edificio.id;
              const color = colorFacción(edificio.faccion);
              return (
                <g key={edificio.id} transform={`translate(${x} ${y})`}>
                  {edificio.tipo === 'base' && (
                    <>
                      <rect x={12} y={14} width={24} height={20} rx={3} fill={color} opacity={0.9} />
                      <path d="M12 14 L24 5 L36 14 Z" fill={color} opacity={0.65} />
                      <rect x={20} y={22} width={8} height={12} fill="rgba(10,15,28,0.45)" />
                    </>
                  )}
                  {edificio.tipo === 'generador' && (
                    <>
                      <circle cx={cx - x} cy={cy - y} r={11} fill={color} opacity={0.85} />
                      <circle cx={cx - x} cy={cy - y} r={5} fill="rgba(10,15,28,0.45)" />
                      <path d={`M${cx - x - 8} ${cy - y} h4 M${cx - x + 4} ${cy - y} h4 M${cx - x} ${cy - y - 8} v4 M${cx - x} ${cy - y + 4} v4`} stroke="rgba(10,15,28,0.5)" strokeWidth={2} />
                    </>
                  )}
                  {edificio.tipo === 'nodo-recursos' && (
                    <>
                      <circle cx={cx - x} cy={cy - y} r={10} fill="none" stroke={color} strokeWidth={2} opacity={0.9} />
                      <path d={`M${cx - x} ${cy - y - 6} l5 6 l-5 6 l-5 -6 Z`} fill={color} opacity={0.8} />
                    </>
                  )}
                  {edificio.tipo === 'punto-estrategico' && (
                    <path
                      d={`M${cx - x} ${cy - y - 10} l3 6 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1 Z`}
                      fill={color}
                      opacity={0.9}
                    />
                  )}
                  {/* barra de vida */}
                  <rect x={10} y={38} width={28} height={3} rx={1.5} fill="rgba(10,15,28,0.5)" />
                  <rect
                    x={10}
                    y={38}
                    width={Math.max(0, (edificio.puntosVida / edificio.puntosVidaMax) * 28)}
                    height={3}
                    rx={1.5}
                    fill={color}
                  />
                  <rect
                    x={6}
                    y={6}
                    width={CELDA - 12}
                    height={CELDA - 12}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={(evento) => {
                      evento.stopPropagation();
                      alSeleccionar({ tipo: 'edificio', id: edificio.id });
                    }}
                  />
                  {esSeleccionado && (
                    <rect x={5} y={5} width={CELDA - 10} height={CELDA - 10} fill="none" stroke="var(--acento)" strokeWidth={2} strokeDasharray="6 4" rx={6} className="pointer-events-none" />
                  )}
                  {objetivosAtacables.has(edificio.id) && (
                    <circle cx={cx - x} cy={cy - y} r={19} fill="none" stroke="var(--peligro)" strokeWidth={2} strokeDasharray="4 3" className="pointer-events-none" />
                  )}
                </g>
              );
            })}

            {/* Unidades */}
            {estado.unidades.map((unidad) => {
              const x = unidad.columna * CELDA;
              const y = unidad.fila * CELDA;
              const cx = x + CELDA / 2;
              const cy = y + CELDA / 2;
              const color = colorFacción(unidad.faccion);
              const esSeleccionada = selección?.tipo === 'unidad' && selección.id === unidad.id;
              const fracciónVida = unidad.puntosVida / unidad.puntosVidaMax;
              return (
                <g key={unidad.id} transform={`translate(${x} ${y})`}>
                  <circle
                    cx={cx - x}
                    cy={cy - y}
                    r={13}
                    fill={color}
                    opacity={unidad.puntosAccion > 0 ? 0.95 : 0.55}
                  />
                  <GlifoRol rol={unidad.rol} x={x} y={y} />
                  {/* barra de vida */}
                  <rect x={9} y={1} width={30} height={3.5} rx={1.75} fill="rgba(10,15,28,0.55)" />
                  <rect
                    x={9}
                    y={1}
                    width={Math.max(0, fracciónVida * 30)}
                    height={3.5}
                    rx={1.75}
                    fill={fracciónVida > 0.5 ? 'var(--exito)' : fracciónVida > 0.25 ? 'var(--advertencia)' : 'var(--peligro)'}
                  />
                  {/* puntos de acción */}
                  {Array.from({ length: unidad.puntosAccionMax }).map((_, i) => (
                    <circle
                      key={i}
                      cx={cx - x - ((unidad.puntosAccionMax - 1) * 5) / 2 + i * 5}
                      cy={44}
                      r={1.7}
                      fill={i < unidad.puntosAccion ? color : 'rgba(154,172,201,0.25)'}
                    />
                  ))}
                  <circle
                    cx={cx - x}
                    cy={cy - y}
                    r={16}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={(evento) => {
                      evento.stopPropagation();
                      alSeleccionar({ tipo: 'unidad', id: unidad.id });
                    }}
                  />
                  {esSeleccionada && (
                    <circle cx={cx - x} cy={cy - y} r={17} fill="none" stroke="var(--acento)" strokeWidth={2.4} className="pointer-events-none" />
                  )}
                  {objetivosAtacables.has(unidad.id) && (
                    <g className="pointer-events-none">
                      <circle cx={cx - x} cy={cy - y} r={18} fill="none" stroke="var(--peligro)" strokeWidth={2} strokeDasharray="4 3" />
                      <Crosshair x={cx - x - 5} y={cy - y - 5} width={10} height={10} color="var(--peligro)" aria-hidden="true" />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
