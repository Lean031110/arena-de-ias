"""Red de política y valor «conv-politica-valor-v1» — gemela exacta de
``src/dominio/neural/red.ts`` (ADR-014, docs/LBA-MODELO.md §4).

Arquitectura (idéntica en ambos runtimes):
    entrada [N, 2, alto, ancho]
    conv1: Conv2d(2→32, 3×3, padding 1) + ReLU
    conv2: Conv2d(32→32, 3×3, padding 1) + ReLU
    política: Conv2d(32→4, 1×1) + ReLU → aplanar → Linear(4·A·W → acciones)
    valor:    Conv2d(32→2, 1×1) + ReLU → aplanar → Linear(2·A·W → 16) + ReLU
              → Linear(16 → 1) + tanh

Nombres canónicos de exportación (SafeTensors):
    conv1.peso / conv1.sesgo / conv2.peso / conv2.sesgo
    politica.conv.peso / politica.conv.sesgo / politica.fc.peso / politica.fc.sesgo
    valor.conv.peso / valor.conv.sesgo / valor.fc1.peso / valor.fc1.sesgo
    valor.fc2.peso / valor.fc2.sesgo

La paridad TS ⇄ PyTorch se comprueba con el casete generado por
``generar_casete_paridad.py`` y la prueba ``src/dominio/lba/paridad.test.ts``.
"""

from __future__ import annotations

import math
from typing import Dict, Mapping, Sequence, Tuple

import torch
from torch import nn

# Correspondencia nombre canónico ⇄ parámetro del módulo PyTorch.
MAPA_TENSORES: Tuple[Tuple[str, str, str], ...] = (
    ("conv1.peso", "conv1", "weight"),
    ("conv1.sesgo", "conv1", "bias"),
    ("conv2.peso", "conv2", "weight"),
    ("conv2.sesgo", "conv2", "bias"),
    ("politica.conv.peso", "cabecera_politica", "weight"),
    ("politica.conv.sesgo", "cabecera_politica", "bias"),
    ("politica.fc.peso", "fc_politica", "weight"),
    ("politica.fc.sesgo", "fc_politica", "bias"),
    ("valor.conv.peso", "cabecera_valor", "weight"),
    ("valor.conv.sesgo", "cabecera_valor", "bias"),
    ("valor.fc1.peso", "fc_valor1", "weight"),
    ("valor.fc1.sesgo", "fc_valor1", "bias"),
    ("valor.fc2.peso", "fc_valor2", "weight"),
    ("valor.fc2.sesgo", "fc_valor2", "bias"),
)


class RedPoliticaValor(nn.Module):
    """Red convolucional pequeña de política y valor (juegos de rejilla)."""

    def __init__(self, alto: int = 3, ancho: int = 3, acciones: int = 9) -> None:
        super().__init__()
        self.alto = alto
        self.ancho = ancho
        self.acciones = acciones
        self.conv1 = nn.Conv2d(2, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 32, kernel_size=3, padding=1)
        self.cabecera_politica = nn.Conv2d(32, 4, kernel_size=1)
        self.fc_politica = nn.Linear(4 * alto * ancho, acciones)
        self.cabecera_valor = nn.Conv2d(32, 2, kernel_size=1)
        self.fc_valor1 = nn.Linear(2 * alto * ancho, 16)
        self.fc_valor2 = nn.Linear(16, 1)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """x: [N, 2, alto, ancho] → (logits [N, acciones], valor tanh [N])."""
        h = torch.relu(self.conv1(x))
        h = torch.relu(self.conv2(h))
        pol = torch.relu(self.cabecera_politica(h)).flatten(1)
        logits = self.fc_politica(pol)
        val = torch.relu(self.cabecera_valor(h)).flatten(1)
        val = torch.relu(self.fc_valor1(val))
        valor = torch.tanh(self.fc_valor2(val)).squeeze(1)
        return logits, valor


def tabla_formas(alto: int, ancho: int, acciones: int) -> Dict[str, Tuple[int, ...]]:
    """Tabla de formas canónicas (idéntica a ``tablaArquitectura`` en TS)."""
    return {
        "conv1.peso": (32, 2, 3, 3),
        "conv1.sesgo": (32,),
        "conv2.peso": (32, 32, 3, 3),
        "conv2.sesgo": (32,),
        "politica.conv.peso": (4, 32, 1, 1),
        "politica.conv.sesgo": (4,),
        "politica.fc.peso": (acciones, 4 * alto * ancho),
        "politica.fc.sesgo": (acciones,),
        "valor.conv.peso": (2, 32, 1, 1),
        "valor.conv.sesgo": (2,),
        "valor.fc1.peso": (16, 2 * alto * ancho),
        "valor.fc1.sesgo": (16,),
        "valor.fc2.peso": (1, 16),
        "valor.fc2.sesgo": (1,),
    }


def contar_parametros(alto: int, ancho: int, acciones: int) -> int:
    total = 0
    for forma in tabla_formas(alto, ancho, acciones).values():
        n = 1
        for d in forma:
            n *= d
        total += n
    return total


def inicializar_determinista(red: RedPoliticaValor, semilla: int) -> None:
    """Rellena los pesos con valores deterministas (numpy PCG64 con semilla).

    Incluye sesgos (uniforme pequeño) igual que los pesos: así el casete de
    paridad y los entrenamientos son reproducibles bit a bit por versión de
    numpy/torch fijada en requirements-entrenamiento.txt.
    """
    import numpy as np

    rng = np.random.default_rng(semilla)
    with torch.no_grad():
        for parametro in red.parameters():
            valores = rng.uniform(-0.05, 0.05, size=parametro.numel()).astype(np.float32)
            parametro.copy_(torch.from_numpy(valores).view_as(parametro))


def exportar_tensores(red: RedPoliticaValor) -> Dict[str, torch.Tensor]:
    """Devuelve el state_dict con nombres canónicos (para safetensors)."""
    estado = dict(red.state_dict())
    salida: Dict[str, torch.Tensor] = {}
    for canonico, modulo, campo in MAPA_TENSORES:
        clave = f"{modulo}.{campo}"
        if clave not in estado:
            raise KeyError(f"falta {clave} en el state_dict")
        salida[canonico] = estado[clave].detach().cpu().contiguous()
    return salida


def cargar_tensores(red: RedPoliticaValor, tensores: Mapping[str, torch.Tensor]) -> None:
    """Carga pesos canónicos en el módulo (con verificación de formas)."""
    formas = tabla_formas(red.alto, red.ancho, red.acciones)
    if set(tensores.keys()) != set(formas.keys()):
        faltan = set(formas) - set(tensores)
        sobran = set(tensores) - set(formas)
        raise ValueError(f"tensores incoherentes: faltan {sorted(faltan)}, sobran {sorted(sobran)}")
    estado: Dict[str, torch.Tensor] = {}
    for canonico, modulo, campo in MAPA_TENSORES:
        tensor = tensores[canonico]
        if tuple(tensor.shape) != formas[canonico]:
            raise ValueError(
                f"tensor {canonico}: forma {tuple(tensor.shape)} ≠ esperada {formas[canonico]}"
            )
        estado[f"{modulo}.{campo}"] = tensor
    red.load_state_dict(estado)


def softmax_enmascarado(logits: Sequence[float], legales: Sequence[int], temperatura: float = 1.0) -> list[float]:
    """Softmax solo sobre acciones legales (igual que ``softmaxEnmascarado`` TS)."""
    if not legales:
        return [0.0] * len(logits)
    escalados = [logits[a] / temperatura for a in legales]
    maximo = max(escalados)
    exps = [math.exp(v - maximo) for v in escalados]
    total = sum(exps)
    salida = [0.0] * len(logits)
    for a, e in zip(legales, exps):
        salida[a] = e / total
    return salida
