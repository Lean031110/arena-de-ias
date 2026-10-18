"""Pruebas del paquete .lba en Python: construcción válida, huella FNV-1a
idéntica a la de TS, lectura con validación y rechazos (corrupto, traversal,
bomba, checksums falsos). El validador canónico es el TS; estas pruebas
garantizan que los paquetes Python lo superan y que la lectura Python es
igualmente estricta."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest
import torch

from entrenamiento import lba
from entrenamiento.red import RedPoliticaValor, exportar_tensores, inicializar_determinista

CASETE = Path(__file__).parents[2] / "src/dominio/lba/casetes/paridad-red.lba"


def _paquete_minimal(ruta_extra: str | None = None, contenido_extra: bytes | None = None):
    red = RedPoliticaValor(3, 3, 9)
    inicializar_determinista(red, 55)
    pesos = lba.escribir_safetensors(exportar_tensores(red))
    config = {
        "tipo": "autojuego-supervisado-v1",
        "semilla": 1,
        "iteraciones": 1,
        "partidasPorIteracion": 2,
        "simulacionesMCTS": 8,
        "temperatura": 1.0,
        "dirichletAlfa": 0.03,
        "dirichletEpsilon": 0.25,
        "tamanoLote": 4,
        "tasaAprendizaje": 0.001,
        "pasosPorIteracion": 2,
        "bufferCapacidad": 100,
        "dispositivo": "cpu",
        "versionCodigo": "prueba",
    }
    linaje = {
        "formatVersion": 1,
        "agentId": "red-prueba-lba",
        "brainVersion": "1.0.0",
        "parentModelId": None,
        "parentPackageSha256": None,
        "motivo": "entrenamiento-inicial",
        "notas": "prueba",
        "createdAt": "2026-10-19T00:00:00.000Z",
    }
    manifiesto = {
        "formatVersion": 1,
        "agentId": "red-prueba-lba",
        "brainVersion": "1.0.0",
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
            "acciones": 9,
        },
        "weightsFormat": "safetensors",
        "runtimeTargets": ["ts-puro"],
        "trainingRunId": "prueba",
        "trainingConfig": config,
        "datasetLineage": {
            "origen": "autojuego",
            "partidas": 2,
            "ejemplos": 10,
            "semilla": 1,
            "rival": None,
            "buffer": "FIFO 100",
        },
        "evaluationRunIds": [],
        "evaluationSummary": None,
    }
    datos, huella = lba.construir_paquete(manifiesto, pesos, config, linaje, None)
    if ruta_extra is not None:
        # Añadir la entrada extra DESPUÉS de construir (checksums desincronizados
        # o coherentes según el test).
        buffer = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(datos)) as origen, zipfile.ZipFile(
            buffer, "w", compression=zipfile.ZIP_DEFLATED
        ) as destino:
            for nombre in origen.namelist():
                destino.writestr(nombre, origen.read(nombre))
            destino.writestr(ruta_extra, contenido_extra or b"x")
        datos = buffer.getvalue()
        import hashlib

        huella = hashlib.sha256(datos).hexdigest()
    return datos, huella


def test_huella_fnv1a_coincide_con_ts() -> None:
    # Valores calculados con el módulo TS real (npx tsx → huellaFNV):
    # huellaFNV('hola') = 'b2c65197', huellaFNV('') = '811c9dc5'.
    assert lba.fnv1a_texto("hola") == "b2c65197"
    assert lba.fnv1a_texto("") == "811c9dc5"
    # JSON canónico: claves ordenadas sin espacios (igual que establecerJSON).
    assert lba.json_canonico({"b": 1, "a": 2}) == '{"a":2,"b":1}'


def test_hash_reglas_tres_en_raya_estable() -> None:
    # Debe coincidir con huellaJSON del descriptor TS (prueba cruzada en
    # paridad.test.ts comprueba el valor contra el catálogo real).
    h1 = lba.hash_reglas_juego(lba.DESCRIPTOR_TRES_EN_RAYA_3)
    h2 = lba.hash_reglas_juego(lba.DESCRIPTOR_TRES_EN_RAYA_3)
    assert h1 == h2 and len(h1) == 8


def test_paquete_válido_se_leo_y_los_pesos_cargan() -> None:
    datos, _ = _paquete_minimal()
    archivos = lba.leer_paquete(datos)
    assert set(archivos.keys()) == {
        "manifest.json",
        "training/weights.safetensors",
        "training/config.json",
        "training/lineage.json",
        "integrity/checksums.sha256",
    }
    manifiesto = json.loads(archivos["manifest.json"].decode("utf-8"))
    assert manifiesto["formatVersion"] == 1
    tensores = lba.leer_safetensors(archivos["training/weights.safetensors"])
    red = RedPoliticaValor(3, 3, 9)
    from entrenamiento.red import cargar_tensores

    cargar_tensores(red, tensores)


def test_paquete_corrupto_rechazado() -> None:
    datos, _ = _paquete_minimal()
    datos = bytearray(datos)
    datos[len(datos) // 2] ^= 0xFF  # corromper el ZIP
    with pytest.raises(lba.ErrorPaquete):
        lba.leer_paquete(bytes(datos))


def test_checksum_falso_rechazado() -> None:
    datos, _ = _paquete_minimal()
    with zipfile.ZipFile(io.BytesIO(datos)) as origen:
        archivos = {n: origen.read(n) for n in origen.namelist()}
    archivos["integrity/checksums.sha256"] = ("0" * 64 + "  manifest.json\n").encode("utf-8")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as destino:
        for nombre, contenido in sorted(archivos.items()):
            destino.writestr(nombre, contenido)
    with pytest.raises(lba.ErrorPaquete):
        lba.leer_paquete(buffer.getvalue())


def test_entrada_fuera_de_lista_blanca_rechazada() -> None:
    datos, _ = _paquete_minimal(ruta_extra="instalador.exe")
    with pytest.raises(lba.ErrorPaquete):
        lba.leer_paquete(datos)


def test_path_traversal_rechazado() -> None:
    datos, _ = _paquete_minimal(ruta_extra="../fuera.txt")
    with pytest.raises(lba.ErrorPaquete):
        lba.leer_paquete(datos)


def test_bomba_de_descompresión_rechazada() -> None:
    """8 MB de ceros comprimen a ~8 KB: el límite de entrada individual corta."""
    gigante = b"\x00" * (8 * 1024 * 1024)
    datos, _ = _paquete_minimal(ruta_extra="docs/FORMATO.md", contenido_extra=gigante)
    with pytest.raises(lba.ErrorPaquete):
        lba.leer_paquete(datos)


def test_casete_de_paridad_versionado_es_válido() -> None:
    """El casete paridad-red.lba (generado y versionado) pasa la lectura."""
    assert CASETE.exists(), "falta src/dominio/lba/casetes/paridad-red.lba"
    archivos = lba.leer_paquete(CASETE.read_bytes())
    manifiesto = json.loads(archivos["manifest.json"].decode("utf-8"))
    assert manifiesto["agentId"] == "red-casete"
    tensores = lba.leer_safetensors(archivos["training/weights.safetensors"])
    assert len(tensores) == 14
    assert all(isinstance(t, torch.Tensor) for t in tensores.values())
