'use client';

/**
 * Vista «Importador .lba» — inspección honesta de paquetes de cerebros.
 *
 * El formato .lba (manifiesto versionado, integridad, runtime) pertenece
 * a la Fase 2 del núcleo y NO existe aún. Esta vista:
 *  - separa SELECCIÓN de VALIDACIÓN (la extensión no valida nada),
 *  - muestra exactamente qué falta,
 *  - no envía el archivo a ningún servicio externo,
 *  - no ejecuta contenido del paquete,
 *  - deshabilita la carga de cerebros hasta que exista validador real.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EncabezadoVista, EstadoVacio, InsigniaProcedencia, PanelHUD, DatoEtiquetado } from '@/components/arena/comunes';
import { useAlmacen } from '@/components/arena/shell/useAlmacen';
import { registrarImportacionLba } from '@/lib/almacen-local';
import { formatearFecha } from '@/lib/contratos';
import { CheckCircle2, FileBox, FileWarning, PackageOpen, ShieldAlert, UploadCloud, XCircle } from 'lucide-react';

interface ArchivoInspeccionado {
  readonly nombre: string;
  readonly tamaño: number;
  readonly extensión: string;
  readonly firmaHex: string;
  readonly binario: boolean;
}

function leerFirma(archivo: File): Promise<{ firmaHex: string; binario: boolean }> {
  return new Promise((resolver) => {
    const lector = new FileReader();
    lector.onload = () => {
      const buffer = new Uint8Array(lector.result as ArrayBuffer);
      const firmaHex = Array.from(buffer.slice(0, 16))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');
      const binario = buffer.slice(0, 64).some((byte) => byte === 0 || byte > 0x7f);
      resolver({ firmaHex, binario });
    };
    lector.onerror = () => resolver({ firmaHex: '—', binario: true });
    lector.readAsArrayBuffer(archivo.slice(0, 64));
  });
}

const REQUISITOS_PENDIENTES = [
  {
    titulo: 'Manifiesto versionado (.lba)',
    detalle: 'La Fase 2 debe definir la estructura declarada: versión de formato, arquitectura, juego compatible, versión de reglas y runtime requerido.',
  },
  {
    titulo: 'Validador real',
    detalle: 'Comprobación de integridad del paquete. La interfaz solo mostrará el veredicto que emita el validador, nunca lo deducirá por la extensión.',
  },
  {
    titulo: 'Runtime de inferencia',
    detalle: 'Ejecución del cerebro (red de política y valor) en el motor. Sin runtime no hay «carga de cerebro» posible.',
  },
  {
    titulo: 'Registros de entrenamiento y evaluación',
    detalle: 'El manifiesto debería resumir entrenamiento y evaluaciones cuando existan; hoy no existen registros que resumir.',
  },
];

export function VistaImportador() {
  const almacen = useAlmacen();
  const [archivo, setArchivo] = React.useState<ArchivoInspeccionado | null>(null);
  const [arrastrando, setArrastrando] = React.useState(false);
  const entradaRef = React.useRef<HTMLInputElement>(null);

  const inspeccionar = async (archivo: File): Promise<void> => {
    const { firmaHex, binario } = await leerFirma(archivo);
    const extensión = archivo.name.includes('.') ? `.${archivo.name.split('.').pop()}` : '(sin extensión)';
    setArchivo({
      nombre: archivo.name,
      tamaño: archivo.size,
      extensión,
      firmaHex,
      binario,
    });
    const veredicto =
      extensión !== '.lba'
        ? `Extensión «${extensión}»: el paquete no se ajusta al nombre esperado, pero ojo: la extensión correcta tampoco validaría nada (validador pendiente).`
        : 'Paquete seleccionado con extensión .lba. La selección no implica validez: el validador real está pendiente (Fase 2).';
    registrarImportacionLba(archivo.name, archivo.size, veredicto);
  };

  const alSoltar = (evento: React.DragEvent<HTMLDivElement>): void => {
    evento.preventDefault();
    setArrastrando(false);
    const fichero = evento.dataTransfer.files[0];
    if (fichero !== undefined) void inspeccionar(fichero);
  };

  return (
    <div className="space-y-4">
      <EncabezadoVista
        titulo="Importador de cerebros «.lba»"
        descripcion="Flujo de inspección preparado para la Fase 2 del núcleo. Hoy examina el paquete localmente (nombre, tamaño, firma inicial) y declara exactamente qué falta para una validación real."
      />

      <Alert className="border-advertencia/30 bg-advertencia/[0.06]">
        <ShieldAlert className="size-4 text-advertencia" aria-hidden="true" />
        <AlertTitle className="text-sm">Validación real: pendiente de conexión</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          El formato de cerebros .lba forma parte de la <strong>Fase 2 del núcleo central</strong> y todavía
          no existe. Esta interfaz no declara válido ningún archivo por terminar en «.lba»: solo la Fase 2
          podrá emitir ese veredicto. El archivo <strong>no se envía a ningún servicio externo</strong> ni se
          ejecuta nada de su contenido.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* Zona de arrastre */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Zona para soltar o seleccionar un paquete .lba"
            onClick={() => entradaRef.current?.click()}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' || evento.key === ' ') {
                evento.preventDefault();
                entradaRef.current?.click();
              }
            }}
            onDragOver={(evento) => {
              evento.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={alSoltar}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              arrastrando ? 'border-acento bg-acento/10' : 'border-border hover:border-acento/50 hover:bg-acento/[0.04]',
            )}
          >
            <UploadCloud className={cn('size-9', arrastrando ? 'text-acento' : 'text-muted-foreground')} aria-hidden="true" />
            <div>
              <p className="display-tactico text-sm font-semibold text-foreground">
                Suelta aquí un paquete «.lba» o pulsa para seleccionarlo
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inspección local: nombre, tamaño y firma inicial de bytes. Nada sale de tu navegador.
              </p>
            </div>
            <input
              ref={entradaRef}
              type="file"
              className="sr-only"
              accept=".lba,.json,.bin,application/octet-stream"
              onChange={(evento) => {
                const fichero = evento.target.files?.[0];
                if (fichero !== undefined) void inspeccionar(fichero);
                evento.target.value = '';
              }}
            />
          </div>

          {/* Resultado de la inspección */}
          {archivo === null ? (
            <PanelHUD etiqueta="Estado" titulo="Sin paquete seleccionado">
              <EstadoVacio
                compacto
                titulo="Ningún archivo inspeccionado"
                descripcion="Al seleccionar un paquete verás su nombre, tamaño, extensión y firma inicial de bytes — datos reales leídos localmente."
                icono={PackageOpen}
              />
            </PanelHUD>
          ) : (
            <PanelHUD
              etiqueta="Inspección local"
              titulo={archivo.nombre}
              acciones={
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setArchivo(null)}>
                  Quitar
                </Button>
              }
            >
              <div className="space-y-3">
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <DatoEtiquetado etiqueta="Nombre del paquete">{archivo.nombre}</DatoEtiquetado>
                  <DatoEtiquetado etiqueta="Tamaño" mono>
                    {(archivo.tamaño / 1024).toFixed(1)} KB ({archivo.tamaño.toLocaleString('es-ES')} bytes)
                  </DatoEtiquetado>
                  <DatoEtiquetado etiqueta="Extensión" mono>
                    {archivo.extensión}
                  </DatoEtiquetado>
                  <DatoEtiquetado etiqueta="Contenido" mono>
                    {archivo.binario ? 'binario (primeros 64 bytes)' : 'textual en los primeros bytes'}
                  </DatoEtiquetado>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/40 p-2.5">
                  <p className="etiqueta-hud mb-1">Firma inicial (hex) — medición directa de lectura local</p>
                  <p className="cifras break-all text-[11px] text-foreground">{archivo.firmaHex}</p>
                </div>

                {/* Veredicto */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border border-advertencia/40 bg-advertencia/10 px-3 py-2">
                    <FileWarning className="size-4 shrink-0 text-advertencia" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold text-advertencia">Estado de validación: validador no disponible</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        La selección de archivo <strong>no es</strong> una validación. El veredicto «válido /
                        inválido» lo emitirá el validador real de la Fase 2.
                      </p>
                    </div>
                  </div>

                  {/* Pasos del flujo */}
                  <ol className="grid gap-1.5 sm:grid-cols-2" aria-label="Estado del flujo de importación">
                    {[
                      { n: 1, texto: 'Selección del archivo', ok: true },
                      { n: 2, texto: 'Inspección local (nombre, tamaño, firma)', ok: true },
                      { n: 3, texto: 'Validación real del manifiesto', ok: false },
                      { n: 4, texto: 'Confirmación y carga del cerebro', ok: false },
                    ].map((paso) => (
                      <li
                        key={paso.n}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]',
                          paso.ok ? 'border-exito/30 bg-exito/10 text-foreground' : 'border-border bg-muted/40 text-muted-foreground',
                        )}
                      >
                        {paso.ok ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-exito" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span>
                          {paso.n}. {paso.texto}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <Button disabled className="w-full gap-2 opacity-70" aria-describedby="porque-bloqueada">
                    <FileBox className="size-4" aria-hidden="true" />
                    Cargar cerebro en el motor (requiere validador real)
                  </Button>
                  <p id="porque-bloqueada" className="text-center text-[10px] leading-snug text-muted-foreground">
                    Bloqueado honestamente: cargar un paquete sin validación real contradiría el principio de
                    integridad del proyecto.
                  </p>
                </div>
              </div>
            </PanelHUD>
          )}
        </div>

        {/* Columna derecha */}
        <div className="space-y-4">
          <PanelHUD etiqueta="Integración" titulo="Qué falta exactamente">
            <ul className="space-y-2">
              {REQUISITOS_PENDIENTES.map((requisito) => (
                <li key={requisito.titulo} className="rounded-lg border border-border/60 bg-card/40 p-2.5">
                  <p className="text-[11px] font-semibold text-foreground">{requisito.titulo}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{requisito.detalle}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <InsigniaProcedencia
                procedencia={{
                  origen: 'ausente',
                  metodo: 'No existe validador .lba: la Fase 2 del núcleo define formato, integridad y runtime.',
                  fuente: 'almacen-central',
                }}
                compacta={false}
              />
            </div>
          </PanelHUD>

          <PanelHUD etiqueta="Almacén local" titulo="Paquetes inspeccionados">
            {almacen.paquetesLba.length === 0 ? (
              <EstadoVacio compacto titulo="Sin historial" descripcion="Los paquetes que inspecciones quedarán registrados aquí (solo metadatos locales)." />
            ) : (
              <ul className="space-y-1.5">
                {almacen.paquetesLba.slice(0, 8).map((paquete) => (
                  <li key={paquete.id} className="rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5">
                    <p className="truncate text-[11px] font-medium text-foreground">{paquete.nombreArchivo}</p>
                    <p className="cifras text-[10px] text-muted-foreground">
                      {(paquete.tamanoBytes / 1024).toFixed(1)} KB · {formatearFecha(paquete.fecha)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PanelHUD>
        </div>
      </div>
    </div>
  );
}
