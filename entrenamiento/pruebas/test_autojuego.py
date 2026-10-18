"""Pruebas del autojuego: MCTS-PUCT funcional, ejemplos bien formados,
partidas legales de punta a punta y reproducibilidad con semilla."""

from __future__ import annotations

import numpy as np
import torch

from entrenamiento import juego_tres_en_raya as juego
from entrenamiento.autojuego import MCTS, jugar_partida
from entrenamiento.red import RedPoliticaValor, inicializar_determinista


def _red(semilla: int = 20261019) -> RedPoliticaValor:
    red = RedPoliticaValor(3, 3, juego.ACCIONES)
    inicializar_determinista(red, semilla)
    red.eval()
    return red


def test_mcts_devuelve_visitas_que_suman_las_simulaciones() -> None:
    red = _red()
    mcts = MCTS(red, simulaciones=50)
    visitas, valor = mcts.buscar(juego.estado_inicial())
    assert sum(visitas) == 50  # presupuesto EXACTO
    assert len(visitas) == juego.ACCIONES
    assert -1.0 <= valor <= 1.0
    assert all(v >= 0 for v in visitas)


def test_partida_completa_legal_con_ejemplos() -> None:
    red = _red()
    mcts = MCTS(red, simulaciones=30)
    rng = np.random.default_rng(1)
    ejemplos, resultado, acciones = jugar_partida(red, mcts, rng)
    assert resultado in (0, 1, 2)
    assert 1 <= len(acciones) <= 9
    # Repetición manual: todas las acciones fueron legales.
    estado = juego.estado_inicial()
    for accion in acciones:
        assert estado[accion] == 0
        estado = juego.aplicar(estado, accion)
    assert juego.resultado(estado) == resultado
    # Ejemplos bien formados.
    for ejemplo in ejemplos:
        assert len(ejemplo.planos) == 2 and len(ejemplo.planos[0]) == 3
        assert len(ejemplo.politica) == juego.ACCIONES
        assert abs(sum(ejemplo.politica) - 1.0) < 1e-6
        assert ejemplo.valor in (-1.0, 0.0, 1.0)


def test_reproducibilidad_con_semilla() -> None:
    red = _red()
    mcts = MCTS(red, simulaciones=20)
    ejemplos_a, resultado_a, acciones_a = jugar_partida(red, mcts, np.random.default_rng(42))
    ejemplos_b, resultado_b, acciones_b = jugar_partida(red, mcts, np.random.default_rng(42))
    assert acciones_a == acciones_b
    assert resultado_a == resultado_b
    assert [e.valor for e in ejemplos_a] == [e.valor for e in ejemplos_b]


def test_el_mcts_encuentra_jugada_ganadora_inmediata() -> None:
    """Con victoria en una jugada, la mayoría de visitas debe ir a ella."""
    red = _red()
    mcts = MCTS(red, simulaciones=80)
    # X en (0,0) y (0,1): gana con (0,2) → acción 2.
    estado = [1, 1, 0, 0, 2, 0, 0, 2, 0]
    visitas, _ = mcts.buscar(estado)
    assert visitas[2] == max(visitas), f"visitas={visitas}"
