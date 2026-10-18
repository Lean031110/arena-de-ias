# Informe de Fase 1 — Motor, pruebas, niveles iniciales y evaluación real

Fecha: 2026-10-18 · Estado: **COMPLETADA CON SALVEDAD DECLARADA** (la red neuronal queda para Fase 2 según ADR-008; todo lo demás, verificado)

## A. Estado de la fase

Los 19 primeros criterios de aceptación de la Fase 1 (docs/CRITERIOS_ACEPTACION.md §Fase 1)
están satisfechos con evidencia real. El criterio 20 (primera red de política y valor)
**NO está satisfecho**: su contrato está definido y visible con estado «Pendiente», sin
pesos ni métricas simuladas (decisión ADR-008, coherente con la ruta de evolución de la
especificación §13: referencia → MCTS → red).

## B. Trabajo realizado

Módulos implementados (todo en `src/`):

- **Motor** (`dominio/motor/`): contratos `Juego`/`Agente` (tipos.ts), RNG mulberry32 con
  mezcla de semillas (rng.ts), huella FNV-1a y JSON canónico (huella.ts), errores tipados
  (errores.ts), registro de eventos (eventos.ts), validación de secuencias por replay
  (validacion.ts), cronista + ejecutor de partidas (partida.ts), evaluación round-robin con
  alternancia de lados y cancelación (evaluacion.ts), estadística Wilson (estadistica.ts),
  exportación CSV/JSON (exportacion.ts), solucionador exacto con TT y simetrías
  (solucionador.ts).
- **Juegos** (`dominio/juegos/`): fábrica de juegos de líneas (tres en raya 3×3 y 4×4,
  gomoku 7/9/15), cuatro en raya 7×6 con gravedad, catálogo de las 15 variantes con
  estados reales (registro.ts), ayudas de simetrías D4 y notación.
- **Agentes** (`dominio/agentes/`): nivel 1 aleatorio, nivel 2 heurístico táctico, nivel 3
  minimax α-β con presupuestos estrictos, nivel 4 MCTS-UCT con presupuesto exacto,
  contrato del nivel 5 neural (pendiente), registro/catálogo con validación de parámetros.
- **Aplicación** (`aplicacion/`): almacenamiento IndexedDB con validación Zod y aislamiento
  de registros corruptos.
- **Trabajador web** (`trabajadores/`): protocolo tipado, ejecución de partidas,
  evaluaciones con progreso real y cancelación entre partidas; cliente con degradación.
- **Interfaz** (`interfaz/`): aplicación completa en español (arena con partida paso a paso
  y jugador humano, tableros por juego, evaluación con progreso real y cancelación,
  resultados con IC, registro de eventos, catálogo de agentes/juegos, guía), tema
  claro/oscuro, móvil primero, accesible (etiquetas, foco visible, `prefers-reduced-motion`,
  `aria-live`).
- **Scripts de medición** (`scripts/`): evaluación y solucionador con artefactos JSON.
- **CI**: flujo de GitHub Actions (tipos + lint + pruebas + build) — ver §E.

## C. Pruebas ejecutadas

| Comando | Resultado | Pruebas | Fallos |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ sin errores | — | 0 |
| `npx eslint .` | ✅ sin errores ni avisos | — | 0 |
| `npx vitest run` | ✅ 19 archivos | **170** | 0 |
| `npm run build` | ✅ 152 módulos, 210 ms | — | 0 |
| `vite preview` + `curl` | ✅ HTTP 200 | — | 0 |
| `npm run medir:evaluacion` | ✅ artefacto JSON | 4 experimentos (504 partidas) | 0 |
| `npm run medir:solucionador` | ✅ artefacto JSON | 4 ejecuciones del solver | 0 |

Cobertura de las pruebas obligatorias de la especificación (§8): todas presentes y verdes
(mapping detallado en docs/PLAN_PRUEBAS.md §2) — movimientos ilegales imposibles, partidas
terminadas no continúan, resultado conforme a reglas, replay exacto, semillas registradas
y deterministas, serialización ida/vuelta (incluidas propiedades sobre estados aleatorios),
simetrías preservan legalidad/terminalidad/resultado, presupuestos respetados (profundidad,
nodos, simulaciones exactas), solucionador contra referencia conocida (3×3 = empate).

Limitaciones de cobertura declaradas: sin pruebas automáticas de componentes React ni del
trabajador en CI (PLAN_PRUEBAS §4); verificación manual de la interfaz realizada durante el
desarrollo (partida interactiva, evaluación con progreso, exportaciones, tema claro/oscuro).

## D. Mediciones reales (ninguna cifra simulada)

Entorno de medición: Node v24.21.0 (linux x64), 2 vCPU. Fuente: artefactos
`docs/INFORMES/datos/evaluacion-fase1.json` y `solucionador-fase1.json` (reproducibles con
las semillas registradas).

### D.1 Solucionador exacto (medición directa)

| Juego | Completo | Valor | Nodos | Tiempo | Presupuesto |
|---|---|---|---|---|---|
| Tres en raya 3×3 | sí | **0 (empate)** | 2.271 | 17,3 ms | 30 s |
| Tres en raya 4×4 | sí | **0 (empate)** | 6.460.009 | 48,6 s | 240 s |
| Gomoku 7×7 | no (presupuesto) | — | 67.584 | 1,0 s | 1 s (control) |
| Cuatro en raya 7×6 | no (presupuesto) | — | 331.776 | 1,0 s | 1 s (control) |

- El 3×3 coincide con la referencia pública (empate con juego perfecto) y las 9 jugadas
  iniciales resultan óptimas, como corresponde a un juego de empate.
- El 4×4 queda **resuelto localmente por primera vez en este proyecto**: empate con juego
  perfecto, 16 jugadas óptimas iniciales, consistencia padre/hijo verificada en 3 muestras
  (todas correctas). En CI no se ejecuta (2 vCPU); la suite verifica el presupuesto.
- Gomoku y cuatro en raya: **no resueltos localmente**; ninguna tasa empírica se presenta
  como garantía de estos juegos.

### D.2 Evaluación de niveles (medición directa; 4 experimentos, 504 partidas verificadas por replay)

Método: round-robin con alternancia de lados por encuentro; puntuación = (V + E/2)/n;
IC de Wilson 95 %. Presupuestos: minimax d4/60k nodos y MCTS 500 sim. en 3×3; d3/40k y 500
en 4×4; d3/30k y 300 en cuatro en raya; d2/20k y 200 en gomoku 7×7.

**Tres en raya 3×3** — 40 encuentros por par (120 partidas por agente), 3,0 s:

| Agente | V | E | D | Puntuación | IC 95 % |
|---|---|---|---|---|---|
| Aleatorio | 0 | 4 | 116 | 0,017 | [0,005; 0,059] |
| Heurístico | 52 | 68 | 0 | 0,717 | [0,630; 0,790] |
| Minimax α-β (d4) | 52 | 68 | 0 | 0,717 | [0,630; 0,790] |
| MCTS (500) | 37 | 58 | 25 | 0,550 | [0,461; 0,636] |

**Tres en raya 4×4** — 16 encuentros por par (48 partidas por agente), 3,6 s:

| Agente | V | E | D | Puntuación | IC 95 % |
|---|---|---|---|---|---|
| Aleatorio | 0 | 9 | 39 | 0,094 | [0,039; 0,209] |
| Heurístico | 15 | 33 | 0 | 0,656 | [0,515; 0,774] |
| Minimax α-β (d3) | 17 | 31 | 0 | 0,677 | [0,536; 0,792] |
| MCTS (500) | 9 | 37 | 2 | 0,573 | [0,433; 0,702] |

**Cuatro en raya 7×6** — 16 encuentros por par (48 partidas por agente), 2,4 s:

| Agente | V | E | D | Puntuación | IC 95 % |
|---|---|---|---|---|---|
| Aleatorio | 0 | 0 | 48 | 0,000 | [0,000; 0,074] |
| Heurístico | 30 | 0 | 18 | 0,625 | [0,484; 0,748] |
| Minimax α-β (d3) | 48 | 0 | 0 | 1,000 | [0,926; 1,000] |
| MCTS (300) | 18 | 0 | 30 | 0,375 | [0,252; 0,516] |

**Gomoku 7×7** — 12 encuentros por par (36 partidas por agente), 6,7 s:

| Agente | V | E | D | Puntuación | IC 95 % |
|---|---|---|---|---|---|
| Aleatorio | 1 | 1 | 34 | 0,042 | [0,010; 0,162] |
| Heurístico | 25 | 11 | 0 | 0,847 | [0,697; 0,930] |
| Minimax α-β (d2) | 24 | 11 | 1 | 0,819 | [0,665; 0,912] |
| MCTS (200) | 10 | 1 | 25 | 0,292 | [0,169; 0,454] |

Lecturas honestas (con las salvedades estadísticas obligatorias):

- El aleatorio es la línea base: pierde casi todo, como corresponde a la referencia mínima.
- El minimax d3 de cuatro en raya no perdió ninguna de sus 48 partidas **en esta muestra y
  con estos rivales y presupuestos**: 0 derrotas empíricas con IC [0,926; 1,000]. Eso NO
  constituye una garantía de invencibilidad (regla §2 de la especificación).
- MCTS con presupuestos modestos (300-500 simulaciones y rollouts aleatorios) queda por
  debajo de la búsqueda exacta táctica en tableros pequeños: esperado y registrado.
- En gomoku 7×7, el heurístico (0,847) y el minimax d2 (0,819) se solapan en sus IC:
  **no se declara superioridad** entre ellos con esta muestra.

### D.3 Datos ausentes (declarados)

- Pérdidas de entrenamiento: **Sin datos** (no hay red entrenada en Fase 1).
- Elo / Glicko-2: **Sin datos** (Fase 4).
- Uso de CPU/GPU en navegador: **No medido** (sin instrumentación; previsto).
- Curvas de aprendizaje: **Sin datos** (sin entrenamientos).

## E. Evidencia

- Artefactos de medición: `docs/INFORMES/datos/evaluacion-fase1.json` (incluye semillas,
  configuraciones, todas las partidas con sus jugadas y huellas) y
  `docs/INFORMES/datos/solucionador-fase1.json`.
- Suite de pruebas: 170 pruebas verdes (`npx vitest run`).
- Build de producción: `dist/` (trabajador web incluido en el bundle).
- CI de GitHub Actions: flujo `.github/workflows/ci.yml`. **Ejecución real verificada**:
  run **39149193576** sobre el commit `d5cfa37`, conclusión **success** en 27 s, con todos
  los pasos verdes (clonado, Node 22, `npm ci`, typecheck, lint, pruebas, build y subida
  del artefacto). URL del run:
  https://github.com/Lean031110/arena-de-ias/actions/runs/39149193576

## F. Limitaciones y riesgos

- Red neuronal diferida (criterio 20) — contrato definido, sin implementación.
- 6 de 15 variantes de juego; las 9 restantes catalogadas como pendientes.
- Reanudación de trabajos largos no implementada (solo cancelación con guardado de lo
  completado); checkpoints previstos en Fase 2.
- Reproducibilidad verificada en Node/V8; no verificada entre navegadores distintos.
- MCTS sin red: su fuerza depende del presupuesto; los rollouts caen en heurística al
  agotar el cap (estimación, documentada).
- El explorador de árboles completo (visitas por jugada, política previa/posterior) se
  muestra agregado (nodos/simulaciones/profundidad reales); el detalle por nodo llega con
  el MCTS guiado por red (Fase 2).

## G. Instrucciones de ejecución (entorno limpio)

```bash
git clone https://github.com/<usuario>/arena-de-ias.git
cd arena-de-ias
npm ci            # dependencias exactas (package-lock.json versionado)
npm run dev       # desarrollo: http://localhost:5173
npm test          # 170 pruebas
npm run typecheck && npm run lint && npm run build
npm run medir:evaluacion && npm run medir:solucionador   # re-genera los artefactos JSON
```

Requisitos: Node ≥ 22.12. Sin backend, sin conexión en ejecución.

## H. Siguiente fase

Para iniciar la Fase 2 (persistencia de cerebros y entrenamiento) se exige:

1. Red de política y valor real (TensorFlow.js con degradación) y entrenamiento por
   autojuego con buffer y simetrías.
2. Ninguna mejora declarada sin evaluación contra referencia congelada bajo el umbral de
   promoción (ADR-007: ≥ 200 partidas, puntuación ≥ 0,60, IC95 inf > 0,55).
3. Panel experimental con fuentes y métodos por indicador; series vacías mostradas como
   vacías.
4. Checkpoints y reanudación sin duplicación de eventos.
