# Plan de pruebas

Versión: 1.1 (Fase 1). Ejecutor: **Vitest 5** en entorno Node (el dominio no usa DOM).
Comando: `npm test` (`vitest run`, una pasada, sin reloj).

## 1. Estrategia

1. **Unitarias de reglas por juego**: legalidad, terminalidad, resultado, serialización,
   notación, simetrías. Una suite por variante.
2. **Unitarias de motor**: RNG (determinismo, uniformidad básica), huella FNV (vectores
   conocidos), eventos (deduplicación), validación de secuencias.
3. **Unitarias de agentes**: cada nivel respeta presupuesto, determinismo por semilla y
   corrección táctica mínima (ganar en 1, bloquear amenaza inmediata).
4. **Integración de partidas/evaluación**: ejecutor completo, registro, replay,
   alternancia de lados, agregados, IC de Wilson contra valores de referencia.
5. **Propiedades** (bucles deterministas con RNG propio, 200-500 casos, ADR-004):
   partidas aleatorias llegan a terminal con resultado consistente y replay válido;
   ida/vuelta codificar/decodificar/clave; simetrías preservan legalidad y terminalidad.
6. **Solucionador exacto**: contra casos de referencia conocidos (3×3 = empate con juego
   perfecto) y consistencia interna negamax (valor de hijo óptimo = −valor del padre).
7. **Persistencia**: con `fake-indexeddb` en Node: guardado/listado/borrado,
   deduplicación de eventos, registros corruptos detectados por Zod.
8. **CI (GitHub Actions)**: `npm ci` → typecheck → lint → `npm test` → build. La
   combinación completa debe estar verde para declarar una fase completada.

## 2. Casos obligatorios de la especificación (§8) y su cubrimiento

| Exigencia | Cubrimiento |
|---|---|
| No se pueden ejecutar movimientos ilegales | `aplicarMovimiento` lanza en cada suite de juego + prueba de secuencia ilegal |
| No se puede continuar una partida terminada | ejecutor detecta terminal y una jugada extra se registra como error/invalidación |
| El resultado final coincide con las reglas | suites de reglas + validación de replay |
| La reproducción conserva la secuencia | `validarSecuencia` + prueba de replay exacto |
| Semillas registradas y usadas de forma controlada | determinismo de partidas y agentes por semilla |
| Estados serializados recuperables | ida/vuelta + propiedad sobre estados aleatorios |
| Simetrías preservan legalidad | suite de simetrías por juego (biyección de jugadas, terminalidad y resultado) |
| Presupuestos de búsqueda respetados | minimax: profundidad/nodos; MCTS: simulaciones exactas |
| Solucionador exacto contra referencia | 3×3 empate; consistencia padre/hijo; 4×4 completado en presupuesto |

## 3. Catálogo de suites (Fase 1)

```
src/dominio/motor/rng.test.ts              — determinismo, rango, uniformidad básica, mezcla de semillas
src/dominio/motor/huella.test.ts           — vectores FNV-1a conocidos, estabilidad de orden de claves
src/dominio/motor/eventos.test.ts          — creación, deduplicación por id, huella estable
src/dominio/motor/validacion.test.ts       — secuencias válidas/inválidas/tuteladas
src/dominio/motor/solucionador.test.ts     — referencia 3×3, consistencia, 4×4 en presupuesto
src/dominio/juegos/tresEnRaya.test.ts      — reglas 3×3 y 4×4 (líneas, empates, notación)
src/dominio/juegos/gomoku.test.ts          — 5+ en línea, overline, empate, tamaños 7/9/15
src/dominio/juegos/cuatroEnRaya.test.ts    — gravedad, victorias H/V/D, empate, espejo
src/dominio/juegos/simetrias.test.ts       — propiedades de preservación (D4 y espejo)
src/dominio/agentes/aleatorio.test.ts      — legalidad, determinismo, uniformidad
src/dominio/agentes/heuristico.test.ts     — gana en 1, bloquea, determinismo
src/dominio/agentes/minimax.test.ts        — presupuestos, táctica, determinismo, profundidad
src/dominio/agentes/mcts.test.ts           — simulaciones exactas, táctica, determinismo
src/dominio/motor/partida.test.ts          — ejecutor, registro, replay, invalidez, entorno
src/dominio/motor/evaluacion.test.ts       — round-robin, alternancia, Wilson, agregados
src/dominio/motor/exportacion.test.ts      — CSV/JSON: columnas, escapado, ida/vuelta
src/aplicacion/almacen.test.ts             — IndexedDB (fake-indexeddb): CRUD, dedup, corrupción
src/dominio/propiedades.test.ts            — propiedades multi-juego (replay, serialización, simetrías)
```

## 4. Qué NO se prueba automáticamente en Fase 1 (y cómo se cubre)

- **Componentes React**: sin jsdom/Testing-library en esta fase. Cobertura indirecta:
  build de producción + verificación manual protocolizada (lista de comprobación en el
  informe de fase). Fase 2: añadir Testing Library si el presupuesto de mantenimiento lo
  permite.
- **Trabajador web en CI**: el protocolo es tipado y el dominio subyacente está probado;
  la construcción del bundle se verifica en `npm run build`. Prueba manual: ejecutar una
  evaluación en el navegador y comprobar progreso real.
- **Rendimiento**: separado de las unitarias (regla de la especificación). Los benchmarks
  reales viven en `scripts/` con artefactos JSON versionados, no en la suite de CI.
- **Navegadores reales**: verificación local documentada; CI solo ejecuta Node.

## 5. Reglas de higiene

- Prohibido `sleep`/esperas de wall-clock para lógica (solo mediciones de tiempo).
- Toda aleatoriedad de pruebas usa semillas fijas (mensajes de error incluyen la semilla).
- Un fallo nunca se salta con `.skip` sin un comentario con motivo y número de seguimiento.
- Las aserciones de tiempos solo exigen existencia y no-negatividad, jamás umbrales
  exactos (estabilidad en CI de 2 vCPU).
- El solucionador 4×4 tiene presupuesto de seguridad de tiempo: si se agota, la prueba
  falla (nunca se declara resuelto sin completar).
