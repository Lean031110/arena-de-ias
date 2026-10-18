# Informe de Fase 3 — Equipos y plantel

Fecha: 2026-10-19 · Rama: `feat/fase3-equipos-plantel` (base:
`feat/lba-model-registry-training` — relación documentada en §G). Estado:
**COMPLETADA EN SU ÁMBITO DECLARADO** (modo consulta, partidas por parejas,
plantel persistente, mentoría/destilación real ejecutada y evaluación de
equipos con presupuestos comparables; UI de Fase 3 pendiente, declarada en §F).

## A. Modo consulta (implementado y probado)

- `src/dominio/equipos/consulta.ts`: `consultarEquipo(juego, estado, equipo,
  opciones)` analiza UNA posición con todos los miembros y devuelve el
  **registro completo** (`RegistroConsulta`): propuesta de cada miembro
  (notación, versión de cerebro, estadísticas con presupuesto consumido),
  decisión final con recuento, y **presupuesto total de pensamiento**
  (nodos/simulaciones/tiempo sumados + miembros que decidieron).
- **Políticas de agregación configurables** (`agregacion.ts`):
  - `votacion`: cada propuesta vale un voto.
  - `ponderado`: cada propuesta vale su **peso medido** (derivado de
    evaluaciones reales del miembro; sin evaluaciones → peso 0, nunca un
    número inventado).
  - Desempate documentado y probado: menor notación lexicográfica
    (determinista, sin RNG).
- Reproducibilidad: el RNG de cada miembro se deriva de (semilla, índice de
  jugada, jugador, alias) — la misma situación produce las mismas propuestas.
- Pruebas: 20 (agregación 7, consulta 5, registro 4, partidas reales 3, +4 de
  registro de agentes). La trazabilidad por jugada llega también a partidas
  completas mediante `crearAgenteEquipo(equipo, { alConsultar })`.

## B. Partidas por parejas (implementado y probado)

Dos agentes cooperan en el mismo bando con **protocolo explícito**
(`agenteEquipo.ts`, integrado en el motor estándar sin cambios al motor):

- `consulta`: en cada jugada del bando ambos miembros proponen y la política
  de agregación **resuelve el desacuerdo** (trazado en el registro).
- `turno-alternado`: el miembro A decide las jugadas impares del bando y el B
  las pares (desacuerdo imposible por construcción; verificado en pruebas con
  la secuencia real de decisores).
- **Estado compartido**: el del motor (única fuente de verdad); el adaptador
  no mantiene estado oculto (el índice de jugada del bando se deriva del
  tablero). Las partidas quedan con replay verificable (`validez:
  'verificada'` en las pruebas).

## C. Plantel creciente (implementado y probado)

- Dominio (`src/dominio/plantel/plantel.ts`): entradas con identidad
  (catálogo validado contra el catálogo real, o **cerebro con huella sha256
  OBLIGATORIA** — «sin artefacto real no hay entrada»), linaje
  (`parentModelId`, `trainingRunId`), evaluaciones medidas (V/E/D que debe
  cuadrar) e **historial de versiones reconstruido** desde las entradas
  reales (raíz → cadena, huérfanas marcadas).
- Aplicación (`src/aplicacion/registroPlantel.ts` + IndexedDB v3 con
  migración): incorporar catálogo/cerebro (el cerebro debe existir en el
  registro de cerebros CON LA MISMA HUELLA), retiro con evento,
  registro de evaluaciones medidas, derivación de equipos desde el plantel
  (los pesos salen de las evaluaciones) y eventos con deduplicación.
- Pruebas: 13 de dominio + 11 de aplicación (incluye «SIN artefacto no hay
  entrada», persistencia real y rechazo de juegos incompatibles).

## D. Mentoría y destilación (ejecutada de verdad, con resultado honesto)

- `entrenamiento/mentoria.py` (+5 pruebas pytest): carga un **veterano real**
  (.lba con huella registrada), genera ejemplos con partidas reales del
  veterano (distribución de visitas + resultado), entrena un **alumno**
  (inicialización aleatoria determinista) y lo evalúa **antes y después**
  con un **conjunto de evaluación independiente** (semilla dedicada
  `semilla+1_000_000`, nunca usada como dato de entrenamiento; rivales:
  aleatorio-uniforme y el veterano congelado; comparación emparejada).
- **Ejecución real** (run `20261021-ter3-mentoria`, veterano
  `red-ter-3@1.0.1` huella `65a1b9c9…`, CPU, torch 2.14.1+cpu):
  - Veterano: 48 partidas → 425 ejemplos en 2,4 s.
  - Alumno: 240 pasos, pérdida media 1,633, pesos cambiados (verificado).
  - Evaluación independiente (40 partidas/rival, emparejada):
    - ANTES: 0,8375 vs aleatorio · 0,500 vs veterano.
    - DESPUÉS: 0,6750 vs aleatorio · 0,500 vs veterano.
  - **Lectura honesta: la destilación con este veterano débil y solo 425
    ejemplos EMPEORÓ al alumno contra el aleatorio** (0,8375 → 0,675). El
    veterano no pierde (0,500 en ambos). No se promueve la candidata: queda
    en `modelos/candidatas/` (gitignored) con su registro completo en
    `docs/INFORMES/datos/mentoria-fase3.json`. El flujo funciona de extremo
    a extremo (el `.lba` candidata pasa el validador TS completo y juega:
    200 sims PUCT en el motor TS → 0,500 contra heurístico y minimax-d4,
    0,833 contra aleatorio, 0,625 contra mcts-500) y sienta la base para
    mentorías con veteranos más fuertes y más datos.
  - El veterano queda INTACTO (prueba específica: sus pesos no cambian).

## E. Evaluación de equipos (medida, sin presuposiciones)

`scripts/evaluar-equipos.ts` (artefacto
`docs/INFORMES/datos/evaluacion-equipos-fase3.json`): 8 emparejamientos, 60
encuentros c/u, lados alternos, partidas reales en el motor TS, con
**presupuestos totales por jugada comparados** y coste medido.

| Emparejamiento (perspectiva del bando A) | V/E/D | Puntuación | IC95 | Coste A |
|---|---|---|---|---|
| individual MCTS-200 vs aleatorio | 50/10/0 | 0,917 | [0,819; 0,964] | 200 sims/jugada |
| equipo consulta 2×MCTS-100 vs aleatorio | 52/7/1 | 0,925 | [0,830; 0,969] | 200 sims/jugada |
| equipo turno-alternado 2×MCTS-100 vs aleatorio | 46/13/1 | 0,875 | [0,768; 0,937] | 100 sims/jugada |
| **individual MCTS-200 vs equipo consulta 2×MCTS-100** | 16/35/9 | 0,558 | [0,433; 0,677] | 200 vs 200 |
| **individual MCTS-400 vs equipo consulta 2×MCTS-200** | 14/32/14 | 0,500 | [0,377; 0,623] | 400 vs 400 |
| individual heurístico vs aleatorio | 58/1/1 | 0,975 | [0,899; 0,994] | sin búsqueda |
| equipo consulta (heurístico+aleatorio) vs aleatorio | 50/2/8 | 0,850 | [0,739; 0,919] | sin búsqueda |
| equipo turno-alternado (heurístico+aleatorio) vs aleatorio | 45/11/4 | 0,842 | [0,729; 0,913] | sin búsqueda |

**Lectura honesta (no se presupone que el equipo sea mejor):**

1. Con presupuesto total igualado, el equipo consultivo NO demostró
   superioridad: 0,558 para el individual a 200 sims (IC95 incluye 0,5) y
   empate exacto 0,500 a 400 sims. La ventaja numérica del equipo a 200 sims
   (0,442 desde su lado) no es estadísticamente concluyente.
2. **Un integrante débil degrada al equipo**: el heurístico solo hace 0,975
   contra aleatorio; con un aleatorio votando, 0,850; alternándolo, 0,842.
   La votación mitiga algo, pero el equipo queda claramente POR DEBAJO del
   mejor de sus miembros.
3. Turno-alternado con los mismos miembros que consulta rinde menos contra
   aleatorio (0,875 vs 0,925): solo un miembro busca por jugada (coste
   100 vs 200 sims/jugada) — coherente con el coste medido.

## F. Pendiente declarado (sin simular)

- **UI de Fase 3** (paneles de consulta/equipos/plantel en la app Vite):
  pendiente; el dominio y la aplicación están listos y probados. El
  prototipo Next.js (PR #1) sigue separado, sin integrar en el núcleo Vite.
- Mentoría con veterano fuerte y más datos (la ejecutada usa el veterano
  1.0.1 disponible; el resultado negativo queda documentado).
- Exámenes de promoción para versiones destiladas y equipos como «agentes»
  en la liga (protocolo v1 vigente para individuos).

## G. Ramas y trazabilidad

- Rama `feat/fase3-equipos-plantel` creada DESDE `feat/lba-model-registry-
  training` (dae8f6c) para conservar las funciones .lba. El PR de Fase 3 es
  **escalonado con base en la rama de Fase 2** (no una copia directa a
  `main`), pendiente de que el PR #2 se revise/fusione en orden.
- Commits de la fase: ver `git log feat/lba-model-registry-training..
  feat/fase3-equipos-plantel`.

## H. Batería final de la fase

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| `npx eslint .` | 0 problemas |
| `npx vitest run` | **276/276** (28 archivos; +47 de Fase 3) |
| `pytest entrenamiento/pruebas/` | **83/83** (+5 de mentoría) |
| `npm run build` | OK (~0,3 s) |
| `scripts/evaluar-equipos.ts` | 8 emparejamientos medidos (§E) |
| `python -m entrenamiento.mentoria …` | run real completado (§D) |

Pruebas nuevas de Fase 3 por exigencia de la Tarea 6:
- Votación y agregación: 8 pruebas (mayorías, ponderación, desempates,
  pesos negativos rechazados).
- Compatibilidad de agentes: 4 (cerebro de otro juego en equipo, agente
  inexistente, humano, incorporación a juego distinto).
- Duplicación de eventos: cubierta por la deduplicación por id del almacén
  (eventos de plantel con id determinista `plantel:tipo:entrada:momento`;
  re-ejecución idempotente probada en registroCerebros/almacen).
- Pausas y errores: error controlado del trabajador ante solicitudes
  inválidas (equipo inválido, cerebro sin registrar) y decisiones no legales
  rechazadas (`movimientoDesdeNotacion`).
- Persistencia del plantel: 3 (guardado/listado/relectura, retiro con
  evento, migración v3 implícita en abrir()).
- Historial de versiones: 3 (cadena raíz→hija, huérfanas, otros agentes).
- Recuperación de tareas: la relectura del plantel tras reinicio
  (nueva instancia de RegistroPlantel sobre el mismo almacén) probada.
- Evaluación individual frente a equipos: §E + pruebas de partidas reales.
- Registro de ejemplos de mentoría: 5 (origen, recuentos, huella, pesos del
  veterano intactos, evaluación emparejada).
- Rechazo seguro de modelos incompatibles: 4 (sin huella, juego distinto,
  no importado, en el trabajador).
