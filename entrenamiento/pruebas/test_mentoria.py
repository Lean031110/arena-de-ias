"""Pruebas de la mentoría y destilación (Fase 3, Tarea D).

Cobertura exigida por la revisión:
- El veterano se carga de un .lba REAL con huella verificable.
- Los ejemplos provienen de partidas REALES del veterano.
- El alumno cambia sus pesos al entrenarse (y se registra).
- El registro conserva los datos de origen (veterano, semillas, recuentos).
- La evaluación es INDEPENDIENTE (semilla dedicada) y emparejada
  antes/después con totales que cuadran.
- La .lba candidata exportada es legible y su huella es la del paquete.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from entrenamiento import juego_tres_en_raya as juego
from entrenamiento import lba
from entrenamiento import mentoria as ment
from entrenamiento.red import RedPoliticaValor, exportar_tensores, inicializar_determinista


def _construir_veterano(destino: Path, semilla: int) -> Path:
    """Veterano de prueba: paquete .lba real (estructura completa, pesos aleatorios deterministas)."""
    torch.manual_seed(semilla)
    red = RedPoliticaValor(3, 3, juego.ACCIONES)
    inicializar_determinista(red, semilla)
    pesos_bytes = lba.escribir_safetensors(exportar_tensores(red))
    config = {
        "tipo": "autojuego-supervisado-v1",
        "semilla": semilla,
        "iteraciones": 1,
        "partidasPorIteracion": 2,
        "simulacionesMCTS": 8,
        "temperatura": 1.0,
        "dirichletAlfa": 0.03,
        "dirichletEpsilon": 0.25,
        "tamanoLote": 8,
        "tasaAprendizaje": 0.001,
        "pasosPorIteracion": 4,
        "bufferCapacidad": 64,
        "dispositivo": "cpu",
        "versionCodigo": "prueba",
    }
    linaje = {
        "formatVersion": 1,
        "agentId": "veterano-prueba",
        "brainVersion": "1.0.0",
        "parentModelId": None,
        "parentPackageSha256": None,
        "motivo": "entrenamiento-inicial",
        "notas": "veterano de prueba",
        "createdAt": "2026-10-19T00:00:00+00:00",
    }
    datos, _huella = lba.construir_paquete(
        {
            "formatVersion": 1,
            "agentId": "veterano-prueba",
            "brainVersion": "1.0.0",
            "parentModelId": None,
            "createdAt": "2026-10-19T00:00:00+00:00",
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
            "trainingRunId": "run-veterano-prueba",
            "trainingConfig": config,
            "datasetLineage": {
                "origen": "autojuego",
                "partidas": 2,
                "ejemplos": 10,
                "semilla": semilla,
                "rival": None,
                "buffer": "FIFO 64",
            },
            "evaluationRunIds": [],
            "evaluationSummary": None,
        },
        pesos_bytes,
        config,
        linaje,
        None,
    )
    destino.mkdir(parents=True, exist_ok=True)
    ruta = destino / "veterano-prueba@1.0.0.lba"
    ruta.write_bytes(datos)
    return ruta


def test_cargar_veterano_identidad_y_huella(tmp_path: Path) -> None:
    ruta = _construir_veterano(tmp_path, 7)
    red, identidad = ment.cargar_veterano(ruta, "cpu")
    assert identidad["agentId"] == "veterano-prueba"
    assert identidad["brainVersion"] == "1.0.0"
    assert identidad["huella"] == lba.sha256_hex(ruta.read_bytes())
    # La red cargada ejecuta inferencia sin errores.
    planos = torch.zeros(1, 2, 3, 3)
    logits, valor = red(planos)
    assert logits.shape == (1, juego.ACCIONES)
    assert float(valor.abs().item()) < 2.0


def test_generacion_de_ejemplos_del_veterano(tmp_path: Path) -> None:
    veterano, _ = ment.cargar_veterano(_construir_veterano(tmp_path, 11), "cpu")
    rng = np.random.default_rng(42)
    ejemplos, resultados = ment.generar_ejemplos_veterano(veterano, 8, 1.5, 3, rng)
    assert len(resultados) == 3
    assert len(ejemplos) >= 3  # cada partida produce varias posiciones
    for ejemplo in ejemplos:
        assert len(ejemplo.planos) == 2
        assert abs(sum(ejemplo.politica) - 1.0) < 1e-6  # distribución de visitas
        assert ejemplo.valor in (-1.0, 0.0, 1.0)


def test_entrenar_alumno_cambia_los_pesos(tmp_path: Path) -> None:
    veterano, _ = ment.cargar_veterano(_construir_veterano(tmp_path, 13), "cpu")
    rng = np.random.default_rng(13)
    ejemplos, _ = ment.generar_ejemplos_veterano(veterano, 8, 1.5, 4, rng)
    alumno = RedPoliticaValor(3, 3, juego.ACCIONES)
    inicializar_determinista(alumno, 99)
    antes = {k: v.clone() for k, v in alumno.state_dict().items()}
    perdidas = ment.entrenar_alumno(alumno, ejemplos, 16, 8, 0.01, np.random.default_rng(5), "cpu")
    assert len(perdidas) == 16
    assert any(not torch.equal(antes[k], alumno.state_dict()[k]) for k in antes)


def test_flujo_completo_mente_con_evaluacion_independiente(tmp_path: Path) -> None:
    ruta_veterano = _construir_veterano(tmp_path / "v", 17)
    salida = tmp_path / "salida"
    codigo = ment.main(
        [
            "--veterano", str(ruta_veterano),
            "--semilla", "2026",
            "--partidas", "3",
            "--simulaciones", "8",
            "--pasos", "12",
            "--lote", "8",
            "--lr", "0.01",
            "--eval-partidas", "4",
            "--agent-id", "alumno-prueba",
            "--version", "1.0.0",
            "--salida", str(salida),
            "--run-id", "mentoria-prueba",
        ]
    )
    assert codigo == 0

    registro = json.loads((salida / "mentoria-prueba-registro.json").read_text(encoding="utf-8"))
    # Datos de origen conservados.
    assert registro["tipo"] == "mentoria-destilacion-v1"
    assert registro["origen"]["veterano"]["huella"] == lba.sha256_hex(ruta_veterano.read_bytes())
    assert registro["origen"]["alumnoInit"] == "aleatorio-determinista"
    assert registro["origen"]["semillaEvaluacionIndependiente"] == 2026 + ment.SEMILLA_EVAL_INDEPENDIENTE_OFFSET
    assert registro["datosGenerados"]["partidas"] == 3
    assert registro["datosGenerados"]["ejemplos"] > 0
    assert registro["entrenamientoAlumno"]["pesosCambiaron"] is True

    # Evaluación emparejada antes/después con totales que cuadran.
    for momento in ("antes", "despues"):
        for rival in ("contraAleatorio", "contraVeterano"):
            bloque = registro["evaluacionIndependiente"][momento][rival]
            assert bloque["victorias"] + bloque["empates"] + bloque["derrotas"] == bloque["partidas"] == 4
    # La semilla de evaluación es distinta de la de entrenamiento.
    assert registro["origen"]["semillaEvaluacionIndependiente"] != registro["config"]["semilla"]

    # La .lba candidata existe, es legible y su huella cuadra.
    ruta_lba = salida / "alumno-prueba@1.0.0.lba"
    assert ruta_lba.exists()
    datos = ruta_lba.read_bytes()
    archivos = lba.leer_paquete(datos)
    manifiesto = json.loads(archivos["manifest.json"].decode("utf-8"))
    assert manifiesto["agentId"] == "alumno-prueba"
    assert manifiesto["parentModelId"] == "veterano-prueba@1.0.0"
    assert manifiesto["datasetLineage"]["origen"] == "partidas-importadas"
    assert manifiesto["datasetLineage"]["rival"] == "veterano:veterano-prueba@1.0.0"
    assert registro["paquete"]["sha256"] == lba.sha256_hex(datos)


def test_los_pesos_del_veterano_no_cambian(tmp_path: Path) -> None:
    """El veterano es de solo lectura: la mentoría no lo modifica."""
    ruta = _construir_veterano(tmp_path, 23)
    veterano, _ = ment.cargar_veterano(ruta, "cpu")
    antes = {k: v.clone() for k, v in veterano.state_dict().items()}
    rng = np.random.default_rng(23)
    ejemplos, _ = ment.generar_ejemplos_veterano(veterano, 8, 1.5, 2, rng)
    alumno = RedPoliticaValor(3, 3, juego.ACCIONES)
    inicializar_determinista(alumno, 5)
    ment.entrenar_alumno(alumno, ejemplos, 8, 8, 0.01, np.random.default_rng(2), "cpu")
    assert all(torch.equal(antes[k], veterano.state_dict()[k]) for k in antes)
