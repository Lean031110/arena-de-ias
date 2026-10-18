"""Autojuego con MCTS-PUCT guiado por la red (estilo AlphaZero, reducido).

Genera ejemplos de entrenamiento REALES: para cada posición visitada guarda
- planos de observación (2, 3, 3),
- distribución de visitas de MCTS como objetivo de política,
- resultado final z como objetivo de valor.

El ruido de Dirichlet en la raíz y la temperatura de muestreo son parte de
la configuración registrada: la generación de datos es reproducible con la
semilla anotada en el registro de entrenamiento.

Convención de signos (idéntica al agente TS ``agentes/neural.ts``):
- `valor_suma` de un nodo acumula valores desde la perspectiva del jugador
  CON TURNO en ese nodo;
- el Q de un hijo desde la perspectiva de quien elige es ``-media(hijo)``;
- la retropropagación alterna el signo en cada nivel.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from . import juego_tres_en_raya as juego
from .red import RedPoliticaValor, softmax_enmascarado


@dataclass
class Ejemplo:
    """Un ejemplo de entrenamiento (posiciones reales de partidas reales)."""

    planos: List[List[List[float]]]
    politica: List[float]
    valor: float
    jugadas_restantes: int


@dataclass
class _Nodo:
    """Nodo del árbol PUCT. `prior` es el de la ARISTA que llevó aquí."""

    prior: float
    acciones_legales: List[int]
    priores: List[float]
    terminal: Optional[int] = None
    visitas: int = 0
    valor_suma: float = 0.0
    hijos: Dict[int, "_Nodo"] = field(default_factory=dict)


class MCTS:
    """Búsqueda PUCT: Q + c·prior·√N/(1+n), valor de red en las hojas."""

    def __init__(self, red: RedPoliticaValor, simulaciones: int, c_puct: float = 1.5) -> None:
        self.red = red
        self.simulaciones = simulaciones
        self.c_puct = c_puct

    def _inferir(self, estado: List[int]) -> Tuple[float, List[float]]:
        planos = np.array([juego.observar(estado)], dtype=np.float32)
        with torch.no_grad():
            logits, valor = self.red(torch.from_numpy(planos))
        prob = softmax_enmascarado(logits[0].tolist(), juego.movimientos_legales(estado))
        return float(valor[0].item()), prob

    def _valor_terminal(self, estado: List[int]) -> float:
        """Valor exacto desde la perspectiva del jugador con turno."""
        res = juego.resultado(estado)
        if res is None:
            raise ValueError("estado no terminal")
        if res == 0:
            return 0.0
        return 1.0 if res == juego.jugador_actual(estado) else -1.0

    def buscar(
        self,
        estado: List[int],
        ruido: Optional[Tuple[float, float]] = None,
        rng: Optional[np.random.Generator] = None,
    ) -> Tuple[List[float], float]:
        """Devuelve (visitas por acción, valor medio de la raíz)."""
        legales = juego.movimientos_legales(estado)
        if not legales:
            raise ValueError("sin movimientos legales")
        terminal = juego.resultado(estado)
        if terminal is not None:
            raise ValueError("estado terminal")

        _, prior = self._inferir(estado)
        priores = [prior[a] for a in legales]

        if ruido is not None and rng is not None:
            alfa, epsilon = ruido
            if epsilon > 0 and len(legales) > 1:
                dirichlet = rng.dirichlet([alfa] * len(legales))
                priores = [(1 - epsilon) * p + epsilon * d for p, d in zip(priores, dirichlet)]

        raiz = _Nodo(prior=1.0, acciones_legales=list(legales), priores=priores, terminal=None)
        for _ in range(self.simulaciones):
            self._simular(estado, raiz)

        visitas = [raiz.hijos[a].visitas if a in raiz.hijos else 0 for a in range(juego.ACCIONES)]
        valor_raiz = raiz.valor_suma / raiz.visitas if raiz.visitas else 0.0
        return visitas, valor_raiz

    def _simular(self, estado: List[int], nodo: _Nodo) -> float:
        """Una simulación; devuelve el valor desde el jugador con turno en `nodo`."""
        if nodo.terminal is not None:
            return self._valor_terminal(estado)

        if nodo.acciones_legales:
            # Expansión del primer movimiento pendiente (orden determinista).
            accion = nodo.acciones_legales.pop(0)
            prior = nodo.priores.pop(0)
            hijo_estado = juego.aplicar(estado, accion)
            terminal_hijo = juego.resultado(hijo_estado)
            if terminal_hijo is None:
                valor_hijo, prior_hijo = self._inferir(hijo_estado)
                legales_hijo = juego.movimientos_legales(hijo_estado)
                hijo = _Nodo(
                    prior=prior,
                    acciones_legales=legales_hijo,
                    priores=[prior_hijo[a] for a in legales_hijo],
                    terminal=None,
                )
            else:
                valor_hijo = self._valor_terminal(hijo_estado)
                hijo = _Nodo(prior=prior, acciones_legales=[], priores=[], terminal=terminal_hijo)
            nodo.hijos[accion] = hijo
            hijo.visitas = 1
            hijo.valor_suma = valor_hijo
            nodo.visitas += 1
            nodo.valor_suma += -valor_hijo
            return -valor_hijo

        # Selección PUCT entre hijos existentes.
        total_visitas = max(1, nodo.visitas)
        mejor_accion: Optional[int] = None
        mejor_puntuacion = -math.inf
        for accion, hijo in nodo.hijos.items():
            q = -hijo.valor_suma / hijo.visitas if hijo.visitas else 0.0
            u = self.c_puct * hijo.prior * (math.sqrt(total_visitas) / (1 + hijo.visitas))
            puntuacion = q + u
            if puntuacion > mejor_puntuacion:
                mejor_puntuacion, mejor_accion = puntuacion, accion
        if mejor_accion is None:
            raise RuntimeError("nodo sin hijos ni movimientos pendientes")

        hijo = nodo.hijos[mejor_accion]
        hijo_estado = juego.aplicar(estado, mejor_accion)
        valor_hijo = self._simular(hijo_estado, hijo)
        nodo.visitas += 1
        nodo.valor_suma += -valor_hijo
        return -valor_hijo


def jugar_partida(
    red: RedPoliticaValor,
    mcts: MCTS,
    rng: np.random.Generator,
    temperatura_inicial: float = 1.0,
    jugadas_con_temperatura: int = 6,
    temperatura_final: float = 0.25,
    ruido: Tuple[float, float] = (0.03, 0.25),
) -> Tuple[List[Ejemplo], Optional[int], List[int]]:
    """Juega una partida completa; devuelve (ejemplos, resultado, acciones)."""
    estado = juego.estado_inicial()
    ejemplos: List[Ejemplo] = []
    acciones: List[int] = []

    jugada = 0
    while juego.resultado(estado) is None:
        temperatura = temperatura_inicial if jugada < jugadas_con_temperatura else temperatura_final
        visitas, _ = mcts.buscar(estado, ruido=ruido, rng=rng)
        legales = juego.movimientos_legales(estado)
        total_visitas = max(1, sum(visitas))

        # Muestreo por visitas^(1/T): diversidad al principio, firmeza al final.
        pesos = [math.pow(visitas[a] / total_visitas, 1.0 / max(temperatura, 1e-2)) for a in legales]
        total_pesos = sum(pesos)
        if total_pesos <= 0:
            eleccion = int(rng.choice(legales))
        else:
            acumulada = rng.random() * total_pesos
            eleccion = legales[-1]
            for a, p in zip(legales, pesos):
                acumulada -= p
                if acumulada <= 0:
                    eleccion = a
                    break

        politica = [v / total_visitas for v in visitas]
        ejemplos.append(
            Ejemplo(
                planos=juego.observar(estado),
                politica=politica,
                valor=0.0,  # se rellena con z al terminar la partida
                jugadas_restantes=juego.ACCIONES - len(acciones),
            )
        )
        acciones.append(eleccion)
        estado = juego.aplicar(estado, eleccion)
        jugada += 1

    resultado = juego.resultado(estado)
    for ejemplo in ejemplos:
        # ¿Qué jugador movió en esa posición? Canal 0 = fichas del turno:
        # si propias == rivales, movía X (1); si propias = rivales + 1, movía O (2).
        propias = sum(sum(fila) for fila in ejemplo.planos[0])
        rivales = sum(sum(fila) for fila in ejemplo.planos[1])
        jugador = 1 if propias == rivales else 2
        if resultado == 0:
            ejemplo.valor = 0.0
        elif resultado == jugador:
            ejemplo.valor = 1.0
        else:
            ejemplo.valor = -1.0

    return ejemplos, resultado, acciones
