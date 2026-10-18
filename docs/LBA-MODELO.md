# LBA Model Package — Especificación v1

Estado: **v1 (implementada)** · Responsable: núcleo TypeScript + backend Python (`entrenamiento/`)
Extensiones: `*.lba` · Identificador de formato: `lba/1`

> Regla rectora: un paquete `.lba` acredita **qué contiene y que sus bytes coinciden con
> sus checksums**. No acredita que el modelo sea bueno ni que las cifras de su evaluación
> sean verdaderas: la evaluación solo es creíble si sus identificadores de ejecución se
> corresponden con registros reales del registro experimental. Si un campo no tiene dato
> real, el campo va vacío o el archivo no se incluye (nunca se rellena con ficción).

## 1. Contenedor

- Contenedor **ZIP** (deflate o almacenado) con extensión `.lba`.
- **Lista blanca exacta de entradas** (todo lo demás rechaza la importación):

| Entrada | Obligatoria | Contenido |
|---|---|---|
| `manifest.json` | sí | Identidad, arquitectura y compatibilidad (esquema §3) |
| `training/weights.safetensors` | sí (v1) | Pesos en formato SafeTensors, F32, LE (§5) |
| `training/config.json` | sí | Configuración del entrenamiento que produjo la versión |
| `training/lineage.json` | sí | Ascendencia: padre, huella del paquete padre, motivo |
| `evaluation/summary.json` | no | **Solo si existen evaluaciones reales** de esta versión |
| `integrity/checksums.sha256` | sí | SHA-256 de cada archivo del paquete (§6) |
| `model.onnx` | no | Exportación ONNX para runtimes que la soporten (v1: no se genera) |
| `docs/FORMATO.md` | no | Documentación embebida |
| `LICENSE.txt` | no | Licencia de los pesos |

- `model.onnx` solo puede aparecer si `runtimeTargets` incluye `onnx`; su inclusión no
  garantiza que el runtime local lo cargue: el importador verifica compatibilidad real
  contra los runtimes disponibles y lo declara en el resultado de la importación.
- Un paquete **sin** `training/weights.safetensors` no existe en v1 (no se empaquetan
  archivos inexistentes; si un cerebro no tiene checkpoint entrenable no se exporta).

## 2. Límites del importador (protección frente a bombas de descompresión)

| Límite | Valor por defecto (configurable) |
|---|---|
| Tamaño del paquete comprimido | ≤ 64 MB |
| Número de entradas | ≤ 64 |
| Total descomprimido | ≤ 256 MB |
| Entrada individual descomprimida | ≤ 128 MB |
| Cabecera SafeTensors | ≤ 1 MB |

El importador **primero** enumera el directorio central del ZIP y comprueba nombres,
recuento y tamaños declarados; solo después descomprime las entradas de la lista blanca.
Ninguna entrada se ejecuta jamás: el paquete es datos, no código. Nunca `pickle`.

## 3. Manifiesto (`manifest.json`)

Validado con **Zod** (`src/dominio/lba/esquema.ts`, única fuente de la verdad del esquema;
`entrenamiento/exportar_lba.py` genera JSON conforme al mismo contrato).

```jsonc
{
  "formatVersion": 1,
  "agentId": "red-ter-3",                    // identificador estable del agente
  "brainVersion": "1.0.0",                   // X.Y.Z del cerebro
  "parentModelId": null,                     // "agentId@version" del padre o null (raíz)
  "createdAt": "2026-10-19T12:00:00.000Z",   // ISO 8601 UTC
  "gameId": "tres-en-raya-3",
  "gameRulesVersion": "1",
  "gameRulesHash": "a1b2c3d4",               // FNV-1a 32 bits (ver §7)
  "observationSchemaVersion": 1,
  "actionSpaceVersion": 1,
  "architecture": {                          // §4
    "tipo": "conv-politica-valor-v1",
    "entrada": { "alto": 3, "ancho": 3, "canales": 2 },
    "acciones": 9
  },
  "weightsFormat": "safetensors",
  "runtimeTargets": ["ts-puro"],
  "trainingRunId": "20261019-ter3-001",      // null si no procede de un run
  "trainingConfig": { /* espejo de training/config.json */ },
  "datasetLineage": {
    "origen": "autojuego",
    "partidas": 240,                          // partidas reales que generaron ejemplos
    "ejemplos": 1421,                         // posiciones procesadas
    "semilla": 20261019,
    "rival": null,                            // rival de generación, si lo hubo
    "buffer": "FIFO 20000, muestreo uniforme" // política de buffer documentada
  },
  "evaluationRunIds": [],                     // identificadores de ejecuciones REALES
  "evaluationSummary": null,                  // null si no hay evaluación real
  "pesos": {
    "training/weights.safetensors": { "bytes": 43264, "sha256": "…" }
  }
}
```

Reglas semánticas comprobadas además del esquema:

- `formatVersion` debe ser exactamente `1` (versionado mayor: cambios incompatibles).
- `runtimeTargets` no vacío y ⊆ {`ts-puro`, `onnx`}.
- `architecture.tipo` debe estar en el catálogo de arquitecturas soportadas por el
  runtime local y sus dimensiones deben coincidir con las del juego declarado.
- `trainingConfig` debe ser espejo exacto de `training/config.json`.
- `evaluationSummary` debe ser espejo exacto de `evaluation/summary.json` (si existe).
- `pesos` debe listar cada archivo no-texto con `bytes` y `sha256` (los checksums reales
  viven en `integrity/checksums.sha256`; `pesos` es coherencia adicional del manifiesto).

## 4. Arquitecturas soportadas

Catálogo versionado en código (`src/dominio/neural/red.ts` y `entrenamiento/red.py`,
definiciones gemelas verificadas por pruebas de paridad — §9).

### `conv-politica-valor-v1`

Red convolucional pequeña de política y valor (juegos de tablero de 2 jugadores,
información perfecta, un movimiento por turno):

- Entrada: tensores `[lote, canales=2, alto, ancho]` F32.
  Canal 0 = fichas del jugador con turno, canal 1 = fichas del rival.
- `conv1`: Conv2d(2→32, kernel 3×3, padding 1) + ReLU.
- `conv2`: Conv2d(32→32, kernel 3×3, padding 1) + ReLU.
- Cabeza de política: Conv2d(32→4, 1×1) + ReLU → aplanar → Linear(4·alto·ancho → acciones).
- Cabeza de valor: Conv2d(32→2, 1×1) + ReLU → aplanar → Linear(2·alto·ancho → 16) + ReLU
  → Linear(16 → 1) + tanh. Valor desde la perspectiva del jugador con turno.
- Salida de política = **logits por acción** (softmax e ilegales a −∞ los aplica el
  runtime, no la red).

Nombres canónicos de tensores (idénticos en SafeTensors y en ambos runtimes):

| Nombre | Forma (3×3, acciones=9) |
|---|---|
| `conv1.peso` | [32, 2, 3, 3] |
| `conv1.sesgo` | [32] |
| `conv2.peso` | [32, 32, 3, 3] |
| `conv2.sesgo` | [32] |
| `politica.conv.peso` | [4, 32, 1, 1] |
| `politica.conv.sesgo` | [4] |
| `politica.fc.peso` | [9, 36] |
| `politica.fc.sesgo` | [9] |
| `valor.conv.peso` | [2, 32, 1, 1] |
| `valor.conv.sesgo` | [2] |
| `valor.fc1.peso` | [16, 18] |
| `valor.fc1.sesgo` | [16] |
| `valor.fc2.peso` | [1, 16] |
| `valor.fc2.sesgo` | [1] |

(A 10.708 parámetros en 3×3. La forma depende de `alto/ancho/acciones` del manifiesto.)

## 5. Pesos — SafeTensors

- Archivo `training/weights.safetensors` conforme al formato público de SafeTensors:
  enterero u64 little-endian con la longitud de la cabecera, cabecera JSON
  `{ nombre: { dtype, shape, data_offsets } }`, y región de datos F32 little-endian.
- Restricciones .lba v1: `dtype` **exclusivamente `F32`**, offsets crecientes, sin
  solapamientos y dentro de la región de datos. (Se permiten huecos: el validador los
  acepta; el exportador no los genera.)
- El conjunto de tensores y sus formas debe coincidir **exactamente** con la tabla de la
  arquitectura declarada en el manifiesto: ni tensores de más, de menos, ni formas erróneas.

## 6. Integridad

- `integrity/checksums.sha256`: texto UTF-8, una línea por archivo:
  `<sha256 hexadecimal (64)>␣␣<ruta>\n`, rutas en orden lexicográfico.
- Cubre **todos** los archivos del paquete excepto él mismo.
- El importador recalcula cada SHA-256 y exige igualdad exacta.
- Integridad del paquete completo: el exportador devuelve el SHA-256 del `.lba` resultante
  y el **registro de cerebros lo almacena** al importar (huella del paquete). Las
  generaciones descendentes registran esa huella en `training/lineage.json`. Así la
  cadena completa paquete→registro→descendientes es verificable sin firmas criptográficas
  (alcance declarado: detección de corrupción y trazabilidad, no autenticidad de autor).

## 7. `gameRulesHash`

- FNV-1a de 32 bits (mismo algoritmo que `src/dominio/motor/huella.ts`) sobre el JSON
  canónico de `{ id, reglasVersion, dimensiones, familia }` del juego tal como lo declara
  el catálogo local (`src/dominio/juegos/registro.ts`).
- **Alcance honesto**: identifica la versión declarada de las reglas; no es una prueba del
  comportamiento de la implementación. La prueba de comportamiento son las posiciones de
  prueba del juego (que el motor valida) y las partidas por replay. El importador rechaza
  la combinación si `gameId`, `reglasVersion` o el hash no coinciden con el catálogo local.

## 8. Compatibilidad juego ⇄ modelo (regla dura)

Un cerebro solo puede participar en un juego si **todo** esto coincide con el catálogo
local: `gameId` existe, `gameRulesVersion` igual, `gameRulesHash` igual, dimensiones de
observación iguales a las del juego, y `acciones` igual al número de celdas del espacio de
acción del juego. En caso contrario, el rechazo es explícito con causa. La «transferencia»
entre juegos distintos (p. ej. al futuro simulador táctico 2D) **no es una propiedad del
archivo**: exige un adaptador con contrato propio de observación/acciones y entrenamiento
o adaptación medible (pendiente; ver ADR-015).

## 9. Paridad TypeScript ⇄ PyTorch

La misma arquitectura está implementada dos veces: PyTorch (entrenamiento, Python) y
TypeScript puro (inferencia, navegador/trabajador). La paridad se **prueba**:

- `entrenamiento/pruebas/` genera (con semilla) un paquete de prueba con pesos aleatorios
  fijos y un casete de entradas/salidas calculadas por PyTorch.
- `src/dominio/neural/red.test.ts` carga ese paquete con el importador, ejecuta la
  inferencia TS y compara con las salidas de PyTorch con tolerancia 1e-4.
- Si la paridad se rompe, la prueba falla: nadie puede declarar compatibilidad sin
  comprobarla.

## 10. Seguridad de la importación (orden obligatorio)

1. Tamaño del archivo dentro de límites (y > 0).
2. Estructura ZIP legible; enumeración del directorio central **antes** de descomprimir.
3. Nombres de entradas seguros: regex `^[A-Za-z0-9._/-]+$`, sin `..`, sin `/` inicial,
   sin `\`, sin duplicados; sin entradas fuera de la lista blanca.
4. Límites de entradas/tamaños (tabla §2) sobre los tamaños **declarados**.
5. Descompresión solo de la lista blanca.
6. `manifest.json`: UTF-8, JSON válido, esquema Zod v1, reglas semánticas.
7. `integrity/checksums.sha256`: formato, cobertura exacta, sin duplicados.
8. Recálculo y comparación de todos los SHA-256.
9. Estructura de pesos: cabecera SafeTensors válida, F32, offsets en rango, conjunto y
   formas exactas según arquitectura.
10. Compatibilidad con el catálogo local de juegos (§8) y con los runtimes disponibles.

Cualquier paso que falle → rechazo con error tipado y **ninguna escritura** en el registro
(un cerebro válido preexistente nunca se sobrescribe por una importación fallida).

## 11. Exportación

El exportador recibe registros reales (manifiesto, buffers de pesos, configuración,
linaje, evaluación opcional ya validados), calcula checksums, construye el ZIP y devuelve
`{ bytes, sha256 }`. El exportador **nunca** inventa campos: si no hay evaluación real no
escribe `evaluation/summary.json` y el manifiesto lleva `evaluationSummary: null`.

## 12. Cambios de versión del formato

- Cambios aditivos compatibles → se mantiene `formatVersion: 1` y el esquema Zod los
  tolera de forma controlada (documentados aquí).
- Cambios incompatibles → `formatVersion: 2` con su propia especificación y migración
  documentada. El importador de v1 rechaza versiones mayores futuras con error explícito.
