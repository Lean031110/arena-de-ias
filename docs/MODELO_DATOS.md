# Modelo de datos

Versión: 1.1 (Fase 1). Todos los tipos viven en `src/dominio/` y viajan serializados.

## 1. Principios de procedencia

Cada métrica mostrada debe poder responder: **origen** (medición directa / cálculo sobre
registros / estimación / ausente), **fórmula**, **número de observaciones**, **estado de
validación** y **marca temporal**. Los tipos siguientes materializan esa exigencia.

Clasificación usada en esta versión:

- **Medición directa**: `tiempoMs` (medido con `performance.now()`), nodos/simulaciones
  contados por los algoritmos, resultado de la partida (decidido por las reglas).
- **Cálculo sobre registros**: puntuación media, victorias/empates/derrotas agregadas,
  IC de Wilson, medias por agente.
- **Estimación**: `evaluar()` de cada juego (heurística de minimax/rollout). Se declara
  como estimación en la UI («valor estimado», nunca «probabilidad de victoria»).
- **Ausente**: todo lo no medido (p. ej. pérdida de entrenamiento en Fase 1: «Sin datos»).

## 2. RegistroPartida (partida completa)

```ts
{
  id: string                  // UUID v4
  fecha: string               // ISO-8601 UTC
  entorno: { plataforma: 'navegador' | 'node', descripcion: string }
  juego: { id: string, reglasVersion: string }
  semilla: number             // semilla raíz, entero ≥ 0
  agentes: [
    { id: string, nombre: string, version: string,
      config: Record<string, number | boolean> }   // orden estable
  ]                            // [0] juega como jugador 1, [1] como jugador 2
  movimientos: [
    { indice: number           // 0-based
      jugador: 1 | 2
      notacion: string         // p. ej. "c3" (tres en raya) o "d" (cuatro en raya)
      estadisticas: { nodos?: number, simulaciones?: number, profundidad?: number,
                      presupuestoAgotado?: boolean, tiempoMs: number }
    }
  ]
  resultado: { tipo: 'victoria', ganador: 1 | 2 } | { tipo: 'empate' } | null
                                 // null ⇒ partida inválida (movimiento ilegal, etc.)
  validez: 'verificada' | 'invalida'
  errores: string[]            // motivos de invalidez/fallos (vacío si verificada)
  duracionMs: number           // medición directa de pared
  resumenAgentes: [            // agregados calculados a partir de movimientos
    { nodosTotales?: number, simulacionesTotales?: number,
      profundidadMaxima?: number, tiempoTotalMs: number, presupuestoAgotado: boolean }
  ]
  huella: string               // FNV-1a 32 bits en hex del núcleo determinista (§7)
}
```

## 3. RegistroEvaluación (round-robin)

```ts
{
  id: string; fecha: string; entorno: {...}
  juego: { id, reglasVersion }
  encuentrosPorPar: number
  semillaBase: number
  agentes: [ { id, nombre, version, config } ]      // 2..n agentes
  partidas: RegistroPartida[]                        // todas las partidas, íntegras
  resumenPorAgente: [
    { agenteId: string, victorias: number, empates: number, derrotas: number,
      partidas: number, puntuacion: number,
      ic95: { disponible: boolean, inferior: number, superior: number },
      tiempoMedioMs: number, nodosMedios?: number, simulacionesMedias?: number }
  ]
  invalidas: number
  errores: string[]
  huella: string
}
```

Fórmulas (calculadas, reproducibles):

- `puntuacion = (victorias + empates / 2) / partidas`
- IC de Wilson al 95 % sobre la puntuación: con `p̂` = puntuación, `n` = partidas,
  `z = 1.959964`:
  `centro = (p̂ + z²/2n) / (1 + z²/n)`;
  `margen = z/(1 + z²/n) · √(p̂(1−p̂)/n + z²/4n²)`;
  límites recortados a [0, 1]. `disponible = false` cuando `n = 0`.
- medias: suma del campo entre el número de partidas del agente.

## 4. Evento (registro experimental central)

```ts
{
  id: string            // UUID v4 — deduplicación por id en almacenamiento
  tipo: 'partida' | 'evaluacion' | 'validacion' | 'error' | 'sistema' | 'almacenamiento'
  fecha: string         // ISO-8601 UTC
  resumen: string       // línea legible en español
  datos?: unknown       // carga útil (registro completo, detalle de fallo…)
  huella: string        // FNV-1a sobre { tipo, resumen, datos }
}
```

Anti-duplicación: el almacén usa `put` semántico «si el id existe, no se inserta otro»
(verificación previa por clave). El registro de eventos es append-only salvo esa
deduplicación exacta por id.

## 5. ConfigPartida / ConfigEvaluación (entradas)

`ConfigPartida`: `{ juegoId, semilla, agentes: [{ id, config }] }` (exactamente 2).
`ConfigEvaluación`: `{ juegoId, semillaBase, encuentrosPorPar, agentes: [{ id, config }] }`
(2..8). Ambos se validan con esquemas Zod en el borde (rango de semilla 0..2^53−1,
identificadores conocidos, parámetros numéricos acotados por agente).

## 6. Validación en los bordes de confianza

- **Entradas de UI/usuario** y **datos leídos de IndexedDB**: esquemas Zod
  (`aplicacion/esquemas.ts`). Un registro que no valida se marca como corrupto y se
  registra un evento de error; jamás se muestra como dato válido.
- **Estados internos** (frontera trabajador ↔ dominio): validación estructural manual en
  `decodificar` de cada juego (forma, longitudes, tipos primitivos) con
  `ErrorDatosInvalidos`. Decisión ADR: rendimiento en camino caliente, Zod en bordes.
- **Importación de paquetes** (Fase 2): manifiesto versionado + Zod + huella; nunca
  código ejecutable.

## 7. Huella de integridad: garantías y limitaciones

- **Qué es**: FNV-1a de 32 bits (no criptográfico) sobre el **núcleo determinista**
  (semilla; juego y versión; ids/versiones/configs de agentes; notaciones de movimientos
  en orden; resultado; validez). Excluye fechas, tiempos, entorno y duraciones.
- **Qué garantiza**: dos serializaciones del mismo suceso determinista producen la misma
  huella; una corrupción accidental del núcleo cambia la huella con probabilidad
  1 − 2⁻³².
- **Qué NO garantiza**: que el evento ocurrió realmente, su autoría, su momento, ni
  resistencia a manipulación deliberada (colisiones construibles). Documentado
  expresamente por exigencia de la especificación (§15).
- La UI presenta la huella como «huella de integridad (no criptográfica)».

## 8. Notación de movimientos

- Juegos de celda (tres en raya, gomoku): `letraColumna + numeroFila` (filas numeradas
  desde arriba; p. ej. `c3` = columna 3, fila 3).
- Cuatro en raya: letra de columna (`a`..`g`), fila implícita por gravedad.
- `formatearMovimiento` y `analizarMovimiento` son inversos exactos (probado).

## 9. Persistencia (IndexedDB)

Base `arena-de-ias`, versión 1:

| Almacén | Clave | Valor |
|---|---|---|
| `partidas` | `id` | RegistroPartida |
| `evaluaciones` | `id` | RegistroEvaluación |
| `eventos` | `id` | Evento |

Migraciones futuras: bump de versión con migración explícita protegida (Fase 2). Los
 pesos neuronales vivirán en almacenes separados con referencias cruzadas por id
 (nunca embebidos en las partidas).

## 10. Exportación

- **JSON**: serialización íntegra de registros/evaluaciones (mismo esquema, misma huella).
- **CSV** (UTF-8 con BOM): partidas → `id, fecha, juego, reglas_version, semilla,
  agente1_id, agente1_version, agente2_id, agente2_version, resultado, jugadas,
  duracion_ms, validez, huella`; evaluaciones → una fila por agente con V/E/D, puntuación
  e IC 95 %. Escapado estándar (comillas dobles, doblado de comillas internas).

## 11. Reproducibilidad y semillas

- Semilla raíz por partida (UI: aleatoria editable; scripts: fijada).
- Derivación por agente/jugada: `mezclar(semilla, indiceJugada)` (mezcla tipo
  SplitMix32 sobre enteros) → RNG mulberry32 del agente para esa jugada.
- La re-ejecución de una `ConfigPartida` reproduce exactamente movimientos y resultado
  (probado) en el mismo motor JS. Los tiempos y huellas de entorno NO se reproducen
  (por eso están fuera de la huella).
- Limitación documentada: entre motores JS distintos puede haber divergencia numérica
  patológica (RIESGOS.md R3).
