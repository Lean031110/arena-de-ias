# Informe verificable — Prototipo visual de Arena de IAs

**Entrega:** 1–6 (auditoría visual → integración) · **Fecha:** 2026-10-18/19 · **Rama:** `frontend/prototipo-visual`
**Motor central vendorizado:** `Lean031110/arena-de-ias` @ `a908319` (extraído 2026-10-18, sin modificaciones)

---

## 1. Verificación de conexión con el repositorio

- El entorno de desarrollo del prototipo **no está conectado** al repositorio central
  (`git remote -v` vacío). No es el proyecto Lovable original; es un entorno Next.js 16 independiente.
- En consecuencia, **no se ha modificado `main` ni ningún archivo del núcleo**. Toda la entrega
  vive en la rama `frontend/prototipo-visual` bajo `frontend/`, `docs/assets/`, `docs/screenshots/`
  y `docs/frontend/`, más una actualización **aditiva** del `README.md` raíz (logo y sección del
  prototipo; el contenido previo se conserva íntegro).
- La inspección del núcleo se realizó sobre un clon de solo lectura con el PAT proporcionado por
  el propietario (el token no se guarda en ningún archivo ni en el frontend).

## 2. Qué se entregó

### 2.1 Motor real vendorizado (no una segunda implementación)

| Elemento | Detalle |
|---|---|
| `frontend/src/motor-central/` | Copia exacta de `src/dominio/` del núcleo (24 archivos TS, tests excluidos). **Diff 1:1 verificable** contra `a908319`. |
| Reglas ejecutadas | `tres-en-raya-3/4`, `gomoku-7/9/15`, `cuatro-en-raya-7x6` — las mismas del núcleo. |
| Agentes ejecutados | humano, aleatorio, heurístico, minimax α-β, MCTS — con sus parámetros validables y presupuestos reales. |
| Estadística | `intervaloWilson` del núcleo para los IC 95 % de la evaluación local. |
| Registros | `RegistroPartida` real (semilla, huella, validez por replay, entorno) guardado en el almacén local. |

### 2.2 Sistema visual

- Tokens claro/oscuro con continuidad de la identidad del núcleo (ámbar `#E8B64C`, navy `#0A0F1C`,
  jugador 2 azul `#7CC4FF`), tipografía táctica *Chakra Petch* autohospedada, texturas CSS/SVG
  propias (rejilla, corchetes HUD, leds), logotipo SVG de creación propia (marca + banner).
- Componentes comunes: `PanelHUD`, `TarjetaMetrica` (con procedencia y «Ver origen»),
  `InsigniaEstado`, `InsigniaProcedencia`, `MarcaDemo`, `MarcaLocal`, `EstadoVacio`,
  `EncabezadoVista`, `DatoEtiquetado`.
- Shell: barra lateral agrupada (10 vistas), barra superior con estado real del motor,
  navegación por fragmento de URL, atajos `Alt+1…0`, cajón móvil, tema claro/oscuro,
  preferencias de movimiento/densidad/transparencias persistidas.

### 2.3 Contratos de integración (`frontend/src/lib/contratos.ts`)

Reexportaciones 1:1 del núcleo (`Juego`, `RegistroPartida`, `RegistroEvaluacion`,
`EstadisticasBusqueda`, `DefinicionAgente`, `EntradaJuego`, `Evento`…) más las proyecciones
requeridas: `AgentSummary`, `LbaManifestSummary`, `MatchSummary`, `MetricProvenance`,
`TrainingRunSummary`, `CandidateMove`, `SearchTreeNode`, `SimulationState`, `SimulationCommand`,
`SimulationAdapter` (contrato táctico propio `arena-tactica-2d v0.1.0-sandbox` con esquema de
observación y catálogo de acciones).

## 3. Pruebas realizadas (E2E, navegador real)

| # | Prueba | Resultado |
|---|---|---|
| 1 | Carga de `/` sin errores de consola ni de hidratación | ✅ (tras corregir 2 errores de hidratación detectados en pruebas, ver §5) |
| 2 | Navegación a las 10 vistas por hash y por menú | ✅ |
| 3 | **Partida humano vs heurístico (tres en raya)**: jugadas humanas aplicadas tras validación del motor; el agente responde con jugadas legales (centro `b2`, bloqueo `a1`); victoria detectada por el motor (diagonal a1-b2-c3) | ✅ |
| 4 | **Partida automática aleatorio vs heurístico**: reproducción, **pausa** (contador congelado), **paso** (2→3 jugadas), final con victoria del heurístico | ✅ |
| 5 | Guardado de partidas en almacén local (`validez: verificada`, 6 jugadas, semilla y huella registradas) | ✅ |
| 6 | Repetición de partida registrada: reproductor con depuración temporal jugada a jugada | ✅ |
| 7 | **Evaluación round-robin local** (aleatorio/heurístico/minimax × 2 encuentros/par): 12 partidas reales ejecutadas, progreso visible, tabla con IC de Wilson (heurístico y minimax 75 % [41–93 %] n=8; aleatorio 0 %) y guardado del registro con huella | ✅ |
| 8 | **Simulador táctico**: arranque, avance de ticks (t17+), eventos (capturas/producción/ataques), selección de unidad con panel contextual (PV/ataque/PA/posición), pausa, reproducción temporal | ✅ |
| 9 | **Importador .lba**: selección de archivo → inspección real (nombre, KB, firma hex `7b 22 66 6f…`), estado «validador no disponible», carga bloqueada con explicación, historial local | ✅ |
| 10 | Plantel: fichas del catálogo real, comparador (2 agentes), diálogo de ficha | ✅ |
| 11 | Tema claro/oscuro conmutado en vivo; vista móvil (390 px) sin desbordes ni elementos cortados (verificado visualmente con VLM) | ✅ |
| 12 | `bun run lint` y `bunx tsc --noEmit`: **cero errores** | ✅ |
| 13 | Movimiento reducido (manual y `prefers-reduced-motion`) aplica la clase global que anula animaciones | ✅ |

Evidencia gráfica: `docs/screenshots/` (panel, arena, táctico, plantel, torneos, explorador,
móvil y tema claro).

## 4. Estado de integración por servicio

| Servicio | Estado | Nota |
|---|---|---|
| Motor de juegos | **Local vendorizado** | Reglas/agentes reales en navegador; commit `a908319`. |
| Registro experimental central | **Desconectado** | El prototipo usa su almacén local propio, marcado como tal. |
| Cerebros `.lba` | **Pendiente (Fase 2)** | Validador y runtime inexistentes; la UI lo declara y bloquea. |
| Entrenamiento | **Pendiente (Fase 2)** | Sin datos; ninguna cifra fabricada. |
| Torneos persistentes / Elo | **Pendiente (Fase 4)** | Evaluación comparativa local disponible hoy. |
| Simulación táctica | **Sandbox local** | Contrato propio `arena-tactica-2d v0.1.0-sandbox`. |
| Descubrimiento de estrategias | **Pendiente (Fase 5)** | Catálogo vacío con esquema previsto documentado. |

## 5. Incidencias detectadas y corregidas durante las pruebas

1. **Hidratación (2 errores)**: el almacén local y el registro de servicios leían
   `window`/`localStorage` durante el render de servidor → texto divergente. Corregido con
   `getServerSnapshot` canónico (vacío) y servicios puros sin acceso a `window`.
2. **Bloqueo de configuración al terminar una partida** (`corriendo` no se restablecía).
   Corregido con `finally` en el corredor.
3. **Error de nombre** `faccion`/`facción` en el núcleo táctico (detectado por pruebas de
   navegador; los linters de nombres no aplican a identificadores acentuados). Corregido.
4. **Errores de tipos** detectados con `tsc --noEmit` (decisor genérico, `ganador` opcional,
   tipos mutables internos del sandbox). Todos corregidos; verificación final limpia.

## 6. Trabajo pendiente (propuesto)

- [ ] Sustituir el almacén local por el registro experimental del núcleo cuando la Fase 2 lo
      publique (contrato ya alineado).
- [ ] Conectar el validador `.lba` real y habilitar la carga de cerebros (la UI ya distingue
      selección de validación).
- [ ] Exponer el árbol de búsqueda por jugada desde el motor (el explorador ya distingue
      estadísticas reales de estructura demo).
- [ ] Portar los componentes `components/arena/*` a la app Vite del núcleo siguiendo
      `docs/frontend/INTEGRACION.md` y eliminar `src/motor-central` (sustituir por import reales).
- [ ] Sincronizar `frontend/src/motor-central` con nuevos commits del núcleo antes de cada port
      (procedimiento en `motor-central/PROCEDENCIA.md`).

## 7. Diferencias de stack (declaradas)

| | Núcleo (`src/interfaz`) | Prototipo (`frontend/`) |
|---|---|---|
| Empaquetador | Vite 8 | Next.js 16 (App Router) |
| Estilos | CSS plano con variables | Tailwind 4 + tokens CSS + shadcn/ui |
| Estado | ganchos React | ganchos React + `useSyncExternalStore` |
| Motor | import directo | vendorizado en `src/motor-central` (reemplazable por import reales al portar) |

La portabilidad está garantizada porque **ningún componente importa el motor directamente**:
todo pasa por `lib/contratos.ts` y `lib/servicios.ts`, y los componentes visuales son JSX+CSS
sin dependencias de Next (solo el `app/` envuelve).
