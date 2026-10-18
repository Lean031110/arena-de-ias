# Informe de Fase 2 — Cerebros .lba, entrenamiento real y liga de versiones

Fecha: 2026-10-19 · Estado: **COMPLETADA EN SU ÁMBITO DECLARADO** (paquete .lba v1,
registro de cerebros, entrenamiento real PyTorch con paridad demostrada, examen de
promoción con criterios congelados y workflow Kaggle implementado y marcado como no
ejecutado). Auditoría de Fase 1 re-ejecutada antes de empezar (§A).

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
  `conv-politica-valor-v1` en TypeScript puro (10 708 parámetros en 3×3, inferencia
  < 1 ms) + codificación de observaciones compartida.
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
| TS | `npx vitest run` | ✅ 24 archivos | **225** (170 previas + 55 nuevas) | 0 |
| Python | `pytest entrenamiento/pruebas/` | ✅ | **27** | 0 |
| TS | `npm run build` | ✅ 250 ms, trabajador incluido | — | 0 |
| Navegador | flujo manual automatizado | ✅ import→activar→partida→empate | — | 0 |

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

### D.3 Exámenes de promoción v1 (criterios congelados ADR-007)

| Candidata | Componente | Partidas | V/E/D | Puntuación | IC95 | Veredicto |
|---|---|---|---|---|---|---|
| red-ter-3@1.0.0 | referencia (heurístico) | 240 | 0/120/120 | 0,250 | [0,199; 0,308] | NO aprobado |
| red-ter-3@1.0.1 | referencia (heurístico) | 240 | 0/240/0 | 0,500 | [0,437; 0,563] | NO aprobado |

Mejora real medida entre versiones: de 120 derrotas a 0 (la 1.0.1 aprendió a no
perder). Aun así no promueve: los criterios son congelados y no se ajustan tras
ver los datos.

### D.4 Techo empírico de la referencia (hallazgo clave, medido)

Minimax-d6 contra heurístico, 200 partidas, lados alternos: **200 empates exactos,
puntuación 0,500**. La referencia congelada de 3×3 es invencible; el umbral v1 de
0,60 es matemáticamente inalcanzable en ese juego. Consecuencia documentada: los
exámenes v1 rechazan correctamente (nunca promueven por error) y la recalibración
queda como PROPUESTA v2 para exámenes futuros (pendiente de ADR; jamás retroactiva).

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
- CI: el workflow `ci.yml` (tipos + lint + 225 pruebas + build) corre en cada push;
  la ejecución sobre esta rama se verifica tras el push (ver §G).

## F. Estado de Kaggle (honesto)

- Workflow `.github/workflows/train-kaggle.yml`: **implementado y sintácticamente
  validado** (YAML cargado, 14 pasos, 9 entradas). Flujo completo: push del kernel
  generado con parámetros y commit exacto → sondeo con límite → recuperación de la
  salida → comprobación de huella → validación TS en el runner → artefacto. Sin .lba
  recuperado, la ejecución **falla** por diseño.
- **NO ejecutado contra Kaggle en esta sesión**: se requieren los secretos
  `KAGGLE_USERNAME` y `KAGGLE_KEY` del usuario. El núcleo del kernel ejecuta el
  mismo entrenamiento probado en local (runs de §D.1). Para ejecutarlo:
  configurar los secretos → pestaña Actions → «Entrenamiento en Kaggle (manual)» →
  Run workflow. El presupuesto de GPU es opt-in por entrada (`usar-gpu`, por
  defecto CPU) y la frecuencia es exclusivamente manual.
- Decisión documentada: CLI oficial de Kaggle (v2.2.4, fijada) en lugar de la
  acción de terceros `KevKibe/kaggle-script-action` (recuperación de salidas fuera
  de su flujo y riesgo de cadena de suministro; ver `entrenamiento/kaggle/plantilla-kernel.py`).

## G. Instrucciones de ejecución (entorno limpio)

```bash
git clone https://github.com/Lean031110/arena-de-ias.git && cd arena-de-ias
npm ci                                  # 225 pruebas con: npm test
npm run dev                             # interfaz: http://localhost:5173

# Ciclo completo de entrenamiento (CPU):
python3 -m venv .venv && . .venv/bin/activate 2>/dev/null || true
pip install -r entrenamiento/requirements-entrenamiento.txt --index-url https://download.pytorch.org/whl/cpu
python -m pytest entrenamiento/pruebas/ -q          # 27 pruebas
python -m entrenamiento.entrenar --semilla 20261019 \
  --iteraciones 5 --partidas 32 --simulaciones 96 --salida modelos/candidatas

# Verificar un paquete (validador completo + partidas reales):
npx tsx scripts/verificar-lba.ts modelos/versionados/red-ter-3@1.0.1.lba 20
# Examen de promoción reproducible:
npx tsx scripts/examinar.ts modelos/versionados/red-ter-3@1.0.1.lba 240 200
# Regenerar casetes de paridad:
python -m entrenamiento.generar_casetes && npx tsx scripts/generar-casete-juegos.ts
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
