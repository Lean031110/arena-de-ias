'use client';

/**
 * Marco de la consola Arena de IAs.
 *
 * - Navegación por fragmento (#/vista) sin rutas de servidor.
 * - Barra lateral agrupada en escritorio; cajón lateral en móvil.
 * - Atajos Alt+1…9 / Alt+0 para recorrer las vistas con teclado.
 * - Barra superior con estado real del motor y conmutador de tema.
 */

import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Menu, Moon, SunMedium, Cpu, Database } from 'lucide-react';
import { VISTAS, vistaPorId, esIdVista, type DefinicionVista } from './vistas';
import { usePreferencias } from './ProveedorTemayPreferencias';
import { InsigniaEstado } from '@/components/arena/comunes';
import { MOTOR_ORIGEN } from '@/motor-central/version';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';

/* ── Navegación ── */

function leerVistaDelHash(): string {
  if (typeof window === 'undefined') return 'panel';
  const bruto = window.location.hash.replace(/^#\/?/, '');
  return esIdVista(bruto) ? bruto : 'panel';
}

export function useVistaActual(): readonly [string, (vista: string) => void] {
  const [vista, setVista] = React.useState('panel');

  React.useEffect(() => {
    const sincronizar = () => setVista(leerVistaDelHash());
    sincronizar();
    window.addEventListener('hashchange', sincronizar);
    return () => window.removeEventListener('hashchange', sincronizar);
  }, []);

  const navegar = React.useCallback((destino: string) => {
    window.location.hash = `#/${destino}`;
  }, []);

  return [vista, navegar] as const;
}

function ContenidoNavegacion({
  vistaActiva,
  alNavegar,
  onMovil,
}: {
  vistaActiva: string;
  alNavegar: (vista: string) => void;
  onMovil?: () => void;
}) {
  const grupos = ['Observación', 'Agentes', 'Análisis', 'Sistema'] as const;
  return (
    <nav aria-label="Navegación principal" className="flex h-full flex-col gap-4 overflow-y-auto desplazamiento px-3 py-4">
      {grupos.map((grupo) => (
        <div key={grupo}>
          <p className="etiqueta-hud mb-1.5 px-2">{grupo}</p>
          <ul className="space-y-0.5">
            {VISTAS.filter((vista) => vista.grupo === grupo).map((vista) => (
              <li key={vista.id}>
                <button
                  type="button"
                  onClick={() => {
                    alNavegar(vista.id);
                    onMovil?.();
                  }}
                  aria-current={vistaActiva === vista.id ? 'page' : undefined}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-[13px] transition-colors',
                    vistaActiva === vista.id
                      ? 'border-acento/30 bg-acento/12 font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  <vista.icono
                    className={cn(
                      'size-4 shrink-0',
                      vistaActiva === vista.id ? 'text-acento' : 'text-muted-foreground/80 group-hover:text-foreground',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{vista.titulo}</span>
                  <kbd
                    className={cn(
                      'hidden rounded border px-1 font-mono text-[10px] leading-4 sm:inline-block',
                      vistaActiva === vista.id ? 'border-acento/40 text-acento/90' : 'border-border text-texto-tenue',
                    )}
                    aria-hidden="true"
                  >
                    Alt+{vista.atajo}
                  </kbd>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-auto space-y-2 rounded-lg border border-border/70 bg-card/60 p-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-3.5 text-acento" aria-hidden="true" />
          <span className="etiqueta-hud">Motor de juegos</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <InsigniaEstado estado="local" conLed />
          <span className="cifras text-[10px] text-muted-foreground">@{MOTOR_ORIGEN.commit}</span>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Reglas y agentes reales del núcleo, ejecutándose en este navegador.
        </p>
      </div>
    </nav>
  );
}

/* ── Logotipo ── */

function MarcaArena({ compacto = false }: { compacto?: boolean }) {
  return (
    <Link
      href="#/panel"
      className="flex items-center gap-2.5 rounded-md px-2 py-1 transition-opacity hover:opacity-90"
      aria-label="Arena de IAs — ir al panel de control"
    >
      <img src="logo.svg" alt="" width={30} height={30} className="shrink-0" />
      {!compacto && (
        <span className="flex flex-col leading-none">
          <span className="display-tactico text-[15px] font-bold tracking-[0.18em] text-foreground">
            ARENA <span className="text-muted-foreground font-medium">DE</span> IAs
          </span>
          <span className="etiqueta-hud mt-0.5 text-[8.5px] tracking-[0.22em]">Consola de observación</span>
        </span>
      )}
    </Link>
  );
}

/* ── Barra superior ── */

function BotonTema() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  const esOscuro = !montado || theme !== 'light';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label={esOscuro ? 'Activar tema claro' : 'Activar tema oscuro'}
          onClick={() => setTheme(esOscuro ? 'light' : 'dark')}
        >
          {esOscuro ? <SunMedium className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{esOscuro ? 'Tema claro' : 'Tema oscuro'}</TooltipContent>
    </Tooltip>
  );
}

function BarraSuperior({ vista }: { vista: DefinicionVista }) {
  const { preferencias, actualizar } = usePreferencias();
  const almacen = useAlmacen();
  const [menuAbierto, setMenuAbierto] = React.useState(false);
  const [, navegar] = useVistaActual();
  const [prefiereTeclado, setPrefiereTeclado] = React.useState(false);

  React.useEffect(() => {
    const detectarFocoTeclado = (evento: KeyboardEvent) => setPrefiereTeclado(evento.key === 'Tab' || evento.altKey);
    window.addEventListener('keydown', detectarFocoTeclado, { passive: true });
    return () => window.removeEventListener('keydown', detectarFocoTeclado);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-3 backdrop-blur-sm sm:px-5">
      {/* Móvil: menú */}
      <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label="Abrir menú de navegación">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <VisuallyHidden>
            <SheetTitle>Menú de navegación</SheetTitle>
          </VisuallyHidden>
          <div className="border-b border-sidebar-border px-4 py-3.5">
            <MarcaArena />
          </div>
          <div className="h-[calc(100%-57px)]">
            <ContenidoNavegacion vistaActiva={vista.id} alNavegar={navegar} onMovil={() => setMenuAbierto(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="lg:hidden">
        <MarcaArena compacto />
      </div>

      <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
        <h2 className="display-tactico truncate text-sm font-semibold tracking-wide text-foreground">
          {vista.titulo}
        </h2>
        <span className="text-muted-foreground/50">·</span>
        <p className="truncate text-xs text-muted-foreground">{vista.descripcion}</p>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="hidden gap-1.5 border-border bg-card/70 py-1 text-[11px] font-normal text-muted-foreground md:inline-flex"
            >
              <Database className="size-3 text-acento" aria-hidden="true" />
              <span className="cifras">
                {almacen.partidas.length} partidas · {almacen.evaluaciones.length} evals
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Almacén local del prototipo — no es el registro central
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label={
                preferencias.movimiento === 'reducido'
                  ? 'Activar animaciones'
                  : 'Reducir movimiento (accesibilidad)'
              }
              aria-pressed={preferencias.movimiento === 'reducido'}
              onClick={() =>
                actualizar({ movimiento: preferencias.movimiento === 'reducido' ? 'pleno' : 'reducido' })
              }
            >
              <span aria-hidden="true" className="text-xs font-semibold tracking-tight">
                {preferencias.movimiento === 'reducido' ? '.rm' : '·m·'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Movimiento {preferencias.movimiento === 'reducido' ? 'reducido (activado)' : 'completo'}
          </TooltipContent>
        </Tooltip>

        <BotonTema />
      </div>
    </header>
  );
}

/* ── Marco principal ── */

export function MarcoAplicacion({ children }: { children: (vista: DefinicionVista) => React.ReactNode }) {
  const [vista, navegar] = useVistaActual();

  React.useEffect(() => {
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (!evento.altKey) return;
      const tecla = evento.key;
      const destino = VISTAS.find((candidata) => candidata.atajo === tecla);
      if (destino !== undefined) {
        evento.preventDefault();
        navegar(destino.id);
      }
    };
    window.addEventListener('keydown', alPulsarTecla);
    return () => window.removeEventListener('keydown', alPulsarTecla);
  }, [navegar]);

  const definicion = vistaPorId(vista);

  return (
    <TooltipProvider delayDuration={250}>
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Saltar al contenido principal
      </a>
      <div className="flex min-h-screen w-full fondo-rejilla">
        {/* Barra lateral de escritorio */}
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            <MarcaArena />
          </div>
          <div className="min-h-0 flex-1">
            <ContenidoNavegacion vistaActiva={vista} alNavegar={navegar} />
          </div>
        </aside>

        {/* Columna principal */}
        <div className="resplandor-superior flex min-w-0 flex-1 flex-col">
          <BarraSuperior vista={definicion} />
          <main id="contenido-principal" className="flex-1">
            <div key={vista} className="entrada-suave mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
              {children(definicion)}
            </div>
          </main>
          <footer className="mt-auto border-t border-border/60 px-4 py-3">
            <p className="mx-auto max-w-6xl text-center text-[10.5px] leading-relaxed text-muted-foreground/70">
              Prototipo visual independiente (Next.js) · Motor central vendorizado @{MOTOR_ORIGEN.commit} ·
              Sin métricas ficticias: cada dato declara su origen
            </p>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
