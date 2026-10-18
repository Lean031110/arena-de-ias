# Índice de modelos versionados (ADR-015)

Almacenamiento versionado y documentado de los cerebros `.lba` producidos por
entrenamientos reales. Cada entrada conserva el paquete íntegro, su registro de
entrenamiento y las huellas verificables. Tamaños de decenas de KB: apropiados
para Git; artefactos de workflow para pruebas de CI, no para promover modelos.

| Cerebro | Juego | Padre | Run | sha256 del paquete | Examen v1 |
|---|---|---|---|---|---|
| `red-ter-3@1.0.0` | tres-en-raya-3 | — (raíz) | 20261019-ter3-001 | `d31d1456850a6133ecb31fe1722f9eca6e401adad5832075246b3f69f5f5e06c` | NO aprobado (0,250) |
| `red-ter-3@1.0.1` | tres-en-raya-3 | `red-ter-3@1.0.0` | 20261020-ter3-002 | `65a1b9c944a9c29cf240814d9c3ab7794114074fd016772451fd3652175cb77d` | NO aprobado (0,500) |

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
  (mejora observada en la muestra: de 120 derrotas a 0; el umbral v1 de 0,60 no
  fue alcanzado; ver hallazgo del techo y la verificación exhaustiva de la
  referencia).

## Hallazgo del techo (EMPÍRICO, no matemático) — corregido en la revisión

`scripts/medir-techo-heuristico.ts`: minimax-d6 contra el heurístico en 200
partidas con lados alternos = **200 empates exactos (0,500)**; añadido en la
revisión: minimax-d9 EXACTO (búsqueda completa del juego), 100 partidas =
**100 empates (0,500)**. Ningún rival MEDIDO ha superado 0,5 contra la
referencia congelada de tres-en-raya-3.

**Corrección importante (verificación exhaustiva, revisión de Fase 2)**:
NO es correcto afirmar que la referencia «es invencible» ni que el umbral 0,60
sea «matemáticamente inalcanzable». La verificación exhaustiva
(`scripts/verificar-heuristico.ts`, 5478 posiciones tablero+turno) demostró
que el heurístico NO es una estrategia óptima (deja escapar victorias) y la
explotabilidad exacta (`scripts/explotar-heuristico.ts`) demostró que como
jugador 2 PIERDE ante un adversario que conozca su política y elija la apertura
adecuada. Por tanto: (a) las 200/240/100 partidas sin derrotas son un hecho
EMPÍRICO de esas muestras, no una garantía; (b) un explotador informado podría
en teoría alcanzar hasta ~0,75 con lados alternos (gana moviendo primero,
empata respondiendo) — cota teórica del análisis contra-la-política, aún sin
agente construido que la materialice. Los dos exámenes se mantienen rechazados
(criterios congelados, ADR-007: 0,250 y 0,500 < 0,60) y la recalibración sigue
siendo propuesta v2 para exámenes FUTUROS (nunca retroactiva), pendiente de ADR
específico. Artefactos: `docs/INFORMES/datos/verificacion-heuristico-ter3.json`
y `docs/INFORMES/datos/explotabilidad-heuristico-ter3.json`.

## Verificación local de cualquier entrada

```bash
npx tsx scripts/verificar-lba.ts modelos/versionados/red-ter-3@1.0.1.lba 20
npx tsx scripts/examinar.ts modelos/versionados/red-ter-3@1.0.1.lba 240 200
```

Ambos comandos revalidan el paquete con el validador TS completo y ejecutan
partidas reales; las huellas deben coincidir con las de esta tabla.
