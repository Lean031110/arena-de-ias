'use client';

/**
 * Reproductor de una partida registrada (RegistroPartida real).
 *
 * Reproduce la secuencia aplicando cada notación al motor (el propio
 * núcleo valida la secuencia en `reproducirRegistro`; aquí se usa
 * `aplicarMovimiento` + `analizarMovimiento` para reconstruir las vistas).
 * Permite depurar el tiempo jugada a jugada con teclado y deslizador.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { obtenerJuego } from '@/motor-central/juegos/registro';
import type { JuegoConcreto, VistaTablero } from '@/motor-central/motor/tipos';
import type { RegistroPartida } from '@/motor-central/motor/partida';
import { formatearDuracion, formatearFecha } from '@/lib/contratos';
import { Tablero } from './Tablero';
import { ChevronFirst, ChevronLast, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

export function ReproductorRegistro({
  registro,
  compacto = false,
}: {
  registro: RegistroPartida;
  compacto?: boolean;
}) {
  const juego = React.useMemo<JuegoConcreto>(() => obtenerJuego(registro.juego.id), [registro.juego.id]);

  const vistas = React.useMemo<readonly VistaTablero[]>(() => {
    try {
      let estado = juego.crearEstadoInicial();
      const lista: VistaTablero[] = [juego.vista(estado)];
      for (const movimiento of registro.movimientos) {
        const parsed = juego.analizarMovimiento(movimiento.notacion);
        if (parsed === null) break;
        estado = juego.aplicarMovimiento(estado, parsed);
        lista.push(juego.vista(estado));
      }
      return lista;
    } catch {
      return [juego.vista(juego.crearEstadoInicial())];
    }
  }, [juego, registro.movimientos]);

  const [índice, setÍndice] = React.useState(vistas.length - 1);
  const [reproduciendo, setReproduciendo] = React.useState(false);

  React.useEffect(() => {
    setÍndice(vistas.length - 1);
    setReproduciendo(false);
  }, [vistas.length]);

  React.useEffect(() => {
    if (!reproduciendo) return;
    if (índice >= vistas.length - 1) {
      setReproduciendo(false);
      return;
    }
    const temporizador = window.setTimeout(() => setÍndice((i) => Math.min(vistas.length - 1, i + 1)), 750);
    return () => window.clearTimeout(temporizador);
  }, [reproduciendo, índice, vistas.length]);

  const alPulsarTecla = (evento: React.KeyboardEvent<HTMLDivElement>): void => {
    if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      setÍndice((i) => Math.max(0, i - 1));
    } else if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      setÍndice((i) => Math.min(vistas.length - 1, i + 1));
    }
  };

  const movimientoActual = índice > 0 ? registro.movimientos[índice - 1] : null;
  const última = movimientoActual ?? null;

  return (
    <div className="space-y-3" tabIndex={0} onKeyDown={alPulsarTecla} role="group" aria-label="Reproductor de partida registrada">
      <Tablero
        juego={juego}
        vista={vistas[índice] ?? vistas[0]!}
        aceptaEntrada={false}
        onJugada={() => undefined}
        validar={() => ({ valido: false, motivo: 'reproducción de solo lectura' })}
      />

      <div className="space-y-2 rounded-lg border border-border/70 bg-card/60 p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Ir al inicio"
            onClick={() => {
              setÍndice(0);
              setReproduciendo(false);
            }}
          >
            <ChevronFirst className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Jugada anterior" onClick={() => setÍndice((i) => Math.max(0, i - 1))}>
            <SkipBack className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant={reproduciendo ? 'secondary' : 'default'}
            size="icon"
            className="size-8"
            aria-label={reproduciendo ? 'Pausar repetición' : 'Reproducir repetición'}
            onClick={() => setReproduciendo((r) => !r)}
          >
            {reproduciendo ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          </Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Jugada siguiente" onClick={() => setÍndice((i) => Math.min(vistas.length - 1, i + 1))}>
            <SkipForward className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Ir al final"
            onClick={() => {
              setÍndice(vistas.length - 1);
              setReproduciendo(false);
            }}
          >
            <ChevronLast className="size-4" aria-hidden="true" />
          </Button>
          <span className="cifras ml-auto text-xs text-muted-foreground" aria-live="polite">
            Jugada {índice} / {vistas.length - 1}
          </span>
        </div>
        <Slider
          value={[índice]}
          min={0}
          max={Math.max(1, vistas.length - 1)}
          step={1}
          onValueChange={([valor]) => setÍndice(valor ?? 0)}
          aria-label="Posición de la repetición"
        />
        {última !== null && (
          <p className="cifras text-[11px] text-muted-foreground">
            #{última.indice + 1} · J{última.jugador} · {última.notacion} ·{' '}
            {última.estadisticas.nodos !== undefined && `${última.estadisticas.nodos} nodos · `}
            {última.estadisticas.simulaciones !== undefined && `${última.estadisticas.simulaciones} sims · `}
            {formatearDuracion(última.estadisticas.tiempoMs)}
          </p>
        )}
      </div>

      {!compacto && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-card/60 p-3 text-[11px] sm:grid-cols-4">
          <div>
            <dt className="etiqueta-hud">Fecha</dt>
            <dd className="text-foreground">{formatearFecha(registro.fecha)}</dd>
          </div>
          <div>
            <dt className="etiqueta-hud">Reglas</dt>
            <dd className="text-foreground">v{registro.juego.reglasVersion}</dd>
          </div>
          <div>
            <dt className="etiqueta-hud">Semilla</dt>
            <dd className="cifras text-foreground">{registro.semilla}</dd>
          </div>
          <div>
            <dt className="etiqueta-hud">Duración</dt>
            <dd className="text-foreground">{formatearDuracion(registro.duracionMs)}</dd>
          </div>
        </dl>
      )}

      {registro.resultado !== null ? (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-center text-sm font-semibold',
            registro.resultado.tipo === 'victoria'
              ? 'border-exito/40 bg-exito/10 text-exito'
              : 'border-advertencia/40 bg-advertencia/10 text-advertencia',
          )}
        >
          {registro.resultado.tipo === 'victoria'
            ? `Victoria del jugador ${registro.resultado.ganador ?? 1} (${registro.agentes[(registro.resultado.ganador ?? 1) - 1]?.nombre ?? '?'})`
            : 'Empate'}
          {registro.validez === 'invalida' && ' · PARTIDA INVÁLIDA (ver errores)'}
        </p>
      ) : (
        <p className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-center text-sm font-semibold text-peligro">
          Partida inválida: {registro.errores[0] ?? 'secuencia rechazada por el motor'}
        </p>
      )}
    </div>
  );
}
