'use client';

/**
 * Renderizador de tableros por turnos del motor central.
 *
 * Solo PRESENTA la VistaTablero que produce el motor; no conoce reglas.
 * La conversión de clic → movimiento usa la «familia» declarada por el
 * juego ('celda' → {fila, columna} · 'columna' → {columna}).
 *
 * Teclado: el tablero recibe el foco; flechas mueven el cursor y
 * Enter/Espacio juegan en la celda (o columna) señalada.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { JuegoConcreto, MovimientoConcreto, VistaTablero } from '@/motor-central/motor/tipos';
import { toast } from '@/hooks/use-toast';

export interface PropsTablero {
  juego: JuegoConcreto;
  vista: VistaTablero;
  /** La partida acepta jugadas humanas en este momento. */
  aceptaEntrada: boolean;
  onJugada(movimiento: MovimientoConcreto): void;
  /** Validación delegada al motor: la interfaz no decide legalidad. */
  validar(movimiento: MovimientoConcreto): { valido: boolean; motivo?: string };
}

const LETRAS = 'abcdefghijklmnopqrstuvwxyz';

export function Tablero({ juego, vista, aceptaEntrada, onJugada, validar }: PropsTablero) {
  const { ancho, alto } = juego.dimensiones;
  const [cursor, setCursor] = React.useState({ fila: Math.floor((alto - 1) / 2), columna: Math.floor((ancho - 1) / 2) });
  const tableroRef = React.useRef<HTMLDivElement>(null);

  const notacionCelda = (fila: number, columna: number): string =>
    `${LETRAS[columna] ?? '?'}${fila + 1}`;

  const construirMovimiento = (fila: number, columna: number): MovimientoConcreto =>
    juego.familia === 'columna' ? ({ columna } as MovimientoConcreto) : ({ fila, columna } as MovimientoConcreto);

  const intentar = (fila: number, columna: number): void => {
    const movimiento = construirMovimiento(fila, columna);
    const comprobacion = validar(movimiento);
    if (!comprobacion.valido) {
      toast({
        title: 'Jugada ilegal',
        description: comprobacion.motivo ?? 'El motor rechaza ese movimiento.',
        variant: 'destructive',
      });
      return;
    }
    onJugada(movimiento);
  };

  const alPulsarTecla = (evento: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!aceptaEntrada) return;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [1, 0],
      ArrowDown: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (evento.key in delta) {
      evento.preventDefault();
      const [df, dc] = delta[evento.key]!;
      setCursor((previo) => ({
        fila: Math.min(alto - 1, Math.max(0, previo.fila + df)),
        columna: Math.min(ancho - 1, Math.max(0, previo.columna + dc)),
      }));
    } else if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      intentar(cursor.fila, cursor.columna);
    }
  };

  const anchoMaximo = ancho <= 4 ? 340 : ancho <= 8 ? 430 : ancho <= 10 ? 560 : 680;
  const tamanoCelda = ancho >= 15 ? 'text-[9px]' : ancho >= 9 ? 'text-[10px]' : 'text-xs';

  // Se pinta de arriba (fila alta) hacia abajo (fila 0) para que la
  // notación del motor («a1», columna izquierda abajo) coincida con la vista.
  const filas = Array.from({ length: alto }, (_, índice) => alto - 1 - índice);

  return (
    <div
      ref={tableroRef}
      role="application"
      aria-label={`Tablero de ${juego.nombre}, ${ancho} por ${alto}. Turno del jugador ${vista.turno}. Usa las flechas y Enter para jugar.`}
      tabIndex={0}
      onKeyDown={alPulsarTecla}
      className="desplazamiento mx-auto w-full cursor-default rounded-lg border border-tablero-lineas bg-tablero-fondo p-1.5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ maxWidth: anchoMaximo }}
    >
      <div
        className="grid select-none"
        style={{ gridTemplateColumns: `repeat(${ancho}, minmax(0, 1fr))` }}
      >
        {filas.map((fila) =>
          Array.from({ length: ancho }, (_, columna) => {
            const índice = fila * ancho + columna;
            const marca = vista.celdas[índice] ?? 0;
            const esUltima =
              vista.ultima !== null && vista.ultima.fila === fila && vista.ultima.columna === columna;
            const esCursor = cursor.fila === fila && cursor.columna === columna;
            const libre = marca === 0;
            const legal =
              aceptaEntrada &&
              libre &&
              (juego.familia === 'celda' ||
                validar(construirMovimiento(fila, columna)).valido);
            const enColumnaHover =
              juego.familia === 'columna' && aceptaEntrada && cursor.columna === columna;
            return (
              <button
                key={`${fila}-${columna}`}
                type="button"
                tabIndex={-1}
                disabled={!aceptaEntrada}
                aria-label={
                  juego.familia === 'columna'
                    ? `Columna ${LETRAS[columna] ?? '?'}`
                    : `Celda ${notacionCelda(fila, columna)}${marca !== 0 ? `, jugador ${marca}` : libre ? ', libre' : ''}`
                }
                onMouseEnter={() => setCursor({ fila, columna })}
                onClick={() => intentar(fila, columna)}
                className={cn(
                  'relative flex aspect-square items-center justify-center border border-tablero-lineas/45 transition-colors duration-100',
                  aceptaEntrada && 'hover:bg-foreground/[0.05]',
                  enColumnaHover && 'bg-foreground/[0.045]',
                  esCursor && 'z-10 outline-2 outline-offset-[-2px] outline-acento',
                  'focus-visible:outline-none',
                )}
              >
                {marca === 1 && (
                  <span
                    className={cn(
                      'block rounded-full bg-faccion-a',
                      ancho >= 15 ? 'size-[68%]' : 'size-[74%]',
                      esUltima && 'ring-2 ring-acento ring-offset-1 ring-offset-tablero-fondo',
                    )}
                    aria-hidden="true"
                  />
                )}
                {marca === 2 && (
                  <span
                    className={cn(
                      'block rounded-[24%] bg-faccion-b',
                      ancho >= 15 ? 'size-[64%]' : 'size-[68%]',
                      esUltima && 'ring-2 ring-acento ring-offset-1 ring-offset-tablero-fondo',
                    )}
                    aria-hidden="true"
                  />
                )}
                {marca === 0 && legal && (
                  <span className={cn('block rounded-full bg-foreground/25', ancho >= 15 ? 'size-1' : 'size-1.5')} aria-hidden="true" />
                )}
                {marca === 0 && !legal && (
                  <span className={cn('cifras text-texto-tenue/30', tamanoCelda)} aria-hidden="true">
                    {ancho <= 9 ? notacionCelda(fila, columna) : ''}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
