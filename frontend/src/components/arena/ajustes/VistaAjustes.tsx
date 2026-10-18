'use client';

/**
 * Vista «Ajustes»: tema, accesibilidad, visualización, almacenamiento,
 * estado de los servicios, versión y diagnóstico. El frontend nunca
 * guarda secretos (no hay tokens de ningún tipo en este prototipo).
 */

import * as React from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EncabezadoVista, InsigniaEstado, InsigniaProcedencia, PanelHUD, DatoEtiquetado } from '@/components/arena/comunes';
import { usePreferencias, type Densidad, type PreferenciaMovimiento } from '@/components/arena/shell/ProveedorTemayPreferencias';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { borrarAlmacenCompleto } from '@/lib/almacen-local';
import { diagnosticarNavegador, obtenerServicios } from '@/lib/servicios';
import { MOTOR_ORIGEN } from '@/motor-central/version';
import { navegarA } from '@/components/arena/shell/navegacion';
import { toast } from '@/hooks/use-toast';
import { Database, HardDrive, KeyRound, Monitor, Palette, ShieldCheck, Trash2 } from 'lucide-react';

export function VistaAjustes() {
  const { theme, setTheme } = useTheme();
  const { preferencias, actualizar } = usePreferencias();
  const almacen = useAlmacen();
  
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);

  const servicios = obtenerServicios();
  const diagnóstico = diagnosticarNavegador();
  const bytes = React.useMemo(() => {
    try {
      const bruto = window.localStorage.getItem('arena-prototipo-v1') ?? '';
      return new Blob([bruto]).size;
    } catch {
      return 0;
    }
  }, [almacen]);

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Ajustes"
        descripcion="Preferencias de la consola: tema, accesibilidad, visualización y estado real del sistema. Todo se guarda localmente en este navegador."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Apariencia */}
        <PanelHUD etiqueta="Apariencia" titulo="Tema y visualización" acciones={<Palette className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tema</Label>
              <Select value={montado ? (theme ?? 'dark') : 'dark'} onValueChange={(valor) => setTheme(valor)}>
                <SelectTrigger className="text-xs" aria-label="Tema de la interfaz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark" className="text-xs">Oscuro — Consola táctica</SelectItem>
                  <SelectItem value="light" className="text-xs">Claro — Laboratorio</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                El tema oscuro es el predeterminado; el claro mantiene la pauesta marfil del núcleo central.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Densidad de paneles</Label>
              <div className="flex gap-1.5" role="group" aria-label="Densidad">
                {(['comoda', 'compacta'] as const).map((valor: Densidad) => (
                  <Button
                    key={valor}
                    variant={preferencias.densidad === valor ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[11px] capitalize"
                    aria-pressed={preferencias.densidad === valor}
                    onClick={() => actualizar({ densidad: valor })}
                  >
                    {valor}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="transparencias" className="text-xs font-medium">
                  Reducir transparencias
                </Label>
                <p className="text-[10px] text-muted-foreground">Fondos opacos para máxima legibilidad.</p>
              </div>
              <Switch
                id="transparencias"
                checked={preferencias.reducirTransparencias}
                onCheckedChange={(valor) => actualizar({ reducirTransparencias: valor })}
                aria-label="Reducir transparencias"
              />
            </div>
          </div>
        </PanelHUD>

        {/* Accesibilidad */}
        <PanelHUD etiqueta="Accesibilidad" titulo="Movimiento e interacción" acciones={<Monitor className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Movimiento</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preferencia de movimiento">
                {(
                  [
                    { valor: 'auto', texto: 'Automático (sistema)' },
                    { valor: 'reducido', texto: 'Reducido' },
                    { valor: 'pleno', texto: 'Completo' },
                  ] as const
                ).map((opción) => (
                  <Button
                    key={opción.valor}
                    variant={preferencias.movimiento === opción.valor ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[11px]"
                    aria-pressed={preferencias.movimiento === opción.valor}
                    onClick={() => actualizar({ movimiento: opción.valor as PreferenciaMovimiento })}
                  >
                    {opción.texto}
                  </Button>
                ))}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                «Automático» respeta prefers-reduced-motion del sistema. Las animaciones de la consola son
                discretas: aparición de vistas, latidos de LED y transiciones cortas.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
              <p className="etiqueta-hud mb-1.5">Navegación por teclado</p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                <li><kbd className="rounded border border-border px-1 text-[10px]">Alt</kbd> + <span className="cifras">1…9 / 0</span> — cambiar de vista</li>
                <li><kbd className="rounded border border-border px-1 text-[10px]">Tab</kbd> — recorrer controles</li>
                <li>Tablero: <kbd className="rounded border border-border px-1 text-[10px]">flechas</kbd> mueven el cursor, <kbd className="rounded border border-border px-1 text-[10px]">Enter</kbd> juega</li>
                <li>Mapa táctico: <kbd className="rounded border border-border px-1 text-[10px]">flechas</kbd> desplazan cámara, <kbd className="rounded border border-border px-1 text-[10px]">+ −</kbd> zoom</li>
              </ul>
            </div>
          </div>
        </PanelHUD>

        {/* Almacenamiento */}
        <PanelHUD etiqueta="Datos" titulo="Almacenamiento local del prototipo" acciones={<Database className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
          <div className="space-y-3">
            <div className="space-y-1">
              <DatoEtiquetado etiqueta="Uso" mono>
                {(bytes / 1024).toFixed(1)} KB
              </DatoEtiquetado>
              <DatoEtiquetado etiqueta="Partidas" mono>
                {almacen.partidas.length}
              </DatoEtiquetado>
              <DatoEtiquetado etiqueta="Evaluaciones" mono>
                {almacen.evaluaciones.length}
              </DatoEtiquetado>
              <DatoEtiquetado etiqueta="Eventos de sesión" mono>
                {almacen.eventos.length}
              </DatoEtiquetado>
              <DatoEtiquetado etiqueta="Personalizaciones" mono>
                {Object.keys(almacen.personas).length}
              </DatoEtiquetado>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Este almacén NO es el registro experimental del núcleo: guarda partidas y evaluaciones reales
              ejecutadas localmente, marcadas como tales en toda la interfaz.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="size-3.5" aria-hidden="true" /> Borrar almacén local
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Borrar el almacén local del prototipo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán {almacen.partidas.length} partidas, {almacen.evaluaciones.length} evaluaciones,
                    los eventos de sesión y las personalizaciones guardadas en este navegador. El registro
                    experimental del núcleo (si existiera) no se ve afectado. La acción no tiene deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      borrarAlmacenCompleto();
                      toast({ title: 'Almacén borrado', description: 'La sesión continúa con el almacén vacío.' });
                    }}
                  >
                    Borrar todo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </PanelHUD>

        {/* Servicios y versión */}
        <PanelHUD etiqueta="Sistema" titulo="Estado de los servicios" acciones={<HardDrive className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
          <ul className="space-y-2">
            {servicios.map((servicio) => (
              <li key={servicio.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">{servicio.nombre}</p>
                  {servicio.fase !== undefined && (
                    <p className="cifras text-[9.5px] text-muted-foreground">{servicio.fase}</p>
                  )}
                </div>
                <InsigniaEstado estado={servicio.estado} conLed />
              </li>
            ))}
          </ul>
        </PanelHUD>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Versión */}
        <PanelHUD etiqueta="Acerca de" titulo="Versión y procedencia" acciones={<ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />}>
          <div className="space-y-1">
            <DatoEtiquetado etiqueta="Prototipo visual">Arena de IAs · consola de observación</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Stack">Next.js 16 · React 19 · Tailwind 4 · shadcn/ui</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Motor central" mono>
              {MOTOR_ORIGEN.repositorio.split('/').slice(-1)[0]}@{MOTOR_ORIGEN.commit}
            </DatoEtiquetado>
            <DatoEtiquetado etiqueta="Extraído" mono>
              {MOTOR_ORIGEN.fechaExtraccion}
            </DatoEtiquetado>
            <DatoEtiquetado etiqueta="Diferencia con el núcleo">
              núcleo: Vite + React 19 · prototipo: Next.js 16 (documentado para portabilidad)
            </DatoEtiquetado>
          </div>
          <div className="mt-2">
            <InsigniaProcedencia
              procedencia={{
                origen: 'medicion-directa',
                metodo: 'Datos leídos directamente del paquete vendorizado y del entorno de ejecución.',
                fuente: 'motor-local-vendorizado',
                commitMotor: MOTOR_ORIGEN.commit,
              }}
              compacta={false}
            />
          </div>
        </PanelHUD>

        {/* Diagnóstico */}
        <PanelHUD etiqueta="Compatibilidad" titulo="Diagnóstico del navegador">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {diagnóstico.map((prueba) => (
              <div key={prueba.nombre} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-2">
                <span
                  className={cn('led', prueba.ok ? 'bg-exito' : 'bg-peligro')}
                  aria-label={prueba.ok ? 'disponible' : 'no disponible'}
                />
                <span className="cifras text-[11px] font-medium text-foreground">{prueba.nombre}</span>
                <span className="ml-auto truncate text-[10px] text-muted-foreground">{prueba.detalle}</span>
              </div>
            ))}
          </div>
        </PanelHUD>
      </div>

      <PanelHUD etiqueta="Seguridad" titulo="La interfaz no guarda secretos">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Este prototipo no almacena tokens de ninguna clase (ni de Kaggle ni de otros servicios) en el
            navegador, en el almacén local ni en el estado de React. Tampoco envía archivos ni datos a
            servicios externos: toda la ejecución es local. Los cambios de configuración viajan por HTTPS
            únicamente en las peticiones normales de la aplicación.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="mt-2 text-[11px] text-muted-foreground" onClick={() => navegarA('panel')}>
          Volver al panel de control
        </Button>
      </PanelHUD>
    </div>
  );
}
