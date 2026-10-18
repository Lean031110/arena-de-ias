# Guía de integración del prototipo visual en el núcleo

Objetivo: portar la experiencia visual de `frontend/` a la aplicación Vite del núcleo
(`src/interfaz/`) **sin crear una segunda implementación divergente**. El prototipo se diseñó
para que el port sea mecánico y auditable.

## 1. Por qué existe un prototipo Next.js

El prototipo se desarrolló en un entorno Next.js 16 independiente del repositorio (la vía segura
cuando no hay conexión con el repositorio del proyecto). Para no duplicar el motor, el dominio
del núcleo se **vendorizó sin modificar** en `frontend/src/motor-central/` (commit `a908319`).
Al portar al núcleo, esa carpeta desaparece y los imports vuelven a los módulos reales.

## 2. Qué portar y qué no

### Portar (JSX/CSS sin dependencias de Next)

| Ruta del prototipo | Destino sugerido en el núcleo |
|---|---|
| `src/components/arena/comunes.tsx` | `src/interfaz/componentes/comunes/` |
| `src/components/arena/shell/*` (marco, navegación, preferencias) | `src/interfaz/componentes/marco/` |
| `src/components/arena/panel/*` … `ajustes/*` | `src/interfaz/componentes/vistas/…` |
| `src/components/arena/arena/corredor.ts` | `src/interfaz/ganchos/corredor.ts` (o al trabajador web) |
| `src/lib/contratos.ts` | `src/interfaz/contratos.ts` — **sustituir las reexportaciones de `@/motor-central/...` por las rutas reales del dominio** (`../dominio/...`) |
| `src/lib/almacen-local.ts` | Descartable si se usa el almacén IndexedDB real del núcleo (`src/aplicacion/almacen.ts`) |
| `src/lib/sandbox/tactico/nucleo.ts` | `src/dominio/tactico/` cuando el motor de simulación exista (ya es TS puro sin React) |

### NO portar

- `src/motor-central/` — reemplazar por imports reales del dominio.
- `src/app/` — solo existe por Next.js; en el núcleo, montar el marco en `App.tsx`.
- `prisma/`, `Caddyfile`, scripts del entorno — no forman parte de la experiencia.

## 3. Pasos del port

1. **Tipos primero.** Copiar `lib/contratos.ts` y sustituir cada reexportación de
   `@/motor-central/X` por la ruta real (`../dominio/X`). El compilador marcará cualquier
   desalineación con el código real — esa es la prueba del contrato.
2. **Sistema de estilos.** El prototipo usa Tailwind 4 + tokens CSS. Dos vías:
   - *(recomendada)* portar los tokens de `globals.css` (`:root` y `.light`) a la hoja de estilos
     del núcleo y convertir las clases de utilidad a CSS plano, o
   - incorporar Tailwind al núcleo para toda la nueva interfaz.
3. **Componentes comunes** (`comunes.tsx`) no dependen de Next: solo de `cn()` (clsx+tailwind-merge)
   y de primitivas Radix ya presentes en shadcn. En el núcleo pueden reimplementarse sobre
   elementos nativos manteniendo los mismos nombres y props.
4. **Vistas.** Cada vista es un componente autónomo; montarlas en la navegación existente
   del núcleo (o adoptar su barra lateral).
5. **Corredor de partidas.** `corredor.ts` depende exclusivamente de `ejecutarPartida`,
   `crearAgente` y los tipos del dominio. Puede moverse tal cual; opcionalmente puede migrarse
   al trabajador web existente (protocolo `trabajadores/protocolo.ts`), sustituyendo las
   callbacks por respuestas del trabajador.
6. **Almacén.** Sustituir `guardarPartidaLocal/guardarEvaluacionLocal` por
   `Almacenamiento.guardarPartida/guardarEvaluacion` del núcleo. El resto de la UI no cambia:
   ya consume `RegistroPartida`/`RegistroEvaluacion` reales.
7. **Borrar `motor-central`** y ejecutar la batería completa del núcleo (`npm test`).

## 4. Contratos que el núcleo debe publicar (para consumirlos 1:1)

La interfaz espera consumir del núcleo (hoy reexportados desde la copia vendorizada):

- `Juego`, `Jugador`, `VistaTablero`, `EstadisticasBusqueda`, `Decision`, `ResultadoTerminal`
  (→ `dominio/motor/tipos.ts`)
- `RegistroPartida`, `ConfigPartida`, `ejecutarPartida`, `reproducirRegistro`
  (→ `dominio/motor/partida.ts`)
- `RegistroEvaluacion`, `ConfigEvaluacion` (→ `dominio/motor/evaluacion.ts`)
- `intervaloWilson` (→ `dominio/motor/estadistica.ts`)
- `DefinicionAgente`, `ParametroAgente`, `agentesDisponibles`, `configPorDefecto`
  (→ `dominio/agentes/registro.ts`)
- `EntradaJuego`, `juegosImplementados`, `obtenerJuego` (→ `dominio/juegos/registro.ts`)
- Almacenamiento: `Almacenamiento` (→ `aplicacion/almacen.ts`)

Nuevos necesarios para desbloquear vistas (pendientes de sus fases):

- Validador y runtime `.lba` (Fase 2) → desbloquea el importador.
- Árbol de búsqueda por jugada → desbloquea el explorador completo.
- Torneos/Elo (Fase 4) → desbloquea la pestaña persistente.
- Motor de simulación táctica compatible con `SimulationAdapter` (contrato en
  `lib/contratos.ts` §9, versión `0.1.0-sandbox` a negociar con el núcleo).

## 5. Componentes principales y sus props

| Componente | Props clave | Notas |
|---|---|---|
| `PanelHUD` | `titulo?`, `etiqueta?`, `acciones?`, `contenidoClassName?` | Panel con corchetes HUD; sustituye a las tarjetas planas. |
| `TarjetaMetrica` | `etiqueta`, `valor`, `unidad?`, `descripcion`, `procedencia: MetricProvenance`, `alVerOrigen?`, `estado?` | Muestra «Sin datos» si `valor === null` u origen ausente. |
| `EstadoVacio` | `titulo`, `descripcion`, `icono?`, `accion?`, `compacto?` | Estado vacío estándar con explicación útil. |
| `InsigniaEstado` | `estado: EstadoServicio`, `conLed?` | conectado/local/desconectado/pendiente/error. |
| `InsigniaProcedencia` | `procedencia: MetricProvenance`, `compacta?` | El «color de la verdad» de cada dato. |
| `Tablero` | `juego`, `vista`, `aceptaEntrada`, `onJugada`, `validar` | Renderiza `VistaTablero` de cualquier juego celda/columna; teclado flechas+Enter. |
| `CorredorPartida` | `config: ConfigPartida`, `eventos: EventosCorredor` | Reproducción real sobre `ejecutarPartida` con compuerta de pausa/paso/velocidad. |
| `ReproductorRegistro` | `registro: RegistroPartida`, `compacto?` | Depuración temporal de partidas registradas. |
| `RendererMapa` | `estado: SimulationState`, `selección`, `celdasAlcanzables`, `objetivosAtacables`, `alSeleccionar`, `alClicCelda` | SVG táctico con zoom/pan/teclado; cero lógica de reglas. |
| `SimulacionTactica` | — (implementa `SimulationAdapter`) | `obtenerEstado/despachar/suscribir/ordenesDisponibles`. |

## 6. Sincronización del motor vendorizado

Mientras exista `frontend/src/motor-central`:

```bash
# desde frontend/ (una sola vez por sincronización)
git -C ../ fetch origin
rm -rf src/motor-central
git -C ../ archive <commit> src/dominio | tar -x --strip-components=2 -C src/motor-central
# luego: eliminar *.test.ts, copiar PROCEDENCIA.md y version.ts (ver PROCEDENCIA.md)
```

Regla inviolable: **jamás editar archivos de esa carpeta**; las correcciones pertenecen al
núcleo y se sincronizan desde él.
