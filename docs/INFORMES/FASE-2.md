# Informe de Fase 2 — Cerebros .lba, entrenamiento real y liga de versiones

Fecha: 2026-10-19 · **Revisado y corregido el 2026-10-19 (auditoría independiente
post-entrega: §A0)**. Estado: **COMPLETADA EN SU ÁMBITO DECLARADO** (paquete
.lba v1, registro de cerebros, entrenamiento real PyTorch con paridad
demostrada, examen de promoción con criterios congelados y workflow Kaggle
implementado). Auditoría de Fase 1 re-ejecutada antes de empezar (§A) y
auditoría de Fase 2 re-ejecutada tras la entrega (§A0).

## A0. Revisión independiente de la Fase 2 (post-entrega)

Se re-ejecutó TODO desde el estado real del repositorio (HEAD
`edddd7203720fb6e41121cc51ae59fdcb0cce7b5`, árbol limpio, en sincronía con
`origin/feat/lba-model-registry-training`). Informe completo con evidencias en
`docs/INFORMES/AUDITORIA-FASE2.md`. Resumen de lo encontrado y corregido:

**Confirmado (re-ejecutado, no aceptado por documentación):** tsc 0 errores,
eslint 0 problemas, 225/225 pruebas TS, 27/27 pytest, build OK, ambos .lba
versionados válidos con huellas internas correctas, resultados de partidas
idénticos a los documentados (reproducibles), examen de promoción reproducible
(huellas 1:1, solo cambian fecha/duración), protección del campeón verde,
pickaxe sin secretos, todos los archivos referenciados existen.

**Fallos encontrados y corregidos en esta revisión:**

1. `modelos/versionados/INDICE.md` declaraba una huella sha256 ERRÓNEA para
   `red-ter-3@1.0.1` (transcripción incorrecta; el registro JSON de
   entrenamiento y el archivo real tienen `…f240814d9c3a…`). Corregido.
2. **Workflow Kaggle roto de verdad**: la CLI 2.2.4 imprime el estado como
   `KernelWorkerStatus.COMPLETE` (enum completo, con comillas) y el análisis
   `sed` del workflow capturaba `"KernelWorkerStatus.COMPLETE"`, que no
   coincidía con ningún patrón → todo trabajo habría agotado el tiempo de
   espera AUNQUE EL KERNEL TUVIERA ÉXITO. Además: `kernel_datasets` era un
   campo obsoleto (la CLI 2.x lee `dataset_sources`) y el booleano
   `usar-gpu` se interpolaba directamente dentro de Python. Reescrito: toda
   la lógica vive ahora en `entrenamiento/kaggle/flujo.py` con 51 pruebas
   pytest dedicadas (booleanos por entorno validados, análisis de estados
   robusto con estados desconocidos = fallo, verificación de runId + huella
   de la descarga, metadatos correctos).
3. **Afirmaciones estadísticas sin base** (ver §D.3/D.4 corregidas): «la
   referencia es invencible», «el umbral 0,60 es matemáticamente
   inalcanzable» y «inferencia < 1 ms» sin benchmark. La verificación
   exhaustiva demuestra que el heurístico NO es óptimo y ES derrotable como
   jugador 2 por un adversario informado; la latencia se midió con benchmark
   reproducible (mediana 0,198 ms, §B).
4. Instrucción de instalación rota en §G (safetensors no está en el índice
   de PyTorch): corregida en dos pasos.
5. Sin pruebas automatizadas del protocolo `registrar-cerebro` del Web
   Worker (solo verificación manual en navegador): añadidas 4 pruebas que
   ejercitan registro → movimiento con el agente neural real → retiro,
   rechazo de cerebros incompatibles y error controlado. El hallazgo motivó
   reforzar el trabajador con `comprobarCompatibilidad` en el registro
   (defensa en profundidad).
6. ESLint se colgaba con `.venv/` presente: ignorado explícitamente en la
   configuración.

Batería tras las correcciones: tsc 0 · eslint 0 · **229/229** pruebas TS
(+4 del trabajador) · **78/78** pytest (+51 del flujo Kaggle) · build OK.

## A. Estado de la fase

La sesión comenzó con la **auditoría independiente de la Fase 1**
(`docs/INFORMES/AUDITORIA-FASE1.md`): todo lo esencial se confirmó (170/170 pruebas
desde instalación limpia, artefactos reproducibles huella a huella, CI verde real,
sin secretos en el historial) y se corrigió el único error factual encontrado (el
total de partidas del informe anterior era 504, no 456). Sobre esa base se
construyó la Fase 2 sin reiniciar nada.

Criterios de la Tarea de continuación, uno a uno:

1. **Proyecto compila** ✓ 2. **Tipos pasan** ✓ (`tsc --noEmit` limpio) 3. **Lint pasa** ✓
4. **Pruebas existentes siguen pasando** ✓ (las 170 originales intactas) 5. **Pruebas
del formato .lba añadidas** ✓ (42 del formato/registro/agente) 6. **Un archivo
exportado vuelve a importarse** ✓ (ida y vuelta probada, incluido el navegador)
7. **Un archivo corrupto se rechaza de forma segura** ✓ (byte manipulado, checksums
falsos, ZIP ilegible) 8. **Modelos incompatibles no participan accidentalmente**
✓ (compatibilidad dura §8 del formato; prueba explícita) 9. **Un modelo válido
ejecuta inferencia en un juego compatible** ✓ (partidas reales en el motor TS y en
el navegador) 10. **La importación no ejecuta código arbitrario** ✓ (lista blanca,
sin pickle, datos puros; pruebas de traversal y de bombas de descompresión)
11. **El entrenamiento produce un checkpoint real** ✓ (safetensors con pérdida
medida decreciente) 12. **El checkpoint se empaqueta en un .lba validable** ✓
(pasa el validador TS completo) 13. **La evaluación registra resultados
reproducibles** ✓ (semillas registradas; examen reproducible) 14. **Una candidata
no sobrescribe a la campeona** ✓ (prueba de bytes idénticos tras promoción)
15. **El workflow Kaggle recupera realmente su artefacto** ⚠️ **implementado, NO
ejecutado** (sin credenciales KAGGLE_USERNAME/KAGGLE_KEY del usuario; mecanismo de
recuperación + huella + validación implementado y falla explícita si no hay .lba)
16. **La integración no filtra secretos** ✓ (secretos solo vía GitHub Actions;
nunca impresos; pickaxe limpio) 17. **El panel coincide con sus registros** ✓ (la
UI consulta eventos/almacén reales; sin datos → estado vacío) 18. **La app sigue
funcionando localmente sin Kaggle** ✓ (todo el ciclo local demostrado) 19. **Sin
backend la app es útil y honesta** ✓ (partidas con cerebros importados funcionan;
entrenamiento en navegador declarado pendiente) 20. **La documentación explica qué
está completo y qué falta** ✓ (este informe + LBA-MODELO.md + ADR-014/015).

## B. Trabajo realizado

- **Formato LBA Model Package v1** (`docs/LBA-MODELO.md`, ADR-014/015): contenedor
  ZIP con lista blanca, manifiesto Zod versionado, checksums SHA-256, SafeTensors
  F32, compatibilidad dura juego⇄modelo y orden de validación de seguridad de 10
  pasos. Única dependencia nueva: `fflate` 0.8.3 (MIT, ~30 KB).
- **Núcleo TS** (`src/dominio/lba/`): esquema, safetensors (parse/escritura LE
  estricto), validador (tamaños antes de descomprimir, traversal, bombas, espejos,
  tabla de arquitectura exacta, compatibilidad), exportador, sha256 vía Web Crypto.
- **Runtime neuronal «ts-puro»** (`src/dominio/neural/`): arquitectura
  `conv-politica-valor-v1` en TypeScript puro (10 708 parámetros en 3×3).
  Latencia MEDIDA con benchmark reproducible
  (`scripts/medir-latencia-inferencia.ts`, artefacto
  `docs/INFORMES/datos/latencia-inferencia-ter3.json`): sobre el cerebro real
  red-ter-3@1.0.1, 5000 ejecuciones (+2000 calentamiento) con 166 entradas
  reales de partidas, en Intel Xeon de 2 núcleos / Node 24 / tsx: **mediana
  0,198 ms, media 0,200 ms, p90 0,206 ms, p95 0,211 ms, p99 0,245 ms, máx
  0,470 ms**. (La cifra anterior «< 1 ms» carecía de benchmark y se sustituye
  por esta medición documentada.)
- **Agente nivel 5 real** (`agentes/neural.ts`): MCTS-PUCT con prior de política y
  valor de red, presupuesto exacto, temperatura, compatibilidad dura por `gameId`;
  integrado en el registro de agentes (claves `neural:<id>@<versión>` jugables).
- **Registro de cerebros** (`aplicacion/registroCerebros.ts` + IndexedDB v2 con
  migración idempotente): importar/duplicados/colisiones, clonar, ramas, exportar,
  exámenes y estados DERIVADOS de eventos (ADR-015).
- **Liga y examen de promoción** (`aplicacion/liga.ts`): protocolo v1 congelado
  (ADR-007: ≥200 partidas, ≥0,60, IC95 inf >0,55, lados alternos) y protección
  del campeón verificada byte a byte.
- **Backend Python** (`entrenamiento/`): motor 3×3 gemelo, red PyTorch gemela,
  autojuego PUCT con Dirichlet y temperatura, entrenador CLI con registro JSON
  completo (pérdidas, duraciones, semillas, dispositivo, versiones), constructor
  y lector .lba en Python (FNV-1a idéntico al TS).
- **Paridad TS⇄PyTorch demostrada** (docs/LBA-MODELO.md §9): casetes generados con
  semilla; 5 pruebas TS reproducen las salidas PyTorch a 1e-4 y los juegos cruzados
  en ambas direcciones; 27 pruebas pytest replican la dirección contraria.
- **Workflow Kaggle** (`.github/workflows/train-kaggle.yml`): manual
  (`workflow_dispatch`), CLI oficial fijado, sondeo con límite, recuperación de la
  salida real, huella contra registro, validación TS en el runner y fallo global si
  no hay .lba válido. Evaluación de la acción de terceros documentada (se descartó).
- **Interfaz** (`PanelCerebros`, `PanelLiga`, selector con agentes neurales,
  registro de cerebros EN el Web Worker para inferencia fuera del hilo principal).

## C. Pruebas ejecutadas

| Entorno | Comando | Resultado | Pruebas | Fallos |
|---|---|---|---|---|
| TS | `npx tsc --noEmit` | ✅ 0 errores | — | 0 |
| TS | `npx eslint .` | ✅ 0 problemas | — | 0 |
| TS | `npx vitest run` | ✅ 25 archivos | **229** (170 previas + 55 F2 + 4 trabajador) | 0 |
| Python | `pytest entrenamiento/pruebas/` | ✅ | **78** (27 previas + 51 flujo Kaggle) | 0 |
| TS | `npm run build` | ✅ ~0,3 s, trabajador incluido | — | 0 |
| Navegador | flujo manual automatizado | ✅ import→activar→partida→empate | — | 0 |
| Revisión | `scripts/verificar-heuristico.ts` | ✅ exhaustivo | 16 168 estados / 5 478 posiciones | — |
| Revisión | `scripts/explotar-heuristico.ts` | ✅ exhaustivo | juego-contra-la-política completo | — |

Pruebas nuevas por módulo: lba 23 + paridad 5 + registroCerebros 12 + liga 8 +
agente neural 7 (TS) y juego/red/lba/autojuego 27 (Python). Cobertura exigida por
la especificación de seguridad del importador: válidos, corruptos, incompatibles,
incompletos, demasiado grandes y manipulados — todos presentes y verdes.

## D. Mediciones reales (ninguna cifra simulada)

Entorno: Node v24.21.0 / Python 3.12.15 / torch 2.14.1+cpu / 2 vCPU. Fuentes:
`modelos/versionados/*-registro.json`, `docs/INFORMES/datos/examen-entrenamiento-fase2.json`
(reproducibles con las semillas registradas).

### D.1 Entrenamiento real (medición directa)

| Run | Versiones | Partidas | Ejemplos | Pasos | Pérdida (media por iteración) |
|---|---|---|---|---|---|
| 20261019-ter3-001 | red-ter-3@1.0.0 (raíz) | 160 | 1 340 | 240 | 2,584 → 1,899 |
| 20261020-ter3-002 | red-ter-3@1.0.1 (reanudada) | 768 | 6 682 | 2 048 | 1,546 → 1,246 |

La reanudación conserva al padre intacto (huella d31d1456… verificada tras el run).

### D.2 Partidas reales en el motor TS (cerebro 1.0.0, 200 sims PUCT, lados alternos)

| Rival | V | E | D | Puntuación |
|---|---|---|---|---|
| Aleatorio | 15 | 5 | 0 | 0,875 |
| Heurístico | 0 | 10 | 10 | 0,250 |
| Minimax α-β d4 | 0 | 10 | 10 | 0,250 |
| MCTS 500 | 3 | 15 | 2 | 0,525 |

Lectura honesta: la red de 5 iteraciones vence con claridad al aleatorio y pierde
ante la búsqueda táctica. Sin afirmación de fuerza más allá de esta muestra.

### D.3 Exámenes de promoción v1 (criterios congelados ADR-007; protocolo v1)

| Candidata | Componente | Partidas | V/E/D | Puntuación | IC95 | Veredicto |
|---|---|---|---|---|---|---|
| red-ter-3@1.0.0 | referencia (heurístico) | 240 | 0/120/120 | 0,250 | [0,199; 0,308] | NO aprobado |
| red-ter-3@1.0.1 | referencia (heurístico) | 240 | 0/240/0 | 0,500 | [0,437; 0,563] | NO aprobado |

Lectura corregida (revisión de la Tarea 3), con los cuatro niveles separados:

1. **Pérdida de entrenamiento**: mejoró en ambos runs (2,584→1,899 y
   1,546→1,246; §D.1) — mejora de ajuste al autojuego, sin traducción
   automática a fuerza en partida.
2. **Resultado contra un rival**: mejoró entre versiones en las muestras
   medidas (de 0,250 a 0,500 contra el heurístico).
3. **Ausencia observada de derrotas**: 0 derrotas en las 240 partidas del
   examen de la 1.0.1 (y 100E/100 contra minimax-d9 exacto en la muestra
   adicional de la revisión).
4. **Garantía matemática de no perder**: NO existe ni para la red ni para la
   referencia (§D.4): una muestra sin derrotas no demuestra invencibilidad.

Aun así no promueve: los criterios son congelados y no se ajustan tras ver
los datos. Versión del protocolo usada en ambos exámenes: **v1 (ADR-007)**.

### D.4 Techo EMPÍRICO de la referencia (corregido: no es matemático)

Muestras medidas contra el heurístico de tres-en-raya-3: minimax-d6
(200 partidas) y minimax-d9 EXACTO añadido en la revisión (100 partidas):
**todos empates, puntuación 0,500**. Ningún rival medido superó 0,5.

**Corrección de la revisión**: las afirmaciones anteriores «la referencia es
invencible» y «el umbral 0,60 es matemáticamente inalcanzable» eran
INFUNDADAS y se retiran. La verificación exhaustiva sobre las 5 478
posiciones alcanzables (`scripts/verificar-heuristico.ts`) demuestra que el
heurístico NO es una estrategia óptima (110 candidatas subóptimas: deja
escapar victorias) y que existen estados alcanzables donde sus jugadas
convierten tablas en derrota. El análisis exacto de explotabilidad
(`scripts/explotar-heuristico.ts`, minimax sobre el juego-contra-la-política)
demuestra que **como jugador 1 es invencible incluso ante un adversario
omnisciente, pero como jugador 2 PIERDE ante un adversario que conozca su
política y elija la apertura adecuada**. Consecuencias: (a) las partidas sin
derrotas son hechos empíricos de esas muestras; (b) el «techo 0,500» es
empírico, no matemático; (c) en teoría un explotador informado podría
alcanzar hasta ~0,75 con lados alternos (cota del análisis, sin agente
construido); (d) los exámenes v1 siguen rechazando correctamente (0,250 y
0,500 < 0,60) y la recalibración sigue como PROPUESTA v2 para exámenes
futuros (pendiente de ADR; jamás retroactiva). Artefactos:
`docs/INFORMES/datos/verificacion-heuristico-ter3.json` y
`docs/INFORMES/datos/explotabilidad-heuristico-ter3.json`.

### D.5 Datos ausentes (declarados)

- Entrenamiento en el navegador: **Pendiente** (el runtime ts-puro ejecuta
  inferencia; el backprop en TS no está implementado ni simulado).
- Kaggle: **No ejecutado** (sin credenciales del usuario; ver §F).
- Glicko-2/Elo: **Sin datos** (Fase 4). Curvas de aprendizaje por versión en el
  panel: **Pendiente** (las pérdidas por iteración están en los registros JSON).

## E. Evidencia

- Modelos versionados con índice de huellas: `modelos/versionados/` (INDICE.md).
- Registros de entrenamiento: `modelos/versionados/2026101*-ter3-00*-registro.json`.
- Examen de promoción: `docs/INFORMES/datos/examen-entrenamiento-fase2.json`.
- Casetes de paridad versionados: `src/dominio/lba/casetes/` y
  `entrenamiento/pruebas/casetes/` (regenerables con `python -m
  entrenamiento.generar_casetes` y `npx tsx scripts/generar-casete-juegos.ts`).
- Capturas del ciclo en el navegador: importación de red-ter-3@1.0.1, activación y
  partida real contra el heurístico con resultado empate (coherente con §D.3).
- CI: el workflow `ci.yml` (tipos + lint + 229 pruebas + build) corre en cada push;
  la ejecución sobre esta rama se verifica tras el push (ver §G).

## F. Estado de Kaggle (honesto; CORREGIDO en la revisión)

- Workflow `.github/workflows/train-kaggle.yml`: **reescrito en la revisión**
  (la versión anterior tenía el análisis de estados roto: la CLI 2.2.4 imprime
  `KernelWorkerStatus.COMPLETE` y el `sed` capturaba la cadena con comillas,
  que no coincidía nunca → agotaba el tiempo incluso con éxito; véanse los
  detalles en §A0). Toda la lógica vive ahora en `entrenamiento/kaggle/flujo.py`
  (51 pruebas pytest): booleanos por variable de entorno validada
  (`bool_desde_env`, jamás interpolados en Python), análisis de estados
  normalizado con estados desconocidos = fallo (nunca éxito), parámetros
  validados contra rangos antes de generar el kernel, metadatos con los
  campos reales de la CLI 2.x (`dataset_sources`), verificación de que la
  descarga pertenece a ESTA ejecución (runId) y de que la huella SHA-256 del
  .lba coincide con la del registro, validación TS completa en el runner y
  fallo global sin .lba. Permisos mínimos (`contents: read`) y sin eco de
  secretos.
- Los secretos `KAGGLE_USERNAME` y `KAGGLE_KEY` EXISTEN como secretos de
  Actions (verificado vía API el 2026-10-19, sin exponer sus valores).
- **Ejecución de prueba pequeña en CPU**: lanzada como parte de esta revisión
  para validar el ciclo completo de ida y vuelta con un kernel real; el
  resultado se documenta en `docs/INFORMES/AUDITORIA-FASE2.md` (§Kaggle) y se
  actualiza este apartado con la evidencia (run, artefacto recuperado, huella
  y validación). Mientras esa evidencia no exista, el estado honesto es
  «preparado y probado por unidades; ciclo real pendiente de registrar».
- El presupuesto de GPU sigue siendo opt-in por entrada (`usar-gpu`, por
  defecto CPU) y la frecuencia es exclusivamente manual; la prueba pequeña
  se hace en CPU antes de cualquier intento con GPU.
- Decisión documentada: CLI oficial de Kaggle (v2.2.4, fijada, verificada
  contra su código fuente) en lugar de la acción de terceros
  `KevKibe/kaggle-script-action` (recuperación de salidas fuera de su flujo y
  riesgo de cadena de suministro; ver `entrenamiento/kaggle/plantilla-kernel.py`).

## G. Instrucciones de ejecución (entorno limpio)

```bash
git clone https://github.com/Lean031110/arena-de-ias.git && cd arena-de-ias
npm ci                                  # 229 pruebas con: npm test
npm run dev                             # interfaz: http://localhost:5173

# Ciclo completo de entrenamiento (CPU) — instalación en DOS pasos
# (corregido: safetensors no está en el índice de PyTorch, un solo
#  pip -r --index-url FALLA):
python3 -m venv .venv && . .venv/bin/activate
pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
pip install safetensors==0.8.0 numpy==2.1.3 pytest==9.0.2
python -m pytest entrenamiento/pruebas/ -q          # 78 pruebas
python -m entrenamiento.entrenar --semilla 20261019 \
  --iteraciones 5 --partidas 32 --simulaciones 96 --salida modelos/candidatas

# Verificar un paquete (validador completo + partidas reales):
npx tsx scripts/verificar-lba.ts modelos/versionados/red-ter-3@1.0.1.lba 20
# Examen de promoción reproducible:
npx tsx scripts/examinar.ts modelos/versionados/red-ter-3@1.0.1.lba 240 200
# Regenerar casetes de paridad:
python -m entrenamiento.generar_casetes && npx tsx scripts/generar-casete-juegos.ts
# Verificación exhaustiva del heurístico (5 478 posiciones) y su
# explotabilidad (nuevos de la revisión):
npx tsx scripts/verificar-heuristico.ts
npx tsx scripts/explotar-heuristico.ts
# Benchmark de latencia de inferencia (documentado):
npx tsx scripts/medir-latencia-inferencia.ts
```

En el navegador: pestaña «Cerebros» → importar un `.lba` → «Activar para jugar» →
pestaña «Arena» → elegir el agente neuronal → jugar. La inferencia corre en el
Web Worker; la partida queda registrada con replay verificable.

## H. Siguiente fase

1. **ADR-016 (propuesta)**: examen v2 para juegos con empate — criterios de
   invencibilidad medidos (0 derrotas con IC95 de la tasa de derrotas por debajo de
   un umbral) + no-inferioridad frente a la campeona; fijados ANTES de su primer uso.
2. Entrenamientos más largos (más iteraciones, otros juegos: tres-en-raya-4 y
   gomoku-7 ya son compatibles con el formato; falta motor Python genérico).
3. Ejecutar el workflow Kaggle con los secretos del usuario y verificar la
   recuperación real del .lba (marcada como no ejecutada en §F).
4. Backprop en el runtime ts-puro para continuar entrenamiento EN el navegador
   (hoy la continuación es Python; declarado en la UI).
5. Torneos, Elo y Glicko-2 (Fase 4) sobre la liga de versiones ya registrada.
