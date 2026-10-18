"""Pruebas del motor 3×3 Python: reglas, ilegales, terminales y PARIDAD
con el motor TypeScript mediante el casete de juegos cruzados.

La paridad se demuestra en la dirección TS→Python: las partidas jugadas por
el motor TS (``juegos-ts.json``, generadas por scripts/generar-casete-juegos.ts)
se reproducen aquí con el mismo resultado.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from entrenamiento import juego_tres_en_raya as juego

CASETE = Path(__file__).parent / "casetes" / "juegos-ts.json"


def _accion_desde_notacion(notation: str) -> int:
    columna = "abc".index(notation[0])
    fila = int(notation[1]) - 1
    return fila * 3 + columna


def test_partida_inicial_sin_ganador() -> None:
    assert juego.ganador(juego.estado_inicial()) is None
    assert juego.resultado(juego.estado_inicial()) is None


def test_movimientos_ilegales_rechazados() -> None:
    estado = juego.aplicar(juego.estado_inicial(), 4)  # centro ocupado
    with pytest.raises(ValueError):
        juego.aplicar(estado, 4)
    with pytest.raises(ValueError):
        juego.aplicar(estado, -1)
    with pytest.raises(ValueError):
        juego.aplicar(estado, 9)


def test_victoria_en_fila_columna_diagonal() -> None:
    # Fila superior para X.
    estado = [1, 1, 1, 0, 2, 0, 0, 2, 0]
    assert juego.ganador(estado) == 1
    # Columna derecha para O (X movió 5 veces, O 4: X tiene turno — la
    # terminalidad no depende del turno).
    estado = [1, 0, 2, 1, 0, 2, 0, 1, 2]
    assert juego.ganador(estado) == 2
    # Diagonal principal para X.
    estado = [1, 2, 2, 0, 1, 0, 0, 0, 1]
    assert juego.ganador(estado) == 1


def test_empate_con_tablero_lleno() -> None:
    estado = [1, 2, 1, 1, 1, 2, 2, 1, 2]  # sin líneas
    assert juego.ganador(estado) is None
    assert juego.resultado(estado) == 0


def test_observacion_canonica() -> None:
    # X en el centro, juega O: canal 0 (O) vacío, canal 1 (X) con el centro.
    estado = juego.aplicar(juego.estado_inicial(), 4)
    planos = juego.observar(estado)
    assert planos[0][1][1] == 0.0
    assert planos[1][1][1] == 1.0
    assert sum(sum(f) for f in planos[0]) == 0
    assert sum(sum(f) for f in planos[1]) == 1


def test_notacion_idéntica_a_ts() -> None:
    assert juego.notacion([4, 0, 8]) == ["b2", "a1", "c3"]
    assert juego.notacion([2]) == ["c1"]


def test_replay_de_juegos_ts_resultado_idéntico() -> None:
    """PARIDAD DEL MOTOR: las partidas TS se reproducen con igual resultado."""
    assert CASETE.exists(), f"falta el casete {CASETE}: genera con npx tsx scripts/generar-casete-juegos.ts"
    casete = json.loads(CASETE.read_text(encoding="utf-8"))
    assert len(casete["juegos"]) >= 12
    for partida in casete["juegos"]:
        estado = juego.estado_inicial()
        for notation in partida["notacion"]:
            # Toda jugada del registro TS debe ser legal aquí también.
            assert estado[_accion_desde_notacion(notation)] == 0, (
                f"juego {partida['indice']}: jugada {notation} ilegal en Python"
            )
            estado = juego.aplicar(estado, _accion_desde_notacion(notation))
        resultado = juego.resultado(estado)
        esperado = partida["resultado"]
        if esperado["tipo"] == "empate":
            assert resultado == 0, f"juego {partida['indice']}: TS empate, Python {resultado}"
        else:
            assert resultado == esperado["ganador"], (
                f"juego {partida['indice']}: TS ganador {esperado['ganador']}, Python {resultado}"
            )
        assert len(partida["notacion"]) == partida["jugadas"]


def test_propiedad_jugadas_totales_acotadas() -> None:
    """Cualquier partida termina en ≤ 9 jugadas (propiedad del juego)."""
    import random

    rng = random.Random(20261019)
    for _ in range(200):
        estado = juego.estado_inicial()
        jugadas = 0
        while juego.resultado(estado) is None:
            legales = juego.movimientos_legales(estado)
            estado = juego.aplicar(estado, rng.choice(legales))
            jugadas += 1
            assert jugadas <= 9
