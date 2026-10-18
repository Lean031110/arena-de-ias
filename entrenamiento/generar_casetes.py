"""Genera los casetes de paridad TS ⇄ PyTorch (docs/LBA-MODELO.md §9).

Produce (versionados en Git, decenas de KB):
- ``src/dominio/lba/casetes/paridad-red.lba``: paquete .lba con pesos
  aleatorios CON SEMILLA (artefacto de prueba del formato y del runtime,
  nunca un modelo entrenado).
- ``src/dominio/lba/casetes/paridad-red.json``: entradas y salidas
  calculadas por PyTorch para ese paquete.
- ``entrenamiento/pruebas/casetes/juegos-python.json``: partidas jugadas por
  MCTS con la red sembrada en Python, para que TypeScript las reproduzca
  con resultado idéntico (paridad del motor).

Uso:
    python -m entrenamiento.generar_casetes
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch

from . import juego_tres_en_raya as juego
from . import lba
from .autojuego import MCTS, jugar_partida
from .red import RedPoliticaValor, exportar_tensores, inicializar_determinista

SEMILLA = 20261019

RAIZ = Path(__file__).resolve().parent.parent
DESTINO_LBA = RAIZ / "src/dominio/lba/casetes/paridad-red.lba"
DESTINO_JSON = RAIZ / "src/dominio/lba/casetes/paridad-red.json"
DESTINO_JUEGOS = RAIZ / "entrenamiento/pruebas/casetes/juegos-python.json"


def main() -> int:
    torch.manual_seed(SEMILLA)
    rng = np.random.default_rng(SEMILLA)

    red = RedPoliticaValor(3, 3, juego.ACCIONES)
    inicializar_determinista(red, SEMILLA)
    red.eval()

    # ------- Casete de paridad de red: entradas y salidas PyTorch -------
    estados: List[List[int]] = [juego.estado_inicial()]
    estados.append(juego.aplicar(juego.estado_inicial(), 4))
    estados.append(juego.aplicar(estados[-1], 0))
    estados.append(juego.aplicar(estados[-1], 8))
    estados.append(juego.aplicar(estados[-1], 2))
    # Estados aleatorios alcanzables con semilla.
    for _ in range(6):
        estado = juego.estado_inicial()
        while juego.resultado(estado) is None:
            legales = juego.movimientos_legales(estado)
            estado = juego.aplicar(estado, int(rng.choice(legales)))
            if int(rng.integers(0, 2)) == 0:
                break
        estados.append(estado)

    planos = np.array([juego.observar(e) for e in estados], dtype=np.float32)
    with torch.no_grad():
        logits, valores = red(torch.from_numpy(planos))

    casete = {
        "descripcion": (
            "Casete de paridad PyTorch→TypeScript: entradas (planos [2,3,3]) y "
            "salidas (logits de política y valor tanh) calculadas por PyTorch con "
            f"semilla {SEMILLA}. La prueba TS carga paridad-red.lba y debe "
            "reproducir estas salidas con tolerancia 1e-4."
        ),
        "semilla": SEMILLA,
        "arquitectura": {
            "tipo": "conv-politica-valor-v1",
            "entrada": {"alto": 3, "ancho": 3, "canales": 2},
            "acciones": juego.ACCIONES,
        },
        "entradas": [juego.observar(e) for e in estados],
        "estadosCeldas": [list(e) for e in estados],
        "politicaEsperada": [[float(v) for v in fila] for fila in logits.tolist()],
        "valorEsperado": [float(v) for v in valores.tolist()],
    }

    # ------- Paquete .lba de prueba con los mismos pesos -------
    pesos_bytes = lba.escribir_safetensors(exportar_tensores(red))
    config_entrenamiento = {
        "tipo": "autojuego-supervisado-v1",
        "semilla": SEMILLA,
        "iteraciones": 0,
        "partidasPorIteracion": 1,
        "simulacionesMCTS": 32,
        "temperatura": 1.0,
        "dirichletAlfa": 0.03,
        "dirichletEpsilon": 0.25,
        "tamanoLote": 8,
        "tasaAprendizaje": 0.001,
        "pasosPorIteracion": 1,
        "bufferCapacidad": 1000,
        "dispositivo": "cpu",
        "versionCodigo": "casete-paridad",
    }
    linaje = {
        "formatVersion": 1,
        "agentId": "red-casete",
        "brainVersion": "0.0.1",
        "parentModelId": None,
        "parentPackageSha256": None,
        "motivo": "entrenamiento-inicial",
        "notas": "paquete de PRUEBA de paridad: pesos aleatorios con semilla, no entrenado",
        "createdAt": "2026-10-19T00:00:00.000Z",
    }
    manifiesto = {
        "formatVersion": 1,
        "agentId": "red-casete",
        "brainVersion": "0.0.1",
        "parentModelId": None,
        "createdAt": "2026-10-19T00:00:00.000Z",
        "gameId": "tres-en-raya-3",
        "gameRulesVersion": "1",
        "gameRulesHash": lba.hash_reglas_juego(lba.DESCRIPTOR_TRES_EN_RAYA_3),
        "observationSchemaVersion": 1,
        "actionSpaceVersion": 1,
        "architecture": {
            "tipo": "conv-politica-valor-v1",
            "entrada": {"alto": 3, "ancho": 3, "canales": 2},
            "acciones": juego.ACCIONES,
        },
        "weightsFormat": "safetensors",
        "runtimeTargets": ["ts-puro"],
        "trainingRunId": "casete-paridad",
        "trainingConfig": config_entrenamiento,
        "datasetLineage": {
            "origen": "autojuego",
            "partidas": 0,
            "ejemplos": 0,
            "semilla": SEMILLA,
            "rival": None,
            "buffer": "n/a (casete de prueba)",
        },
        "evaluationRunIds": [],
        "evaluationSummary": None,
    }
    datos, huella = lba.construir_paquete(manifiesto, pesos_bytes, config_entrenamiento, linaje, None)
    casete["huellaPaquete"] = huella

    # ------- Juegos cruzados Python → TS -------
    mcts = MCTS(red, simulaciones=40, c_puct=1.5)
    rng_juegos = np.random.default_rng(SEMILLA + 1)
    juegos_cruzados = []
    for indice in range(12):
        ejemplos, resultado, acciones = jugar_partida(
            red, mcts, rng_juegos,
            temperatura_inicial=1.0, jugadas_con_temperatura=9, temperatura_final=0.5,
        )
        juegos_cruzados.append(
            {
                "indice": indice,
                "semilla": int(SEMILLA + 1),
                "acciones": [int(a) for a in acciones],
                "notacion": juego.notacion(acciones),
                "resultado": resultado,
                "jugadas": len(acciones),
            }
        )

    DESTINO_LBA.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_LBA.write_bytes(datos)
    DESTINO_JSON.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_JSON.write_text(json.dumps(casete, indent=2) + "\n", encoding="utf-8")
    DESTINO_JUEGOS.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_JUEGOS.write_text(
        json.dumps(
            {
                "descripcion": "Partidas jugadas por MCTS+red en Python (semilla fija); "
                "TypeScript debe reproducirlas con el mismo resultado (paridad del motor).",
                "semilla": SEMILLA + 1,
                "simulaciones": 40,
                "juegos": juegos_cruzados,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"casete .lba   : {DESTINO_LBA} ({len(datos)} bytes)")
    print(f"casete json   : {DESTINO_JSON}")
    print(f"juegos python : {DESTINO_JUEGOS} ({len(juegos_cruzados)} partidas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
