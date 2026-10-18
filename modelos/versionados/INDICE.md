# Índice de modelos versionados (ADR-015)

Almacenamiento versionado y documentado de los cerebros `.lba` producidos por
entrenamientos reales. Cada entrada conserva el paquete íntegro, su registro de
entrenamiento y las huellas verificables. Tamaños de decenas de KB: apropiados
para Git; artefactos de workflow para pruebas de CI, no para promover modelos.

| Cerebro | Juego | Padre | Run | sha256 del paquete | Examen v1 |
|---|---|---|---|---|---|
| `red-ter-3@1.0.0` | tres-en-raya-3 | — (raíz) | 20261019-ter3-001 | `d31d1456850a6133ecb31fe1722f9eca6e401adad5832075246b3f69f5f5e06c` | NO aprobado (0,250) |
| `red-ter-3@1.0.1` | tres-en-raya-3 | `red-ter-3@1.0.0` | 20261020-ter3-002 | `65a1b9c944a9c29cf240d19d3762a48f30ac77b2a1b7c87497677e53c00d616b` | NO aprobado (0,500) |

## Detalles por versión

### red-ter-3@1.0.0 — entrenamiento inicial

- Artefactos: `red-ter-3@1.0.0.lba` (43 144 bytes) + `20261019-ter3-001-registro.json`.
- Entrenamiento real (CPU, torch 2.14.1+cpu, 2 vCPU): 5 iteraciones × 32 partidas
  de autojuego (160 partidas, 1 340 ejemplos), 240 pasos de optimización,
  pérdida medida 2,584 → 1,899.
- Evaluación real en Python: 0,675 contra aleatorio-uniforme; 40 empates contra
  la versión inicial congelada (idéntica red, sin entrenar).
- Evaluación real en el motor TS (200 sims PUCT, 20 partidas por rival, lados
  alternos): aleatorio 0,875 · heurístico 0,250 · minimax-d4 0,250 · mcts-500 0,525.
- Examen de promoción v1: 240 partidas contra la referencia congelada
  (heurístico): 0V 120E 120D, puntuación 0,250, IC95 [0,199; 0,308] → **no aprobado**.

### red-ter-3@1.0.1 — continuación (reanudada del padre)

- Artefactos: `red-ter-3@1.0.1.lba` (43 210 bytes) + `20261020-ter3-002-registro.json`.
- Reanudación real con `--reanudar red-ter-3@1.0.0.lba` (el padre queda intacto y
  versionado): 16 iteraciones × 48 partidas (768 partidas, 6 682 ejemplos),
  2 048 pasos, pérdida medida 1,546 → 1,246.
- Evaluación real en Python: 0,6125 contra aleatorio; 20E/20D contra la 1.0.0 congelada.
- Examen de promoción v1: 240 partidas contra la referencia congelada:
  **0V 240E 0D**, puntuación 0,500, IC95 [0,437; 0,563] → **no aprobado**
  (mejora real demostrada: de 120 derrotas a 0, pero el umbral v1 de 0,60 es
  inalcanzable contra un rival invencible; ver hallazgo del techo).

## Hallazgo del techo (medido, no supuesto)

`scripts/medir-techo-heuristico.ts`: minimax-d6 (búsqueda casi exacta) contra el
heurístico en 200 partidas con lados alternos = **200 empates exactos (0,500)**.
La referencia congelada de tres-en-raya-3 es invencible: ningún agente puede
superar 0,5 contra ella. El criterio v1 (puntuación ≥ 0,60) es matemáticamente
inalcanzable en ese juego. Los dos exámenes se mantienen rechazados (criterios
congelados, ADR-007) y la recalibración queda como propuesta v2 para exámenes
FUTUROS (nunca retroactiva), pendiente de ADR específico.

## Verificación local de cualquier entrada

```bash
npx tsx scripts/verificar-lba.ts modelos/versionados/red-ter-3@1.0.1.lba 20
npx tsx scripts/examinar.ts modelos/versionados/red-ter-3@1.0.1.lba 240 200
```

Ambos comandos revalidan el paquete con el validador TS completo y ejecutan
partidas reales; las huellas deben coincidir con las de esta tabla.
