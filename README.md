# Arena de IAs

[![CI](https://github.com/Lean031110/arena-de-ias/actions/workflows/ci.yml/badge.svg)](https://github.com/Lean031110/arena-de-ias/actions/workflows/ci.yml)

Plataforma web profesional, en español, donde agentes de inteligencia artificial juegan,
compiten, evolucionan y —en fases posteriores— aprenden por refuerzo, forman equipos y
disputan torneos con estadística honesta.

> **Principio rector del proyecto: integridad de los datos.**
> Ninguna cifra se muestra sin provenir de una medición real o de un cálculo reproducible
> sobre registros reales. Si un dato no existe, la interfaz lo dice («Sin datos»,
> «Pendiente», «No medido»). Consulta la política completa en
> [`PROMPT_MAESTRO.md`](./PROMPT_MAESTRO.md) (§2) y su aplicación en
> [`docs/MODELO_DATOS.md`](./docs/MODELO_DATOS.md).

## Estado actual

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Arquitectura, auditoría, plan, criterios de aceptación | ✅ Completada |
| 1 | Motor de juegos, 6 variantes, 4 niveles de agentes, evaluación real, CI | ✅ Completada (re-auditada en Fase 2: 170/170, artefactos reproducibles) |
| 2 | Cerebros .lba, entrenamiento real PyTorch, registro, liga de versiones | ✅ Completada en su ámbito (re-auditada y corregida: workflow Kaggle reparado, afirmaciones estadísticas verificadas — 229/229 TS + 78/78 pytest; ver AUDITORIA-FASE2.md) |
| 3 | Equipos, plantel, mentoría | 🔄 Núcleo completado y medido (consulta, parejas, plantel persistente, mentoría real, evaluación de equipos: 276/276 TS + 83/83 pytest; UI de Fase 3 pendiente — ver FASE-3.md) |
| 4 | Torneos, Elo, Glicko-2, liga histórica | ⏳ Pendiente |
| 5 | Juegos restantes, descubrimiento de estrategias, garantías | ⏳ Pendiente |

Informes verificables por fase en [`docs/INFORMES/`](./docs/INFORMES/).

## Requisitos

- **Node.js ≥ 22.12** (desarrollado y verificado con Node 24 y 22).
- npm ≥ 10.
- Navegador moderno (IndexedDB, Web Workers). Sin dependencias de red en ejecución:
  la aplicación funciona 100 % sin conexión.

## Instalación y ejecución

```bash
# instalar dependencias (versiones exactas fijadas en package.json + package-lock.json)
npm ci

# desarrollo con recarga en caliente
npm run dev

# comprobación de tipos (TypeScript estricto, sin emitir archivos)
npm run typecheck

# lint (ESLint 10 + typescript-eslint, configuración plana)
npm run lint

# pruebas automatizadas (Vitest, una sola pasada, sin reloj)
npm test

# build de producción (salida en dist/)
npm run build

# vista previa del build de producción
npm run preview
```

Mediciones de evaluación y solucionador (scripts con `tsx`, solo desarrollo):

```bash
npm run medir:evaluacion   # evaluación round-robin de la Fase 1 → JSON con resultados reales
npm run medir:solucionador # resolución exacta de tableros pequeños → JSON con resultados reales
npx tsx scripts/verificar-lba.ts modelos/versionados/red-ter-3@1.0.1.lba 20   # valida un cerebro y juega partidas reales
npx tsx scripts/examinar.ts modelos/versionados/red-ter-3@1.0.1.lba 240 200   # examen de promoción reproducible
```

## Estructura del proyecto

```
arena-de-ias/
├── docs/                    # documentación de arquitectura, decisiones, modelo de datos…
│   └── INFORMES/            # informes verificables por fase (incluye auditorías)
├── entrenamiento/           # backend Python: motor gemelo, red PyTorch, autojuego,
│   │                        # entrenador CLI, lba.py, mentoría y pruebas (83) + kaggle/
├── modelos/versionados/     # cerebros .lba promovidos con índice de huellas
├── scripts/                 # mediciones reales + verificación y examen de cerebros
├── src/
│   ├── dominio/             # NÚCLEO: independiente de React y del navegador
│   │   ├── motor/           # contratos, RNG, partidas, eventos, evaluación, solucionador
│   │   ├── juegos/          # reglas de cada juego (tres en raya, gomoku, cuatro en raya)
│   │   ├── agentes/         # niveles 1-5: aleatorio, heurístico, minimax, MCTS, neural
│   │   ├── lba/             # paquete .lba: esquema, validador, exportador, safetensors
│   │   └── neural/          # runtime ts-puro (conv-politica-valor-v1) y observaciones
│   ├── aplicacion/          # IndexedDB, registro de cerebros, liga de versiones
│   ├── trabajadores/        # Web Worker: partidas, evaluaciones e inferencia neuronal
│   └── interfaz/            # React: arena, cerebros, evolución, resultados… (español)
├── .github/workflows/       # CI (tipos+lint+pruebas+build) y entrenamiento Kaggle manual
└── PROMPT_MAESTRO.md        # especificación maestra del proyecto (token redactado)
```

Regla arquitectónica clave: **la interfaz nunca decide** legalidad, final de partida ni
resultado. Todo eso vive en `src/dominio/`, sin dependencia de React.

## Juegos implementados (Fase 1)

| Juego | Dimensiones | Victoria | Estado |
|---|---|---|---|
| Tres en raya | 3×3 | 3 en línea | ✅ Implementado |
| Tres en raya | 4×4 | 4 en línea | ✅ Implementado |
| Gomoku | 7×7 / 9×9 / 15×15 | 5 o más en línea (estilo libre) | ✅ Implementado |
| Cuatro en raya | 7 columnas × 6 filas | 4 en línea con gravedad | ✅ Implementado |

Las 9 variantes restantes (Othello 4×4/6×6, damas reducida, Hex 5×5, Breakthrough 5×5,
ajedrez reducido 5×5/6×6, y dos variantes adicionales) están catalogadas con reglas
previstas en [`docs/JUEGOS.md`](./docs/JUEGOS.md) y planificadas para la Fase 5.

## Agentes (niveles de fuerza)

| Nivel | Agente | Método |
|---|---|---|
| 1 | Aleatorio | movimientos legales equiprobables (RNG con semilla) |
| 2 | Heurístico | gana si puede, bloquea amenazas inmediatas, evaluación posicional |
| 3 | Minimax | negamax con poda alfa-beta, ordenación de jugadas y presupuesto de nodos/profundidad |
| 4 | MCTS | UCT con rollouts aleatorios acotados y presupuesto exacto de simulaciones |
| 5 | Neuronal | red de política y valor (paquete `.lba`, runtime ts-puro) + MCTS-PUCT guiado |

El nivel 5 aparece al activar un cerebro `.lba` en la pestaña «Cerebros»: sin
paquete importado no hay agente neuronal simulado.

## Cerebros .lba (Fase 2)

- **Formato** [`docs/LBA-MODELO.md`](./docs/LBA-MODELO.md): ZIP con lista blanca,
  manifiesto validado con Zod, checksums SHA-256, pesos SafeTensors F32 y
  compatibilidad dura juego⇄modelo. La importación nunca ejecuta código arbitrario.
- **Entrenamiento** (`entrenamiento/`): PyTorch + autojuego PUCT en Python, con
  paridad TS⇄PyTorch demostrada por pruebas cruzadas. Continuable con
  `--reanudar` (el padre nunca se sobreescribe).
- **Registro y liga**: IndexedDB con estados derivados de eventos reales; examen
  de promoción con criterios congelados (ADR-007) que protege al campeón.
- **Modelos versionados**: [`modelos/versionados/`](./modelos/versionados/) con
  índice de huellas y exámenes.
- **Kaggle**: workflow manual (`train-kaggle.yml`) con recuperación verificable del
  `.lba`; requiere secretos `KAGGLE_USERNAME`/`KAGGLE_KEY` (no ejecutado sin ellos).

## Reproducibilidad

- Toda partida se ejecuta con un RNG propio derivado de una **semilla registrada** en el
  registro de la partida.
- Los registros guardan movimientos en notación textual; cualquier partida puede
  **reproducirse** y **validarse** moviemiento a movimiento.
- Las huellas de integridad (FNV-1a de 32 bits) cubren el núcleo determinista del registro
  y **no** son prueba criptográfica de autenticidad (limitación documentada).

## Desarrollo

- TypeScript estricto (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`…).
- ESLint 10 con `typescript-eslint` 8 (configuración plana) y reglas de hooks de React.
- Vitest 5: pruebas unitarias y de propiedades (bucles deterministas con semilla) sobre el
  dominio completo; `fake-indexeddb` para la capa de persistencia.
- Dependencias con **versión exacta** (sin rangos) y `package-lock.json` versionado.
- CI en GitHub Actions: `npm ci` → typecheck → lint → pruebas → build.

## Licencia

MIT — véase [`LICENSE`](./LICENSE).
