<!-- Banner del prototipo — también disponible en docs/assets/logo-banner.svg -->

<div align="center">

<img src="../docs/assets/logo-banner.png" alt="Arena de IAs — laboratorio de competición de agentes" width="520">

# Prototipo visual — «Consola de observación»

**Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui**

[Interfaz del núcleo](../src/interfaz/) · [Informe verificable](../docs/frontend/INFORME-VISUAL.md) · [Guía de integración](../docs/frontend/INTEGRACION.md)

</div>

---

## Qué es esto

Este directorio contiene el **prototipo visual** de la plataforma *Arena de IAs*: la experiencia de
observación de agentes — panel de control, simulador de partidas, terreno táctico 2D, plantel,
importador de cerebros, explorador de búsqueda, torneos y auditoría — desarrollada como
**aplicación aislada y portable**, lista para incorporarse al núcleo.

**Relación con el núcleo central (importante):**

| Aspecto | Estado |
|---|---|
| Reglas y agentes de juego | ✅ **Reales**: el dominio del núcleo está vendorizado en `src/motor-central/` (commit `a908319`, sin modificar ni un byte). Las partidas de este prototipo se ejecutan con las mismas reglas, semillas, presupuestos y estadísticas del núcleo. |
| Contratos TypeScript | ✅ Reexportados 1:1 desde el motor vendorizado en `src/lib/contratos.ts` (nunca redeclarados). |
| Registro experimental central | ❌ No conectado: partidas y evaluaciones se guardan en el **almacén local del prototipo** (localStorage), marcado como tal en toda la interfaz. |
| Entrenamiento neuronal / `.lba` | ❌ Pendiente de la Fase 2 del núcleo: la interfaz lo declara y bloquea honestamente. |
| Torneos persistentes / Elo | ❌ Pendiente de la Fase 4 (la evaluación comparativa local sí funciona). |
| Simulación táctica 2D | 🧪 Sandbox visual con **contrato propio** (`arena-tactica-2d v0.1.0-sandbox`), separado del renderizador. |

La **política de integridad de datos** del proyecto se respeta al pie de la letra: ninguna métrica
se muestra sin su procedencia (medición directa / cálculo sobre registros / estimación / ausente),
las estructuras sintéticas llevan marca permanente de demostración, y los servicios sin conectar
producen estados vacíos claros — nunca cifras decorativas.

## Puesta en marcha

```bash
cd frontend
bun install        # o npm install / pnpm install
bun run dev        # desarrollo en http://localhost:3000
```

Comprobaciones de calidad:

```bash
bun run lint       # ESLint (configuración del prototipo)
bunx tsc --noEmit  # TypeScript estricto, cero errores
```

> El prototipo se desarrolló con Bun; `npm install` también funciona con el `package.json` incluido.

## Vistas de la consola

| Vista | Contenido | Estado |
|---|---|---|
| **Panel de control** | Métricas reales, servicios, verificación de humo del motor en vivo, actividad local | ✅ |
| **Simulador de partidas** | 6 juegos reales del núcleo, agentes reales (humano/aleatorio/heurístico/minimax/MCTS), reproducción con pausa/paso/velocidad, candidatos, presupuesto, historial | ✅ |
| **Simulador táctico** | Mapa SVG 20×12, terreno, 2 facciones, unidades con roles, economía, capturas, órdenes, crónica, zoom/pan, reproducción temporal | 🧪 Sandbox |
| **Plantel de IAs** | Fichas del catálogo real (incluido el neuronal «pendiente Fase 2»), comparador, personalización local | ✅ |
| **Importador «.lba»** | Inspección local real (nombre, tamaño, firma hex), validación honestamente pendiente, carga bloqueada | ✅ (esperando Fase 2) |
| **Entrenamiento** | Estados futuros descritos, sin datos fabricados | ⏳ Fase 2 |
| **Búsqueda y repetición** | Estadísticas reales por jugada de partidas guardadas, presupuesto por bando, árbol demo identificado | ✅ |
| **Torneos** | Round-robin local real con IC de Wilson del núcleo; formatos persistentes deshabilitados | ✅ / ⏳ Fase 4 |
| **Estrategias y auditoría** | Catálogo vacío (Fase 5) + trazabilidad de cada métrica con «Ver origen» | ✅ |
| **Ajustes** | Tema claro/oscuro, movimiento reducido, densidad, almacenamiento, servicios, versión, diagnóstico | ✅ |

## Arquitectura del prototipo

```
frontend/src/
├── motor-central/          # 📌 Núcleo REAL vendorizado (commit a908319) — NO MODIFICAR
│   ├── PROCEDENCIA.md      #    reglas de sincronización y qué significa «local»
│   └── version.ts           #    único archivo propio: commit y modo de ejecución
├── lib/
│   ├── contratos.ts         # Contratos de integración (reexporta 1:1 del motor)
│   ├── servicios.ts         # Registro de servicios con estados REALES + verificaciones
│   ├── almacen-local.ts      # Almacén del prototipo (localStorage, degradación a memoria)
│   └── sandbox/tactico/
│       └── nucleo.ts        # Simulación táctica pura (sin React) + adaptador del contrato
├── components/
│   ├── ui/                  # shadcn/ui (primitivas)
│   └── arena/               # 🎨 Sistema visual de la consola
│       ├── comunes.tsx      #    PanelHUD, TarjetaMetrica, InsigniaProcedencia, EstadoVacio…
│       ├── shell/           #    Marco, navegación por fragmento, temas y preferencias
│       ├── panel/ arena/ tactico/ plantel/ importador/
│       ├── entrenamiento/ explorador/ torneos/ estrategias/ ajustes/
│       └── arena/corredor.ts  # Corredor de partidas en vivo sobre ejecutarPartida real
└── app/                     # Next.js App Router (ruta única «/»; vistas por hash #/…)
```

**Separación estricta de dominio y presentación:** ningún componente decide legalidad, resultados
ni estadísticas — todo proviene del motor vendorizado o de registros guardados. El simulador
táctico mantiene su lógica en `lib/sandbox/tactico/nucleo.ts` y el renderizador
(`components/arena/tactico/RendererMapa.tsx`) solo pinta el estado del contrato.

## Sistema visual

- **Identidad**: continuación deliberada de la del núcleo — ámbar `#E8B64C` sobre azul noche
  `#0A0F1C`, fichas de jugador 1 dorada / jugador 2 azul `#7CC4FF`. Tema claro «laboratorio» en
  marfil, coherente con la hoja de estilos del núcleo.
- **Tipografía**: *Chakra Petch* (display táctico, autohospedada en build), *Geist* (cuerpo) y
  *Geist Mono* (cifras de consola). Sin fuentes remotas en ejecución.
- **Texturas**: rejilla técnica, corchetes HUD y leds de estado en CSS puro; mapa táctico en SVG
  generado por código. Cero imágenes externas.
- **Accesibilidad**: foco visible, `aria-label` en tablero y mapa, navegación completa por teclado
  (Alt+1…0 para vistas; flechas+Enter en tableros; flechas/± en el mapa), movimiento reducido
  configurable que respeta `prefers-reduced-motion`, contraste AA.
- **Componentes documentados**: ver `docs/frontend/INTEGRACION.md` §Componentes.

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Alt` + `1…9` / `0` | Cambiar de vista |
| `Tab` | Recorrer controles (enlace «Saltar al contenido» incluido) |
| Flechas + `Enter`/`Espacio` | Jugar en el tablero (cursor móvil) |
| Flechas / `+` `-` | Cámara del mapa táctico (desplazar / zoom) |

## Almacenamiento y privacidad

El prototipo usa una única clave de localStorage (`arena-prototipo-v1`) para partidas,
evaluaciones, eventos de sesión y personalizaciones locales. **No guarda tokens ni secretos de
ningún tipo**, no envía archivos a servicios externos y no ejecuta contenido de paquetes
importados. Todo puede borrarse desde Ajustes.

## Licencias y atribuciones

Recursos de creación propia (logotipo, texturas, diagramas) más dependencias FOSS — detalle
completo en [`docs/frontend/ATRIBUCIONES.md`](../docs/frontend/ATRIBUCIONES.md).
