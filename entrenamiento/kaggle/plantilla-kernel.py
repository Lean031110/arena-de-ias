"""Plantilla del kernel de Kaggle (NO se ejecuta tal cual: el workflow
``train-kaggle.yml`` genera kernel.py sustituyendo los parámetros).

Evaluación de KevKibe/kaggle-script-action frente al CLI oficial
(decisión documentada, docs/INFORMES/FASE-2.md §F):
- La acción de terceros clona el repositorio y ejecuta un script, pero la
  recuperación de SALIDAS del kernel (el .lba) queda fuera de su flujo y
  exigiría pasos manuales no verificables; además ejecuta código remoto
  con las credenciales de Kaggle sin control de versión de la acción
  salvo fijado por SHA (riesgo de cadena de suministro).
- El CLI oficial de Kaggle ofrece mecanismos documentados exactamente para
  este ciclo: ``kaggle kernels push``, ``kaggle kernels status`` y
  ``kaggle kernels output``. Decisión: CLI oficial, versión fijada en
  requirements-kaggle.txt. Cero acciones de terceros con credenciales.

Este kernel:
1. Clona el repositorio PÚBLICO en el commit exacto indicado (verificado).
2. Ejecuta el entrenamiento REAL con los parámetros del workflow.
3. Copia el .lba y su registro JSON a /kaggle/working (salida del kernel).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = "https://github.com/Lean031110/arena-de-ias.git"
COMMIT = "__COMMIT__"  # sustituido por el workflow (SHA completo verificado)
PARAMS = json.loads("__PARAMS__")  # {"semilla":…, "iteraciones":…, …}
TRABAJO = Path("/kaggle/working")


def run(comando: list[str], cwd: Path | None = None) -> None:
    print(f"+ {' '.join(comando)}", flush=True)
    subprocess.run(comando, cwd=cwd, check=True)


def main() -> int:
    repo = Path("repo")
    if not repo.exists():
        run(["git", "clone", REPO, str(repo)])
    run(["git", "-C", str(repo), "fetch", "--all"])
    run(["git", "-C", str(repo), "checkout", COMMIT])

    # Dependencias ligeras que el kernel de Kaggle no trae (torch ya viene).
    # Versión fijada (la misma que requirements-entrenamiento.txt) para
    # reproducibilidad entre local y Kaggle.
    run([sys.executable, "-m", "pip", "install", "--quiet", "safetensors==0.8.0"])

    argumentos = [
        sys.executable,
        "-m",
        "entrenamiento.entrenar",
        "--semilla", str(PARAMS["semilla"]),
        "--iteraciones", str(PARAMS["iteraciones"]),
        "--partidas", str(PARAMS["partidas"]),
        "--simulaciones", str(PARAMS["simulaciones"]),
        "--pasos", str(PARAMS["pasos"]),
        "--lote", str(PARAMS["lote"]),
        "--lr", str(PARAMS["lr"]),
        "--eval-partidas", str(PARAMS["evalPartidas"]),
        "--agent-id", str(PARAMS["agentId"]),
        "--version", str(PARAMS["version"]),
        "--run-id", str(PARAMS["runId"]),
        "--salida", "salida-entrenamiento",
    ]
    if PARAMS.get("reanudar"):
        # Reanudación: el workflow sube el paquete padre como dataset del kernel.
        argumentos += ["--reanudar", str(PARAMS["reanudar"])]
    run(argumentos, cwd=repo)

    # Recoger las salidas reales: .lba + registro JSON.
    TRABAJO.mkdir(parents=True, exist_ok=True)
    generados = list((repo / "salida-entrenamiento").glob("*.lba"))
    if not generados:
        print("ERROR: el entrenamiento no produjo ningún .lba", file=sys.stderr)
        return 1
    for archivo in generados:
        shutil.copy2(archivo, TRABAJO / archivo.name)
        print(f"salida: {archivo.name}")
    for registro in (repo / "salida-entrenamiento").glob("*-registro.json"):
        shutil.copy2(registro, TRABAJO / registro.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
