# Auditoría independiente de la Fase 2

Fecha: 2026-10-19 (segunda auditoría post-entrega; la primera fue la de Fase 1,
`AUDITORIA-FASE1.md`). Auditor: agente principal de la sesión de continuación,
actuando como revisor independiente antes de preparar la entrega.

Método: nada se aceptó por documentación. Cada afirmación del informe de Fase 2
se contrastó re-ejecutando el comando correspondiente sobre el estado real del
repositorio y comparando artefactos huella a huella.

## 0. Estado verificado del repositorio

- Rama `feat/lba-model-registry-training`, HEAD real:
  `edddd7203720fb6e41121cc51ae59fdcb0cce7b5` — **coincide** con el commit de
  referencia declarado.
- Árbol de trabajo limpio antes de la auditoría; rama en sincronía con
  `origin/feat/lba-model-registry-training` (verificado tras `git fetch`).
- Existe además en el remoto la rama `frontend/prototipo-visual` con el PR #1
  abierto hacia `main` (prototipo visual Next.js). NO se toca ni se fusiona en
  esta revisión, conforme a las instrucciones. La rama de Fase 2 NO tiene PR
  todavía; se crea en la entrega de esta revisión.
- Secretos de Actions `KAGGLE_USERNAME` y `KAGGLE_KEY`: **EXISTEN** (verificado
  vía API pública/con token, sin leer ni exponer sus valores).

## 1. Confirmado (re-ejecutado en esta sesión)

| Comprobación | Comando/acción | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | 0 errores |
| Lint | `npx eslint .` | 0 problemas (tras excluir `.venv/`, ver §2.6) |
| Suite TS | `npx vitest run` | 225/225 (entrega original) |
| Suite Python | `pytest entrenamiento/pruebas/` | 27/27 (entrega original) |
| Build | `npm run build` | OK, ~0,3 s, trabajador incluido |
| Validación .lba | `scripts/verificar-lba.ts` sobre 1.0.0 y 1.0.1 | Ambos VÁLIDOS; huellas internas correctas |
| Partidas reales | mismas del verificador | **Idénticas** a las documentadas en FASE-2 §D.2 (reproducibles) |
| Examen de promoción | `scripts/examinar.ts 1.0.1 240 200` | Reproducido 1:1 (240 partidas y semillas idénticas; solo difieren fecha y duración) → 0V 240E 0D, NO aprobado |
| Protección del campeón | pruebas `liga.test.ts` | 8/8 verdes (bytes del campeón intactos tras examen reprobado) |
| Importación/exportación | pruebas `lba.test.ts` + `registroCerebros.test.ts` | 23 + 12 verdes (ida y vuelta, corruptos, duplicados, colisiones) |
| Paridad TS⇄PyTorch | `paridad.test.ts` + pytest | 5 + (dentro de las 27) verdes |
| Repetición de partidas | `validacion.test.ts` | 7/7 verdes (replay y validación por eventos) |
| Secretos en historial | pickaxe `ghp_`, `github_pat_`, `KAGGLE_KEY` | 0 apariciones reales (la única coincidencia textual es la documentación del propio comando pickaxe en AUDITORIA-FASE1.md) |
| Archivos referenciados | comprobación manual de §B/§E | Todos existen en el commit (ADR-014/015 son secciones de `docs/DECISIONES.md`) |
| Huellas de los paquetes | `sha256sum` vs registro JSON | 1.0.0 ✓ exacta; 1.0.1 ✓ exacta en el registro JSON (pero INDICE.md la tenía MAL, §2.1) |

## 2. Fallos encontrados y corregidos

### 2.1 Huella errónea en el índice de modelos

`modelos/versionados/INDICE.md` declaraba para `red-ter-3@1.0.1` la huella
`65a1b9c944a9c29cf240d19d3762a48f30ac77b2a1b7c87497677e53c00d616b`, que NO
coincide con el archivo real ni con el registro de entrenamiento
(`65a1b9c944a9c29cf240814d9c3ab7794114074fd016772451fd3652175cb77d`):
transcripción incorrecta al redactar el índice. Corregido en el índice;
verificable con `sha256sum modelos/versionados/red-ter-3@1.0.1.lba`.

### 2.2 El análisis de estados del workflow Kaggle estaba ROTO (crítico)

Lectura del código fuente de la CLI instalada (`kaggle==2.2.4`,
`kagglesdk 0.1.37`): `kernels_status_cli` imprime
`'<kernel> has status "<KernelWorkerStatus.MIEMBRO>"'` — el `%s` sobre el enum
produce `KernelWorkerStatus.COMPLETE`, con comillas. El `sed 's/^.*[[:space:]]//'`
del workflow capturaba `"KernelWorkerStatus.COMPLETE"`, que NO coincidía con
ninguna rama del `case` → todo trabajo quedaba en espera hasta agotar el
límite AUNQUE EL KERNEL HUBIERA TERMINADO CON ÉXITO. El workflow original
no podía tener éxito jamás. Además:

- `kernel_datasets` es un campo obsoleto: la CLI 2.x lee `dataset_sources`
  (leído del código de `kernels_push`); el campo antiguo se ignoraba en
  silencio.
- El booleano `usar-gpu` de GitHub se interpolaba directamente dentro de una
  expresión Python (`"enable_gpu": ${{ inputs.usar-gpu }}`), práctica
  prohibida por la revisión (Tarea 2, punto 1).
- `2>/dev/null` en el sondeo ocultaba errores de autenticación/red como si
  fueran estados pendientes.

**Corrección**: workflow reescrito; toda la lógica ahora vive en
`entrenamiento/kaggle/flujo.py` con **51 pruebas pytest**
(`entrenamiento/pruebas/test_kaggle_flujo.py`):

1. Booleanos por variable de entorno, convertidos con `bool_desde_env`
   (solo "true"/"false"; cualquier otro valor es error, nunca un falso
   silencioso). Cero interpolaciones de expresiones GitHub en Python.
2. Análisis de estados robusto (`interpretar_estado_salida`): normaliza
   mayúsculas, comillas y guiones bajos; reconoce el formato real 2.2.4
   (`KernelWorkerStatus.COMPLETE`) y el de la 1.x (`complete`); la línea
   `Failure message` no confunde al analizador; estados terminales de éxito
   (`complete`) y de error (`error`, `cancelAcknowledged`); pendientes
   (`queued`, `running`, `newScript`, `latent`, `cancelRequested`); un
   estado DESCONOCIDO lanza y el trabajo FALLA (nunca se trata como éxito).
3. Parámetros de entrenamiento validados contra rangos antes de generar el
   kernel (fallo rápido en el runner).
4. Metadatos con los campos reales de la CLI 2.x; título validado (≥ 5
   caracteres); `enable_gpu` como booleano real de Python.
5. `verificar_recuperacion`: sin `.lba` → fallo; registro de otra ejecución
   (runId distinto) → fallo; huella del `.lba` ≠ huella declarada por el
   registro → fallo; con varios `.lba`, se elige por huella.
6. Sondeo con CLI fallida → fallo rápido con el mensaje de stderr (sin
   tratarlo como pendiente).
7. El workflow ejecuta las 51 pruebas ANTES de gastar cuota de Kaggle.

Verificado además localmente: `kaggle==2.2.4` existe en PyPI e instala
correctamente; el generador de kernel produce metadatos válidos contra las
comprobaciones del código real de `kernels_push` (campos, título, code_file,
language, kernel_type); `get_bool` de la CLI acepta booleanos nativos.

### 2.3 Afirmaciones estadísticas infundadas (Tarea 3)

- «La referencia congelada de 3×3 es invencible» y «el umbral v1 de 0,60 es
  matemáticamente inalcanzable» → **RETIRADAS**. Verificación exhaustiva
  nueva (`scripts/verificar-heuristico.ts`, artefacto
  `docs/INFORMES/datos/verificacion-heuristico-ter3.json`): enumeración BFS
  de los 16 168 estados codificados alcanzables (5 478 posiciones tablero+
  turno — coincide con el número canónico), valor exacto por solucionador y
  comprobación de TODAS las candidatas del heurístico (todos los resultados
  posibles de su RNG) más el agente real con 8 semillas por estado.
  Resultado: **110 candidatas subóptimas** (degradaciones 1→0, 0→−1 y 1→−1);
  el heurístico NO es una estrategia óptima.
- Análisis de explotabilidad exacto nuevo (`scripts/explotar-heuristico.ts`,
  artefacto `docs/INFORMES/datos/explotabilidad-heuristico-ter3.json`):
  minimax sobre el juego-contra-la-política (adversario omnisciente que
  minimiza con cualquier movimiento; el heurístico juega sus candidatas con
  cotas optimista/pesimista). Resultado: **como jugador 1, invencible incluso
  ante un adversario omnisciente (empate en ambas cotas); como jugador 2,
  PIERDE ante un adversario informado que elija la apertura adecuada** (empieza
  perdiendo incluso con sus mejores candidatas; hay aperturas donde aguanta).
  Cota teórica de un explotador con lados alternos: hasta ~0,75.
- «la 1.0.1 aprendió a no perder» → **corregido**: la mejora de pérdida de
  entrenamiento, la mejora de resultado contra el rival, la ausencia observada
  de derrotas en la muestra (240 partidas) y una (inexistente) garantía
  matemática quedan separadas explícitamente en FASE-2 §D.3.
- «inferencia < 1 ms» (FASE-2 §B y ADR-014) → **sustituida** por benchmark
  reproducible (`scripts/medir-latencia-inferencia.ts`, artefacto
  `docs/INFORMES/datos/latencia-inferencia-ter3.json`): mediana 0,198 ms,
  p99 0,245 ms, 5000 ejecuciones + 2000 calentamiento, 166 entradas reales,
  hardware y condiciones documentadas.
- Los criterios de promoción NO se recalibraron retroactivamente: ambos
  exámenes siguen evaluados con el protocolo v1 congelado (ADR-007) y siguen
  rechazados. La recalibración v2 sigue siendo propuesta futura.

### 2.4 Instrucción de instalación rota

`pip install -r entrenamiento/requirements-entrenamiento.txt --index-url
https://download.pytorch.org/whl/cpu` FALLA (safetensors no está en ese
índice). Corregido en FASE-2 §G: instalación en dos pasos (torch desde el
índice CPU; el resto desde PyPI). Reproducido y verificado en esta sesión
(.venv creado así para las pruebas).

### 2.5 Sin pruebas automatizadas del protocolo de cerebros del Web Worker

La afirmación «cerebros en el Web Worker» solo tenía verificación manual en
navegador. Añadidas **4 pruebas** (`src/trabajadores/trabajador.test.ts`):
registro de un cerebro `.lba` real → clave `neural:…`; movimiento REAL del
agente neural dentro del trabajador (notación legal + estadísticas);
movimiento con agente sin registrar → respuesta de error controlada; y
**cerebro incompatible rechazado al registrar**. La última expuso un hueco
real: el trabajador registraba cerebros sin comprobar compatibilidad
(confiaba en el hilo principal). Corregido: `registrar-cerebro` ahora llama a
`comprobarCompatibilidad` (defensa en profundidad, verificado por la prueba
que antes fallaba).

### 2.6 ESLint colgado por `.venv/`

La creación del entorno Python local (necesario para re-ejecutar pytest)
hacía que ESLint intentara lintear 1 GB de archivos de `.venv/` (3637
errores y timeout). Corregido: `.venv` y `salida-kernel` añadidos a
`globalIgnores` del `eslint.config.js`.

## 3. Kaggle: prueba pequeña en CPU (Tarea 2, ejecución)

Los secretos existen (§0). Se intentó lanzar la prueba pequeña en CPU
(parametría mínima: 1 iteración, 4 partidas, 24 simulaciones, 8 pasos,
`usar-gpu=false`) vía `POST …/actions/workflows/train-kaggle.yml/dispatches`
sobre `feat/lba-model-registry-training`. **Resultado: HTTP 404** — GitHub
solo registra para dispatch los workflows presentes en la rama por defecto
(`main`), y `train-kaggle.yml` no está fusionado aún (fusionar el PR de Fase 2
sin autorización está prohibido; verificado listando
`/actions/workflows`: solo `ci.yml` figura). Las credenciales de Kaggle solo
existen como secretos de Actions, cuyos valores son ilegibles por diseño, de
modo que el ciclo real tampoco puede ejecutarse desde fuera de GitHub.

Estado final honesto del ciclo Kaggle en esta entrega:

- Lógica del flujo: **corregida y probada por unidades** (51 pruebas pytest +
  verificación de los formatos reales contra el código fuente de la CLI
  2.2.4 + generación de kernel/metadatos reproducida localmente).
- Secretos disponibles: sí (existen, no expuestos).
- Ejecución real de ida y vuelta: **PENDIENTE**, con el procedimiento exacto
  fijado: tras fusionar el PR de Fase 2 → Actions → «Entrenamiento en Kaggle
  (manual)» → Run workflow (semilla 20261019, iteraciones 1, partidas 4,
  simulaciones 24, pasos 8, agente red-ter-3, versión 1.0.2, CPU) → esperar →
  comprobar artefacto `cerebro-entrenado-red-ter-3-1.0.2` y su huella contra
  el registro incluido. Solo después de recuperar y validar un `.lba` real
  tiene sentido una ejecución con GPU.

## 4. Batería final tras las correcciones

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| `npx eslint .` | 0 problemas |
| `npx vitest run` | **229/229** (25 archivos; +4 trabajador) |
| `pytest entrenamiento/pruebas/` | **78/78** (+51 flujo Kaggle) |
| `npm run build` | OK (~0,3 s) |
| `scripts/verificar-heuristico.ts` | completado (ver §2.3) |
| `scripts/explotar-heuristico.ts` | completado (ver §2.3) |
| `scripts/medir-latencia-inferencia.ts` | completado (ver §2.3) |

## 5. Conclusión de la auditoría

La Fase 2 estaba **sustancialmente construida y era reproducible** (ninguna
cifra clave resultó falsa al re-ejecutarse), pero contenía: un error de
transcripción de huella, un workflow Kaggle que no podía tener éxito jamás,
tres afirmaciones estadísticas sin base matemática, una instrucción de
instalación rota y un hueco de verificación automatizada del trabajador. Todo
ello queda corregido y cubierto por pruebas en esta revisión, sin recalibrar
criterios de promoción retroactivamente y sin fusionar nada.
