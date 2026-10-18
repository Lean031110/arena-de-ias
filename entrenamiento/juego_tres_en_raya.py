"""Motor de tres en raya 3×3 — gemelo exacto del motor TypeScript.

Contrato compartido (docs/LBA-MODELO.md §9 y ADR-014):
- Celdas: lista de 9 valores (0 vacía, 1 jugador 1, 2 jugador 2), índice
  ``fila * 3 + columna`` (recorrido por filas, igual que ``lineas.ts``).
- Movimiento: ``(fila, columna)``; índice de acción = ``fila * 3 + columna``.
- Resultado: ``None`` si no terminal; ``0`` empate; ``1``/``2`` ganador.
- Observación: planos [2, 3, 3] (canal 0 = fichas del turno, canal 1 = rival),
  idéntico a ``observarTablero`` de ``neural/observacion.ts``.

La paridad con el motor TS se PRUEBA con casetes de juegos cruzados
(``pruebas/test_juego.py``): partidas reales generadas por TS se reproducen
aquí con resultados idénticos, y viceversa.
"""

from __future__ import annotations

from typing import Iterable, Optional

TAM = 3
ACCIONES = 9

_LINEAS: tuple[tuple[int, int, int], ...] = tuple(
    [
        *(tuple(r * TAM + c for c in range(TAM)) for r in range(TAM)),
        *(tuple(r * TAM + c for r in range(TAM)) for c in range(TAM)),
        tuple(r * TAM + r for r in range(TAM)),
        tuple(r * TAM + (TAM - 1 - r) for r in range(TAM)),
    ]
)


def estado_inicial() -> list[int]:
    return [0] * TAM * TAM


def jugador_actual(estado: list[int]) -> int:
    """Jugador con turno: X (1) abre; la paridad de piezas decide."""
    x = sum(1 for v in estado if v == 1)
    o = sum(1 for v in estado if v == 2)
    return 1 if x == o else 2


def movimientos_legales(estado: list[int]) -> list[int]:
    return [i for i, v in enumerate(estado) if v == 0]


def aplicar(estado: list[int], accion: int) -> list[int]:
    """Aplica un movimiento por índice de acción; lanza si es ilegal."""
    if not 0 <= accion < ACCIONES:
        raise ValueError(f"acción {accion} fuera de rango")
    if estado[accion] != 0:
        raise ValueError(f"celda {accion} ocupada")
    nuevo = list(estado)
    nuevo[accion] = jugador_actual(estado)
    return nuevo


def ganador(estado: list[int]) -> Optional[int]:
    """Ganador si hay 3 en línea; None si nadie ha ganado todavía."""
    for a, b, c in _LINEAS:
        va, vb, vc = estado[a], estado[b], estado[c]
        if va != 0 and va == vb == vc:
            return va
    return None


def resultado(estado: list[int]) -> Optional[int]:
    """None si no terminal; 0 empate; 1/2 ganador."""
    g = ganador(estado)
    if g is not None:
        return g
    if all(v != 0 for v in estado):
        return 0
    return None


def observar(estado: list[int]) -> list[list[list[float]]]:
    """Planos [2, 3, 3] idénticos a ``observarTablero`` (TS)."""
    turno = jugador_actual(estado)
    rival = 3 - turno
    plano0 = [[1.0 if estado[f * TAM + c] == turno else 0.0 for c in range(TAM)] for f in range(TAM)]
    plano1 = [[1.0 if estado[f * TAM + c] == rival else 0.0 for c in range(TAM)] for f in range(TAM)]
    return [plano0, plano1]


def notacion(acciones: Iterable[int]) -> list[str]:
    """Notación textual igual que el motor TS (columnas a-c, filas 1-3)."""
    columnas = "abc"
    return [f"{columnas[a % TAM]}{a // TAM + 1}" for a in acciones]
