"""Pruebas de la red PyTorch: formas canónicas, inicialización determinista,
exportación/importación de tensores y coherencia con el paquete de paridad."""

from __future__ import annotations

import numpy as np
import torch

from entrenamiento import juego_tres_en_raya as juego
from entrenamiento.red import (
    RedPoliticaValor,
    cargar_tensores,
    contar_parametros,
    exportar_tensores,
    inicializar_determinista,
    softmax_enmascarado,
    tabla_formas,
)


def test_formas_canónicas_coinciden_con_la_especificación() -> None:
    formas = tabla_formas(3, 3, 9)
    assert formas["conv1.peso"] == (32, 2, 3, 3)
    assert formas["politica.fc.peso"] == (9, 36)
    assert formas["valor.fc1.peso"] == (16, 18)
    assert len(formas) == 14
    # 10.708 parámetros en 3×3 (docs/LBA-MODELO.md §4).
    assert contar_parametros(3, 3, 9) == 10708


def test_inicialización_determinista_reproducible() -> None:
    a = RedPoliticaValor(3, 3, 9)
    b = RedPoliticaValor(3, 3, 9)
    inicializar_determinista(a, 123)
    inicializar_determinista(b, 123)
    for (na, va), (nb, vb) in zip(a.state_dict().items(), b.state_dict().items()):
        assert torch.equal(va, vb), f"{na} difiere entre redes con la misma semilla"


def test_forward_produce_logits_y_valor_en_rango() -> None:
    red = RedPoliticaValor(3, 3, 9)
    inicializar_determinista(red, 7)
    red.eval()
    planos = torch.tensor(np.array([juego.observar(juego.estado_inicial())], dtype=np.float32))
    with torch.no_grad():
        logits, valor = red(planos)
    assert logits.shape == (1, 9)
    assert valor.shape == (1,)
    assert -1.0 <= float(valor[0]) <= 1.0  # tanh


def test_exportar_y_cargar_tensores_ida_y_vuelta() -> None:
    red = RedPoliticaValor(3, 3, 9)
    inicializar_determinista(red, 99)
    tensores = exportar_tensores(red)
    assert set(tensores.keys()) == set(tabla_formas(3, 3, 9).keys())

    otra = RedPoliticaValor(3, 3, 9)
    inicializar_determinista(otra, 5)  # pesos distintos
    cargar_tensores(otra, tensores)
    for va, vb in zip(red.state_dict().values(), otra.state_dict().values()):
        assert torch.equal(va, vb)


def test_cargar_tensores_rechaza_conjuntos_incoherentes() -> None:
    import pytest

    red = RedPoliticaValor(3, 3, 9)
    tensores = exportar_tensores(red)
    del tensores["conv1.sesgo"]
    with pytest.raises(ValueError):
        cargar_tensores(RedPoliticaValor(3, 3, 9), tensores)
    completos = exportar_tensores(red)
    completos["backdoor"] = torch.zeros(1)
    with pytest.raises(ValueError):
        cargar_tensores(RedPoliticaValor(3, 3, 9), completos)


def test_softmax_enmascarado_coincide_con_ts() -> None:
    # Caso con valor conocido: logits iguales → uniforme sobre legales.
    logits = [0.0] * 9
    prob = softmax_enmascarado(logits, [0, 4, 8])
    assert abs(prob[0] - 1 / 3) < 1e-9
    assert abs(prob[4] - 1 / 3) < 1e-9
    assert prob[1] == 0.0
    # Suma 1 exacta sobre los legales.
    assert abs(sum(prob) - 1.0) < 1e-9
