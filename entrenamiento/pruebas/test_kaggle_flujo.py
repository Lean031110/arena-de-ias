"""Pruebas del flujo GitHub Actions → Kaggle → .lba (``entrenamiento.kaggle.flujo``).

Cubren los cuatro puntos exigidos por la revisión de la Tarea 2:
1. Conversión de booleanos desde variables de entorno (validada y estricta).
2. Análisis robusto del estado del kernel (formatos real 2.2.4 y 1.x,
   normalización de mayúsculas/comillas/mensajes de fallo; desconocido ≠ éxito).
3. Generación de metadatos del kernel (campos correctos del CLI 2.x).
4. Errores de recuperación: sin .lba, registro de otra ejecución, huella que
   no coincide, .lba manipulado, múltiples .lba (se elige por huella).
Además: validación de parámetros y el bucle de sondeo (con CLI simulada).
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List

import pytest

from entrenamiento.kaggle import flujo


# ---------------------------------------------------------------------------
# 1. Booleanos desde el entorno
# ---------------------------------------------------------------------------


def test_booleano_true_varias_formas(monkeypatch: pytest.MonkeyPatch) -> None:
    for valor in ("true", "TRUE", "True", "  true  "):
        monkeypatch.setenv("USAR_GPU", valor)
        assert flujo.bool_desde_env("USAR_GPU") is True


def test_booleano_false_varias_formas(monkeypatch: pytest.MonkeyPatch) -> None:
    for valor in ("false", "FALSE", "False", "  false\n"):
        monkeypatch.setenv("USAR_GPU", valor)
        assert flujo.bool_desde_env("USAR_GPU") is False


def test_booleano_rechaza_valores_ambiguos(monkeypatch: pytest.MonkeyPatch) -> None:
    """GitHub nunca debe interpolarse como Python directo: '1', 'yes', '' son
    errores de configuración, no falsedades silenciosas."""
    for valor in ("1", "0", "yes", "no", "", " verdadero ", "on", "off", "None"):
        monkeypatch.setenv("USAR_GPU", valor)
        with pytest.raises(ValueError):
            flujo.bool_desde_env("USAR_GPU")


def test_booleano_falta_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("USAR_GPU", raising=False)
    with pytest.raises(ValueError, match="falta la variable"):
        flujo.bool_desde_env("USAR_GPU")


# ---------------------------------------------------------------------------
# 2. Análisis del estado del kernel
# ---------------------------------------------------------------------------

SALIDA_2X_EN_EJECUCION = 'usuario/slug has status "KernelWorkerStatus.RUNNING"\n'
SALIDA_2X_COMPLETADO = 'usuario/slug has status "KernelWorkerStatus.COMPLETE"\n'
SALIDA_2X_ERROR = (
    'usuario/slug has status "KernelWorkerStatus.ERROR"\n'
    'Failure message: "Exceeded memory limit"\n'
)
SALIDA_2X_CANCELADO = 'usuario/slug has status "KernelWorkerStatus.CANCEL_ACKNOWLEDGED"\n'
SALIDA_1X_COMPLETADO = 'usuario/slug has status "complete"\n'
SALIDA_1X_ERROR = 'usuario/slug has status "error"\n'


@pytest.mark.parametrize(
    "salida,esperado",
    [
        (SALIDA_2X_EN_EJECUCION, "pendiente"),
        (SALIDA_2X_COMPLETADO, "exito"),
        (SALIDA_2X_ERROR, "error"),
        (SALIDA_2X_CANCELADO, "error"),
        (SALIDA_1X_COMPLETADO, "exito"),
        (SALIDA_1X_ERROR, "error"),
        # mayúsculas/minúsculas y comillas irregulares
        ('USUARIO/SLUG HAS STATUS "KernelWorkerStatus.complete"', "exito"),
        ("usuario/slug has status complete", "exito"),
        ('usuario/slug has status "QUEUED"', "pendiente"),
        ('usuario/slug has status "KernelWorkerStatus.CANCEL_REQUESTED"', "pendiente"),
        ('usuario/slug has status "KernelWorkerStatus.NEW_SCRIPT"', "pendiente"),
        # token suela con tolerancia
        ("running", "pendiente"),
        ("complete", "exito"),
    ],
)
def test_interpretar_estado_formatos_conocidos(salida: str, esperado: str) -> None:
    assert flujo.interpretar_estado_salida(salida) == esperado


@pytest.mark.parametrize(
    "salida",
    [
        "",
        "   \n",
        "algo totalmente distinto sin estados",
        'usuario/slug has status "SUCCESS"',  # estado inventado: NUNCA éxito
        'usuario/slug has status "KernelWorkerStatus.FINISHED"',
        "Exception: connection refused",
    ],
)
def test_estado_desconocido_nunca_es_exito(salida: str) -> None:
    """Un estado desconocido lanza; jamás se clasifica como éxito (tampoco
    como espera infinita: el workflow falla rápido)."""
    with pytest.raises(flujo.EstadoDesconocidoError):
        flujo.interpretar_estado_salida(salida)


def test_el_estado_prevalece_sobre_el_mensaje_de_fallo() -> None:
    """La línea 'Failure message: …' no debe confundir al analizador: el
    estado es la PRIMERA coincidencia, no la última palabra del texto."""
    salida = (
        'usuario/slug has status "KernelWorkerStatus.ERROR"\n'
        'Failure message: "the kernel was running and then it was complete nonsense"\n'
    )
    assert flujo.interpretar_estado_salida(salida) == "error"


# ---------------------------------------------------------------------------
# 3. Metadatos del kernel
# ---------------------------------------------------------------------------


def test_metadata_campos_correctos_del_cli_2x() -> None:
    metadata = flujo.generar_metadata("usuario", "mi-slug", "titulo-valido", True)
    # Campo correcto del CLI 2.2.4 (el obsoleto kernel_datasets se eliminó).
    assert "dataset_sources" in metadata
    assert "kernel_datasets" not in metadata
    assert metadata["dataset_sources"] == []
    assert metadata["enable_gpu"] is True
    assert metadata["language"] == "python"
    assert metadata["kernel_type"] == "script"
    assert metadata["is_private"] is True
    assert metadata["id"] == "usuario/mi-slug"


def test_metadata_gpu_solo_con_booleano_real() -> None:
    assert flujo.generar_metadata("u", "s", "titulo", False)["enable_gpu"] is False
    with pytest.raises(TypeError):
        flujo.generar_metadata("u", "s", "titulo", "true")  # type: ignore[arg-type]


def test_metadata_titulo_corto_rechazado() -> None:
    with pytest.raises(ValueError, match="al menos 5"):
        flujo.generar_metadata("u", "s", "abc", False)


# ---------------------------------------------------------------------------
# Validación de parámetros
# ---------------------------------------------------------------------------


def test_parametros_enteros_validos() -> None:
    valores = flujo.validar_parametros_enteros(
        {"semilla": "20261019", "iteraciones": 5, "partidas": "32",
         "simulaciones": "96", "pasos": 48, "evalPartidas": "40"}
    )
    assert valores == {
        "semilla": 20261019, "iteraciones": 5, "partidas": 32,
        "simulaciones": 96, "pasos": 48, "evalPartidas": 40,
    }


@pytest.mark.parametrize(
    "parametros, fragmento",
    [
        ({"semilla": "abc", "iteraciones": "1", "partidas": "1", "simulaciones": "1",
          "pasos": "1", "evalPartidas": "0"}, "no es un entero"),
        ({"iteraciones": "1", "partidas": "1", "simulaciones": "1",
          "pasos": "1", "evalPartidas": "0"}, "falta el parámetro semilla"),
        ({"semilla": "0", "iteraciones": "1", "partidas": "1", "simulaciones": "1",
          "pasos": "1", "evalPartidas": "0"}, "fuera del rango"),
        ({"semilla": "-5", "iteraciones": "1", "partidas": "1", "simulaciones": "1",
          "pasos": "1", "evalPartidas": "0"}, "fuera del rango"),
    ],
)
def test_parametros_invalidos_rechazados(parametros: Dict[str, Any], fragmento: str) -> None:
    with pytest.raises(flujo.ParametroInvalidoError, match=fragmento):
        flujo.validar_parametros_enteros(parametros)


# ---------------------------------------------------------------------------
# 4. Errores de recuperación
# ---------------------------------------------------------------------------


def _escribir_salida(directorio: Path, lba: bytes | None, registro: Dict[str, Any] | None,
                     nombre_lba: str = "red-ter-3@1.0.0.lba",
                     nombre_registro: str = "20261019-ter3-001-registro.json") -> Path:
    directorio.mkdir(parents=True, exist_ok=True)
    if lba is not None:
        (directorio / nombre_lba).write_bytes(lba)
    if registro is not None:
        (directorio / nombre_registro).write_text(
            json.dumps(registro, ensure_ascii=False), encoding="utf-8"
        )
    return directorio


def _registro(run_id: str, sha256: str) -> Dict[str, Any]:
    return {"runId": run_id, "paquete": {"sha256": sha256, "bytes": 10}}


def test_recuperacion_correcta(tmp_path: Path) -> None:
    contenido = b"paquete-lba-de-prueba"
    huella = hashlib.sha256(contenido).hexdigest()
    directorio = _escribir_salida(tmp_path, contenido, _registro("111-1", huella))
    resultado = flujo.verificar_recuperacion(directorio, "111-1")
    assert resultado["sha256"] == huella
    assert Path(resultado["lba"]).name == "red-ter-3@1.0.0.lba"
    assert Path(resultado["registro"]).exists()


def test_recuperacion_sin_lba_falla(tmp_path: Path) -> None:
    directorio = _escribir_salida(tmp_path, None, _registro("111-1", "x" * 64))
    with pytest.raises(flujo.FalloRecuperacionError, match="NO produjo ningún \\.lba"):
        flujo.verificar_recuperacion(directorio, "111-1")


def test_recuperacion_sin_registro_falla(tmp_path: Path) -> None:
    directorio = _escribir_salida(tmp_path, b"contenido", None)
    with pytest.raises(flujo.FalloRecuperacionError, match="sin registro de entrenamiento"):
        flujo.verificar_recuperacion(directorio, "111-1")


def test_recuperacion_de_otra_ejecucion_falla(tmp_path: Path) -> None:
    """El registro descargado debe ser de ESTA ejecución del workflow."""
    contenido = b"contenido"
    huella = hashlib.sha256(contenido).hexdigest()
    directorio = _escribir_salida(tmp_path, contenido, _registro("222-1", huella))
    with pytest.raises(flujo.FalloRecuperacionError, match="otra ejecución"):
        flujo.verificar_recuperacion(directorio, "111-1")


def test_recuperacion_huella_que_no_coincide_falla(tmp_path: Path) -> None:
    """Un .lba manipulado (o de otra versión) no pasa la verificación."""
    contenido = b"contenido-manipulado"
    directorio = _escribir_salida(tmp_path, contenido, _registro("111-1", "f" * 64))
    with pytest.raises(flujo.FalloRecuperacionError, match="no coincide|ningún \\.lba"):
        flujo.verificar_recuperacion(directorio, "111-1")


def test_recuperacion_varios_lba_elige_por_huella(tmp_path: Path) -> None:
    """Con varios .lba en la salida, se elige el que declara el registro."""
    bueno = b"el-bueno"
    huella_buena = hashlib.sha256(bueno).hexdigest()
    directorio = _escribir_salida(tmp_path, bueno, _registro("111-1", huella_buena))
    (directorio / "otro@9.9.9.lba").write_bytes(b"otro-paquete")
    resultado = flujo.verificar_recuperacion(directorio, "111-1")
    assert Path(resultado["lba"]).name == "red-ter-3@1.0.0.lba"
    assert resultado["sha256"] == huella_buena


def test_recuperacion_directorio_inexistente_falla(tmp_path: Path) -> None:
    with pytest.raises(flujo.FalloRecuperacionError, match="no existe el directorio"):
        flujo.verificar_recuperacion(tmp_path / "ausente", "111-1")


def test_recuperacion_registro_ilegible_falla(tmp_path: Path) -> None:
    directorio = tmp_path / "salida"
    directorio.mkdir()
    (directorio / "x.lba").write_bytes(b"x")
    (directorio / "r-registro.json").write_text("{no es json", encoding="utf-8")
    with pytest.raises(flujo.FalloRecuperacionError, match="ilegible"):
        flujo.verificar_recuperacion(directorio, "111-1")


# ---------------------------------------------------------------------------
# Sondeo (bucle con CLI simulada)
# ---------------------------------------------------------------------------


class _Proceso:
    def __init__(self, stdout: str, returncode: int = 0, stderr: str = "") -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


def test_sondeo_exito_tras_pendiente() -> None:
    salidas: List[_Proceso] = [
        _Proceso('u/s has status "KernelWorkerStatus.QUEUED"'),
        _Proceso('u/s has status "KernelWorkerStatus.RUNNING"'),
        _Proceso('u/s has status "KernelWorkerStatus.COMPLETE"'),
    ]
    mensajes: List[str] = []

    def ejecutar(slug: str) -> _Proceso:
        return salidas.pop(0)

    def dormir(segundos: int) -> None:
        pass

    reloj = iter([0, 0, 1, 1, 2, 2])

    codigo = flujo.esperar_kernel(
        "u/s", limite_minutos=45, ejecutar_estado=ejecutar, dormir=dormir,
        ahora=lambda: next(reloj), escribir=mensajes.append,
    )
    assert codigo == 0
    assert any("completado" in mensaje for mensaje in mensajes)


def test_sondeo_error_terminal() -> None:
    salidas = [_Proceso('u/s has status "KernelWorkerStatus.ERROR"\nFailure message: "boom"')]
    mensajes: List[str] = []

    codigo = flujo.esperar_kernel(
        "u/s", 45, ejecutar_estado=lambda slug: salidas[0], dormir=lambda s: None,
        ahora=lambda: 0, escribir=mensajes.append,
    )
    assert codigo == 1
    assert any("::error::" in mensaje and "error" in mensaje for mensaje in mensajes)


def test_sondeo_cli_que_falla_falla_rapido() -> None:
    """Si la CLI erra (auth/red), el sondeo falla de inmediato (código 1),
    sin esperar el límite completo ni tratar el fallo como pendiente."""
    proceso = _Proceso("", returncode=1, stderr="401 Unauthorized")
    mensajes: List[str] = []
    codigo = flujo.esperar_kernel(
        "u/s", 45, ejecutar_estado=lambda slug: proceso, dormir=lambda s: None,
        ahora=lambda: 0, escribir=mensajes.append,
    )
    assert codigo == 1
    assert any("CLI de Kaggle falló" in mensaje for mensaje in mensajes)


def test_sondeo_estado_desconocido_falla_rapido() -> None:
    proceso = _Proceso("formato nuevo de CLI nunca visto")
    mensajes: List[str] = []
    codigo = flujo.esperar_kernel(
        "u/s", 45, ejecutar_estado=lambda slug: proceso, dormir=lambda s: None,
        ahora=lambda: 0, escribir=mensajes.append,
    )
    assert codigo == 1
    assert any("no se trata como éxito" in mensaje for mensaje in mensajes)


def test_sondeo_tiempo_agotado() -> None:
    proceso = _Proceso('u/s has status "KernelWorkerStatus.RUNNING"')
    mensajes: List[str] = []
    reloj = {"t": 0}

    def ahora() -> float:
        return reloj["t"]

    def dormir(segundos: int) -> None:
        reloj["t"] += segundos

    codigo = flujo.esperar_kernel(
        "u/s", limite_minutos=1, intervalo_segundos=60,
        ejecutar_estado=lambda slug: proceso, dormir=dormir, ahora=ahora,
        escribir=mensajes.append,
    )
    assert codigo == 1
    assert any("agotado" in mensaje for mensaje in mensajes)


# ---------------------------------------------------------------------------
# Generación completa (plantilla → archivos)
# ---------------------------------------------------------------------------


def test_generar_archivos_kernel(tmp_path: Path) -> None:
    plantilla = tmp_path / "plantilla.py"
    plantilla.write_text(
        'COMMIT = "__COMMIT__"\nPARAMS = json.loads("__PARAMS__")\n', encoding="utf-8"
    )
    destino = tmp_path / "kaggle"
    rutas = flujo.generar_archivos_kernel(
        plantilla=plantilla,
        destino_dir=destino,
        commit="a" * 40,
        run_id="1234567890-1",
        usuario="usuario",
        params={"semilla": "20261019", "iteraciones": "5", "partidas": "32",
                "simulaciones": "96", "pasos": "48", "evalPartidas": "40",
                "agentId": "red-ter-3", "version": "1.0.0"},
        usar_gpu=False,
    )
    metadata = json.loads((rutas["metadata"]).read_text(encoding="utf-8"))
    assert metadata["enable_gpu"] is False
    assert metadata["dataset_sources"] == []
    assert metadata["id"] == "usuario/arena-de-ias-entrenamiento-1234567890-1"
    kernel = rutas["kernel"].read_text(encoding="utf-8")
    assert "a" * 40 in kernel
    assert '"semilla": 20261019' in kernel
    assert '"runId": "1234567890-1"' in kernel
    assert (rutas["slug"]).read_text(encoding="utf-8").strip() == (
        "usuario/arena-de-ias-entrenamiento-1234567890-1"
    )


def test_generar_archivos_rechaza_commit_incompleto(tmp_path: Path) -> None:
    plantilla = tmp_path / "plantilla.py"
    plantilla.write_text('C="__COMMIT__"\nP=json.loads("__PARAMS__")', encoding="utf-8")
    with pytest.raises(ValueError, match="commit inválido"):
        flujo.generar_archivos_kernel(
            plantilla=plantilla, destino_dir=tmp_path / "d", commit="abc123",
            run_id="1-1", usuario="u",
            params={"semilla": "1", "iteraciones": "1", "partidas": "1",
                    "simulaciones": "1", "pasos": "1", "evalPartidas": "0"},
            usar_gpu=False,
        )


def test_generar_archivos_rechaza_parametros_malos(tmp_path: Path) -> None:
    plantilla = tmp_path / "plantilla.py"
    plantilla.write_text('C="__COMMIT__"\nP=json.loads("__PARAMS__")', encoding="utf-8")
    with pytest.raises(flujo.ParametroInvalidoError):
        flujo.generar_archivos_kernel(
            plantilla=plantilla, destino_dir=tmp_path / "d", commit="a" * 40,
            run_id="1-1", usuario="u",
            params={"semilla": "-1", "iteraciones": "1", "partidas": "1",
                    "simulaciones": "1", "pasos": "1", "evalPartidas": "0"},
            usar_gpu=False,
        )


# ---------------------------------------------------------------------------
# CLI del módulo (integración ligera, sin red)
# ---------------------------------------------------------------------------


def test_cli_verificar_integrado(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from entrenamiento.kaggle import flujo as modulo

    contenido = b"paquete-cli"
    huella = hashlib.sha256(contenido).hexdigest()
    directorio = _escribir_salida(tmp_path, contenido, _registro("77-1", huella))
    archivo_env = tmp_path / "github.env"
    monkeypatch.setenv("GITHUB_ENV", str(archivo_env))

    codigo = modulo._principal(["flujo", "verificar", str(directorio), "77-1"])
    assert codigo == 0
    texto = archivo_env.read_text(encoding="utf-8")
    assert "LBA_RECUPERADO=" in texto
    assert "red-ter-3@1.0.0.lba" in texto


def test_cli_verificar_falla_sin_lba(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from entrenamiento.kaggle import flujo as modulo

    monkeypatch.delenv("GITHUB_ENV", raising=False)
    directorio = _escribir_salida(tmp_path, None, _registro("77-1", "x" * 64))
    codigo = modulo._principal(["flujo", "verificar", str(directorio), "77-1"])
    assert codigo == 1


def test_cli_uso_incorrecto_devuelve_2() -> None:
    from entrenamiento.kaggle import flujo as modulo

    assert modulo._principal(["flujo"]) == 2
    assert modulo._principal(["flujo", "comando-inexistente"]) == 2
