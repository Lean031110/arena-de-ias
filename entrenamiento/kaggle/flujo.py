"""Flujo GitHub Actions → Kaggle → ``.lba`` (Tarea F corregida).

Este módulo concentra TODA la lógica del workflow
``.github/workflows/train-kaggle.yml`` en funciones puras y comprobables con
pytest, para que nada dependa de fragmentos Python incrustados en YAML:

- ``bool_desde_env``: conversión EXPLÍCITA y validada de variables de entorno
  booleanas. Nunca se interpolan booleanos de GitHub directamente en código
  Python (el valor llega como texto ``"true"``/``"false"`` y se valida aquí).
- ``extraer_estado`` / ``interpretar_estado_salida``: análisis robusto de la
  salida de ``kaggle kernels status``. La CLI 2.2.4 imprime el enum completo
  (``KernelWorkerStatus.COMPLETE``); versiones anteriores imprimen la palabra
  suelta (``complete``). Se normalizan mayúsculas, comillas y mensajes de
  fallo. Un estado NO reconocido NUNCA se trata como éxito: lanza
  ``EstadoDesconocidoError``.
- ``generar_metadata``: metadatos del kernel con los campos que el CLI 2.x
  realmente lee (``dataset_sources``, no el obsoleto ``kernel_datasets``).
- ``verificar_recuperacion``: el ``.lba`` descargado debe existir, pertenecer
  a la ejecución actual (``runId``) y coincidir con la huella SHA-256
  declarada por el registro de entrenamiento descargado junto a él.
- ``esperar_kernel``: sondeo con límite de tiempo; falla rápido si la CLI
  erra o el estado es desconocido.

Estados del kernel reconocidos (kagglesdk 0.1.37, KernelWorkerStatus):
``queued``, ``running``, ``complete``, ``error``, ``cancelRequested``,
``cancelAcknowledged``, ``newScript`` (y ``latent`` documentado por la API).
Terminales de éxito: ``complete``. Terminales de error: ``error`` y
``cancelAcknowledged``. El resto son transitorios (se sigue esperando).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# --- Estados de kernel reconocidos (normalizados en minúsculas) -------------

ESTADOS_EXITO = frozenset({"complete"})
ESTADOS_ERROR = frozenset({"error", "cancelacknowledged"})
ESTADOS_PENDIENTES = frozenset({"queued", "running", "newscript", "latent", "cancelrequested"})

# Todos los tokens que el analizador acepta como estado.
ESTADOS_CONOCIDOS = ESTADOS_EXITO | ESTADOS_ERROR | ESTADOS_PENDIENTES

# Parámetros de entrenamiento enteros positivos con límites sensatos
# (se validan ANTES de generar el kernel: fallo rápido en el runner, no en
# Kaggle tras 10 minutos de cola).
LIMITES_ENTEROS = {
    "semilla": (1, 2_147_483_647),
    "iteraciones": (1, 10_000),
    "partidas": (1, 10_000),
    "simulaciones": (1, 10_000),
    "pasos": (1, 100_000),
    "evalPartidas": (0, 10_000),
}


class EstadoDesconocidoError(ValueError):
    """La salida de la CLI no contiene un estado reconocible."""


class ParametroInvalidoError(ValueError):
    """Un parámetro de entrenamiento no pasa la validación."""


class FalloRecuperacionError(RuntimeError):
    """La salida recuperada del kernel no cumple los requisitos del flujo."""


# --- Booleanos desde el entorno ---------------------------------------------


def bool_desde_env(nombre: str) -> bool:
    """Convierte una variable de entorno a booleano de forma estricta.

    Acepta exactamente ``"true"``/``"false"`` (mayúsculas irrelevantes,
    espacios tolerados). Cualquier otro valor lanza ``ValueError``: nunca se
    adivina (un ``"1"``, ``"yes"`` o cadena vacía es un error de
    configuración, no un ``False`` silencioso).
    """
    valor = os.environ.get(nombre)
    if valor is None:
        raise ValueError(f"falta la variable de entorno {nombre}")
    normalizado = valor.strip().lower()
    if normalizado == "true":
        return True
    if normalizado == "false":
        return False
    raise ValueError(
        f"valor booleano inválido para {nombre}: {valor!r} (se espera 'true' o 'false')"
    )


# --- Análisis del estado del kernel ----------------------------------------


def _normalizar_estado_crudo(crudo: str) -> str:
    """Normaliza un estado crudo: minúsculas, sin comillas ni guiones bajos.

    ``CANCEL_ACKNOWLEDGED`` (nombre del enum en kagglesdk) y
    ``cancelAcknowledged`` (cadena de la API 1.x) normalizan ambos a
    ``cancelacknowledged``.
    """
    return crudo.strip().strip('"').strip("'").lower().replace("_", "")


def extraer_estado(texto: str) -> str:
    """Extrae el estado de la salida de ``kaggle kernels status``.

    Formatos reales reconocidos (probados contra el código fuente de la CLI
    2.2.4, ``kernels_status_cli``):

    - ``usuario/slug has status "KernelWorkerStatus.COMPLETE"``
      (CLI 2.2.4: ``%s`` sobre el enum imprime ``Clase.MIEMBRO``).
    - ``usuario/slug has status "complete"`` (formato de versiones 1.x).
    - Línea adicional ``Failure message: "..."`` (se ignora para el estado,
      pero su presencia con estado de error se conserva en el texto).

    Estrategia, en orden de preferencia:
    1. Patrón ``kernelworkerstatus.<nombre>`` (formato 2.x, inequívoco).
    2. Patrón ``has status "<nombre>"`` (formato 1.x).
    3. Un único token conocido en el texto (tolerancia ante cambios de
       formato menores).

    Si no hay ningún token conocido, lanza ``EstadoDesconocidoError``.
    """
    if not texto or not texto.strip():
        raise EstadoDesconocidoError("salida vacía de la CLI")

    texto_normalizado = texto.lower()

    # 1) Formato de CLI 2.x: KernelWorkerStatus.COMPLETE (con o sin comillas).
    coincidencia = re.search(r"kernelworkerstatus\.([a-z_]+)", texto_normalizado)
    if coincidencia:
        return _normalizar_estado_crudo(coincidencia.group(1))

    # 2) Formato de CLI 1.x: has status "complete" (comillas opcionales).
    coincidencia = re.search(r'has\s+status\s+"?([a-z_]+)"?', texto_normalizado)
    if coincidencia:
        return _normalizar_estado_crudo(coincidencia.group(1))

    # 3) Tolerancia: algún token conocido en el texto (guiones bajos fuera,
    #    para que «cancel_acknowledged» equivalga a «cancelacknowledged»).
    tokens = re.findall(r"[a-z_]+", texto_normalizado)
    encontrados = [token.replace("_", "") for token in tokens if token.replace("_", "") in ESTADOS_CONOCIDOS]
    if encontrados:
        # El estado se imprime ANTES del posible «Failure message»; el primer
        # token conocido es el estado, no parte del mensaje.
        return encontrados[0]

    raise EstadoDesconocidoError(f"estado no reconocible en: {texto.strip()[:200]!r}")


def interpretar_estado_salida(texto: str) -> str:
    """Clasifica la salida completa de ``kaggle kernels status``.

    Devuelve ``"exito"``, ``"error"`` o ``"pendiente"``. Los estados
    desconocidos lanzan ``EstadoDesconocidoError`` (nunca se interpretan
    como éxito ni como espera infinita).
    """
    estado = extraer_estado(texto)
    if estado in ESTADOS_EXITO:
        return "exito"
    if estado in ESTADOS_ERROR:
        return "error"
    if estado in ESTADOS_PENDIENTES:
        return "pendiente"
    raise EstadoDesconocidoError(f"estado no reconocido: {estado!r}")


# --- Validación de parámetros ----------------------------------------------


def validar_parametros_enteros(valores: Dict[str, Any]) -> Dict[str, int]:
    """Valida los parámetros de entrenamiento enteros contra límites fijados.

    ``valores`` asigna nombre → valor (str o int). Devuelve el diccionario
    con enteros nativos. Lanza ``ParametroInvalidoError`` con un mensaje
    accionable si algo falta, no es entero o está fuera de rango.
    """
    resultado: Dict[str, int] = {}
    for nombre, (minimo, maximo) in LIMITES_ENTEROS.items():
        if nombre not in valores:
            raise ParametroInvalidoError(f"falta el parámetro {nombre}")
        crudo = valores[nombre]
        try:
            valor = int(str(crudo).strip())
        except (TypeError, ValueError) as error:
            raise ParametroInvalidoError(
                f"el parámetro {nombre} no es un entero: {crudo!r}"
            ) from error
        if not (minimo <= valor <= maximo):
            raise ParametroInvalidoError(
                f"el parámetro {nombre}={valor} está fuera del rango [{minimo}, {maximo}]"
            )
        resultado[nombre] = valor
    return resultado


# --- Generación del kernel y sus metadatos ----------------------------------


def generar_metadata(usuario: str, slug: str, titulo: str, usar_gpu: bool) -> Dict[str, Any]:
    """Metadatos ``kernel-metadata.json`` con los campos del CLI 2.x.

    Correcciones respecto a la versión anterior (ver FASE-2 §F):
    - ``dataset_sources`` es el campo que la CLI 2.2.4 lee realmente;
      ``kernel_datasets`` era un campo obsoleto que se ignoraba en silencio.
    - ``enable_gpu`` recibe un booleano REAL de Python (convertido y
      validado por ``bool_desde_env``), nunca texto interpolado.
    - El título se valida (≥ 5 caracteres, requisito del CLI).
    """
    if not usuario or not usuario.strip():
        raise ValueError("falta el usuario de Kaggle")
    if not slug or not slug.strip():
        raise ValueError("falta el slug del kernel")
    if len(titulo) < 5:
        raise ValueError("el título del kernel debe tener al menos 5 caracteres (requisito de la CLI)")
    if not isinstance(usar_gpu, bool):
        raise TypeError(f"usar_gpu debe ser bool, no {type(usar_gpu).__name__}")
    return {
        "id": f"{usuario}/{slug}",
        "title": titulo,
        "code_file": "kernel.py",
        "language": "python",
        "kernel_type": "script",
        "is_private": True,
        "enable_gpu": usar_gpu,
        "enable_tpu": False,
        "enable_internet": True,
        "kernel_sources": [],
        "dataset_sources": [],
        "competition_sources": [],
    }


def generar_archivos_kernel(
    plantilla: Path,
    destino_dir: Path,
    commit: str,
    run_id: str,
    usuario: str,
    params: Dict[str, Any],
    usar_gpu: bool,
) -> Dict[str, Path]:
    """Escribe ``kernel.py``, ``kernel-metadata.json`` y ``slug.txt``.

    Devuelve las rutas creadas. El kernel generado incrusta el commit exacto
    y los parámetros validados; los metadatos usan ``generar_metadata``.
    """
    if not plantilla.is_file():
        raise FileNotFoundError(f"plantilla no encontrada: {plantilla}")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError(f"commit inválido (se espera SHA-1 completo): {commit!r}")
    if not run_id or not re.fullmatch(r"[0-9]+-[0-9]+", run_id):
        raise ValueError(f"run_id inválido (se espera '<RUN_ID>-<ATTEMPT>'): {run_id!r}")

    enteros = validar_parametros_enteros(params)

    slug = f"arena-de-ias-entrenamiento-{run_id}".lower()
    titulo = slug

    kernel_texto = plantilla.read_text(encoding="utf-8")
    if "__COMMIT__" not in kernel_texto or "__PARAMS__" not in kernel_texto:
        raise ValueError("la plantilla no contiene los marcadores __COMMIT__/__PARAMS__")
    kernel_texto = kernel_texto.replace("__COMMIT__", commit)
    kernel_texto = kernel_texto.replace(
        "__PARAMS__",
        json.dumps(
            {
                **{clave: enteros[clave] for clave in LIMITES_ENTEROS},
                "lote": 64,
                "lr": 0.002,
                "agentId": str(params.get("agentId", "red-ter-3")),
                "version": str(params.get("version", "1.0.0")),
                "runId": run_id,
            }
        ),
    )

    destino_dir.mkdir(parents=True, exist_ok=True)
    kernel = destino_dir / "kernel.py"
    kernel.write_text(kernel_texto, encoding="utf-8")

    metadata = destino_dir / "kernel-metadata.json"
    metadata.write_text(
        json.dumps(generar_metadata(usuario, slug, titulo, usar_gpu), indent=2) + "\n",
        encoding="utf-8",
    )

    slug_file = destino_dir / "slug.txt"
    slug_file.write_text(f"{usuario}/{slug}", encoding="utf-8")

    return {"kernel": kernel, "metadata": metadata, "slug": slug_file}


# --- Verificación de la recuperación ---------------------------------------


def _sha256(ruta: Path) -> str:
    digest = hashlib.sha256()
    with ruta.open("rb") as manejador:
        for bloque in iter(lambda: manejador.read(65536), b""):
            digest.update(bloque)
    return digest.hexdigest()


def verificar_recuperacion(dir_salida: Path, run_id_esperado: str) -> Dict[str, str]:
    """Comprueba que la salida descargada pertenece a ESTA ejecución.

    Requisitos (todos deben cumplirse; si no, ``FalloRecuperacionError``):
    1. Existe un ``*-registro.json`` de entrenamiento.
    2. Existe al menos un ``*.lba``.
    3. El ``runId`` del registro coincide con la ejecución actual del
       workflow (prueba de que la descarga no es de una ejecución antigua).
    4. Algún ``.lba`` descargado coincide EXACTAMENTE con la huella SHA-256
       declarada en ``registro["paquete"]["sha256"]``.

    Devuelve ``{"lba": ruta, "sha256": huella, "registro": ruta}``.
    """
    if not dir_salida.is_dir():
        raise FalloRecuperacionError(f"no existe el directorio de salida: {dir_salida}")

    registros = sorted(dir_salida.glob("*-registro.json"))
    lbas = sorted(dir_salida.glob("*.lba"))

    if not registros:
        raise FalloRecuperacionError("sin registro de entrenamiento junto a la salida: no hay trazabilidad")
    if not lbas:
        raise FalloRecuperacionError("el kernel terminó pero NO produjo ningún .lba")

    registro_ruta = registros[0]
    try:
        registro = json.loads(registro_ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise FalloRecuperacionError(f"registro ilegible ({registro_ruta}): {error}") from error

    run_id_registrado = registro.get("runId")
    if run_id_registrado != run_id_esperado:
        raise FalloRecuperacionError(
            f"el registro descargado pertenece a otra ejecución: runId={run_id_registrado!r} "
            f"≠ esperado {run_id_esperado!r}"
        )

    declarada = (registro.get("paquete") or {}).get("sha256")
    if not declarada:
        raise FalloRecuperacionError("el registro no declara la huella sha256 del paquete")

    for candidato in lbas:
        if _sha256(candidato) == declarada:
            return {
                "lba": str(candidato),
                "sha256": declarada,
                "registro": str(registro_ruta),
            }

    huellas = ", ".join(_sha256(candidato) for candidato in lbas)
    raise FalloRecuperacionError(
        f"ningún .lba recuperado coincide con la huella declarada {declarada}; "
        f"recuperados: {huellas}"
    )


# --- Sondeo del kernel ------------------------------------------------------


def esperar_kernel(
    slug: str,
    limite_minutos: int,
    intervalo_segundos: int = 60,
    ejecutar_estado: Optional[Any] = None,
    dormir: Optional[Any] = None,
    ahora: Optional[Any] = None,
    escribir: Optional[Any] = None,
) -> int:
    """Sondea ``kaggle kernels status`` hasta un estado terminal o el límite.

    Devuelve 0 si el kernel terminó con éxito, 1 en cualquier otro caso
    (estado de error, CLI que falla, estado desconocido o tiempo agotado).
    Los mensajes usan el prefijo ``::error::`` de GitHub Actions.

    ``ejecutar_estado``/``dormir``/``ahora``/``escribir`` son inyectables para
    las pruebas (por defecto: ``subprocess.run`` de la CLI real, ``time.sleep``,
    ``time.time`` y ``print``).
    """
    if limite_minutos <= 0:
        raise ValueError("el límite de minutos debe ser positivo")

    if ejecutar_estado is None:
        def ejecutar_estado(s: str) -> subprocess.CompletedProcess:
            return subprocess.run(
                ["kaggle", "kernels", "status", s],
                capture_output=True,
                text=True,
                check=False,
            )
    if dormir is None:
        dormir = time.sleep
    if ahora is None:
        ahora = time.time
    if escribir is None:
        escribir = print

    inicio = ahora()
    while True:
        proceso = ejecutar_estado(slug)
        if proceso.returncode != 0:
            stderr = (proceso.stderr or "").strip()
            escribir(
                f"::error::la CLI de Kaggle falló al consultar el estado "
                f"(código {proceso.returncode}): {stderr[:300]}"
            )
            return 1
        try:
            clasificacion = interpretar_estado_salida(proceso.stdout or "")
        except EstadoDesconocidoError as error:
            escribir(f"::error::estado no reconocido (no se trata como éxito): {error}")
            return 1

        if clasificacion == "exito":
            escribir("kernel completado con éxito.")
            return 0
        if clasificacion == "error":
            escribir(
                f"::error::el kernel terminó en error. Consulta los registros con: "
                f"kaggle kernels output {slug}"
            )
            return 1

        transcurridos_min = (ahora() - inicio) / 60
        if transcurridos_min >= limite_minutos:
            escribir(
                f"::error::tiempo de espera agotado ({limite_minutos} min) sin estado terminal."
            )
            return 1
        escribir(f"estado pendiente ({transcurridos_min:.0f} min transcurridos)…")
        dormir(intervalo_segundos)


# --- CLI del módulo (lo usa el workflow, nada de Python incrustado) --------


def _principal(argv: List[str]) -> int:
    if len(argv) < 2:
        escribir_uso()
        return 2
    comando = argv[1]

    if comando == "generar":
        # Variables de entorno (nada de interpolación de expresiones GitHub
        # dentro de Python; los booleanos pasan por bool_desde_env).
        usar_gpu = bool_desde_env("USAR_GPU")
        usuario = os.environ.get("KAGGLE_USERNAME", "")
        commit = os.environ.get("COMMIT_EXACTO", "")
        run_id = os.environ.get("RUN_ID", "")
        params = {
            "semilla": os.environ.get("SEMILLA", ""),
            "iteraciones": os.environ.get("ITERACIONES", ""),
            "partidas": os.environ.get("PARTIDAS", ""),
            "simulaciones": os.environ.get("SIMULACIONES", ""),
            "pasos": os.environ.get("PASOS", ""),
            "evalPartidas": os.environ.get("EVAL_PARTIDAS", "40"),
            "agentId": os.environ.get("AGENT_ID", "red-ter-3"),
            "version": os.environ.get("VERSION_CEREBRO", "1.0.0"),
        }
        rutas = generar_archivos_kernel(
            plantilla=Path("entrenamiento/kaggle/plantilla-kernel.py"),
            destino_dir=Path("entrenamiento/kaggle"),
            commit=commit,
            run_id=run_id,
            usuario=usuario,
            params=params,
            usar_gpu=usar_gpu,
        )
        print("kernel generado:", rutas["kernel"])
        print("metadatos:", rutas["metadata"])
        print("slug:", rutas["slug"].read_text(encoding="utf-8").strip())
        return 0

    if comando == "esperar":
        if len(argv) < 4:
            escribir_uso()
            return 2
        slug = argv[2]
        try:
            limite = int(argv[3])
        except ValueError:
            escribir_uso()
            return 2
        return esperar_kernel(slug, limite)

    if comando == "verificar":
        if len(argv) < 4:
            escribir_uso()
            return 2
        dir_salida = Path(argv[2])
        run_id = argv[3]
        try:
            resultado = verificar_recuperacion(dir_salida, run_id)
        except FalloRecuperacionError as error:
            print(f"::error::{error}")
            return 1
        print("lba:", resultado["lba"])
        print("sha256:", resultado["sha256"])
        print("registro:", resultado["registro"])
        # Variable de entorno para los pasos siguientes del workflow.
        archivo_env = os.environ.get("GITHUB_ENV")
        if archivo_env:
            with open(archivo_env, "a", encoding="utf-8") as manejador:
                manejador.write(f"LBA_RECUPERADO={resultado['lba']}\n")
        return 0

    escribir_uso()
    return 2


def escribir_uso() -> None:
    print(
        "uso: python -m entrenamiento.kaggle.flujo <comando>…\n"
        "  generar              (requiere USAR_GPU, KAGGLE_USERNAME, COMMIT_EXACTO, RUN_ID,\n"
        "                        SEMILLA, ITERACIONES, PARTIDAS, SIMULACIONES, PASOS, EVAL_PARTIDAS)\n"
        "  esperar <slug> <minutos-límite>\n"
        "  verificar <dir-salida> <run-id-esperado>",
        file=sys.stderr,
    )


if __name__ == "__main__":
    raise SystemExit(_principal(sys.argv))
