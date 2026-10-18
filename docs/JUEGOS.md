# Catálogo de juegos y reglas

Versión del catálogo: 1.1 (Fase 1). Cada juego implementado declara `reglasVersion` en el
código; cualquier cambio de reglas bumpa la versión y queda registrado aquí y en las
pruebas.

Convenio de notación: filas numeradas desde arriba (1..N); columnas con letras (a..o);
una jugada de celda se escribe `letraNúmero` (p. ej. `c3`); en cuatro en raya solo la
columna (`d`).

## Implementados (Fase 1)

### 1. Tres en raya 3×3 — `tres-en-raya-3` (reglas v1)

- **Tablero**: 3×3, celdas vacías al inicio. Jugador 1 (✕) mueve primero; turnos alternos.
- **Movimientos legales**: ocupar cualquier celda vacía.
- **Victoria**: 3 marcas propias consecutivas en fila, columna o diagonal (8 líneas).
- **Empate**: tablero lleno sin línea (9 jugadas).
- **Simetrías declaradas**: el grupo dihedral D4 (8 elementos: 4 rotaciones + 4 espejos).
- **Estado resuelto**: empate con juego perfecto — **verificado localmente** por
  solucionador exacto (ver `docs/INFORMES/FASE-1.md` y artefacto
  `docs/INFORMES/datos/solucionador-fase1.json`).

### 2. Tres en raya 4×4 (cuatro en línea) — `tres-en-raya-4` (reglas v1)

- **Tablero**: 4×4 vacío.
- **Condición de victoria documentada**: **4 marcas consecutivas** en fila, columna o
  diagonal (4+4+2 = 10 líneas). Variante clásica de «four-in-a-row en 4×4».
- **Movimientos legales**: cualquier celda vacía. **Empate**: tablero lleno (16 jugadas).
- **Simetrías**: D4.
- **Estado resuelto**: RESUELTO LOCALMENTE en Fase 1 por búsqueda exhaustiva
  (negamax exacto sin poda, TT con claves canónicas por simetría):
  **empate con juego perfecto**. 6.460.009 nodos, 48,6 s, presupuesto 240 s,
  16 jugadas óptimas iniciales y consistencia padre/hijo verificada (3
  muestras). Artefacto: `docs/INFORMES/datos/solucionador-fase1.json`.
  La suite de CI verifica por separado el comportamiento de presupuesto
  (2,5 s ⇒ incompleto, nada declarado).

### 3-5. Gomoku estilo libre — `gomoku-7`, `gomoku-9`, `gomoku-15` (reglas v1)

- **Tablero**: N×N (7, 9, 15), vacío. Jugador 1 (negras) mueve primero.
- **Movimientos legales**: cualquier celda vacía.
- **Victoria**: **5 o más** piedras propias consecutivas en las 4 direcciones (estilo
  libre: la línea de más de 5 también gana). Sin reglas de apertura ni intercambio.
- **Empate**: tablero lleno.
- **Simetrías**: D4.
- **Estado resuelto**: no resuelto localmente (espacio excesivo para el solucionador
  genérico; previsto solucionador especializado o métodosexactos en Fase 5 si procede).

### 6. Cuatro en raya — `cuatro-en-raya-7x6` (reglas v1)

- **Tablero**: 7 columnas × 6 filas; gravedad: la ficha cae a la casilla vacía más baja
  de la columna elegida.
- **Movimientos legales**: columnas no llenas.
- **Victoria**: 4 fichas propias consecutivas en horizontal, vertical o diagonal.
- **Empate**: 42 fichas sin línea.
- **Simetrías**: espejo horizontal (columna c ↔ 8−c) — única simetría válida por la
  gravedad.
- **Estado resuelto**: conocido externamente como victoria del primer jugador con juego
  perfecto, pero **no verificado localmente**; se declara «no resuelto localmente» hasta
  completar la verificación exigida (Fase 5).

## Pendientes (planificados, reglas previstas — se documentarán al implementar)

| # | Juego | Reglas previstas (borrador) | Fase |
|---|---|---|---|
| 7 | Othello 4×4 (`othello-4`) | Configuración inicial 2×2 central (blancas/negras alternadas); volteo estándar en 8 direcciones; sin passes salvo obligación; gana quien tiene más discos al llenarse o bloquearse el tablero | 5 |
| 8 | Othello 6×6 (`othello-6`) | Igual que 7 en tablero 6×6 | 5 |
| 9 | Damas reducida (`damas-reducida`) | **Decisión pendiente de experimento** (ARQUITECTURA §10): candidato inicial 6×6, 6 peones por bando, sin coronación ni captura obligatoria — la variante exacta se fijará y documentará antes de implementar | 5 |
| 10 | Hex 5×5 (`hex-5`) | Conexión entre los dos lados propios (jugador 1 conecta arriba/abajo, jugador 2 izquierda/derecha); sin empate (probado por topología); мостes | 5 |
| 11 | Breakthrough 5×5 (`breakthrough-5`) | Peones avanzan 1 casilla y capturan en diagonal; gana quien alcanza la última fila o deja sin piezas al rival | 5 |
| 12 | Ajedrez reducido 5×5 (`ajedrez-5`) | Candidato: Minichess de Gardner (5×5, filas: RNBD R… sin enroque, sin captura al paso; promoción en última fila; jaque/mate/ahogado y tablas por repetición simplificadas). La especificación completa de piezas y tablas se publicará al implementar | 5 |
| 13 | Ajedrez reducido 6×6 (`ajedrez-6`) | Variante 6×6 con alfil de distinto color por bando; mismas reglas de mate/ahogado/tablas simplificadas; documento completo al implementar | 5 |
| 14 | Cuatro en raya ampliada (`cuatro-en-raya-8x7`) | 8 columnas × 7 filas, mismas reglas de gravedad y 4 en línea | 5 |
| 15 | Othello 8×8 estándar (`othello-8`) | Reglas oficiales de Othello en 8×8 (variante adicional de Othello con configuración explícita) | 5 |

> Honestidad de catálogo: las 9 variantes pendientes **no** están implementadas ni
> jugables; el catálogo de la aplicación las lista con estado «Pendiente» y sin datos.

## Posiciones de prueba

Cada juego implementado expone `posicionesPrueba()`: estados con nombre, jugadas legales
esperadas, resultado esperado (si terminal) y mejor jugada táctica (si la hay). Las suites
de agentes y del solucionador las consumen; el catálogo de posiciones es parte del
contrato versionado de reglas.
