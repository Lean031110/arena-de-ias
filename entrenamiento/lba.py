"""Construcción y lectura de paquetes .lba en Python (entrenamiento).

El formato lo define docs/LBA-MODELO.md; el validador canónico completo vive
en TypeScript (``src/dominio/lba/validador.ts``) y se aplica a TODA
importación en la app. Aquí implementamos la misma disciplina del lado
Python para que los paquetes generados por el entrenamiento pasen el
validador TS sin parches:
- Lista blanca exacta de entradas, sin entradas de directorio.
- checksums.sha256 con líneas «<hash>␣␣<ruta>» en orden lexicográfico.
- gameRulesHash = FNV-1a de 32 bits sobre el JSON canónico
  {id, reglasVersion, dimensiones, familia} — idéntico a ``huellaJSON`` TS.
- manifiesto con espejos exactos de training/config.json y linaje.
"""

from __future__ import annotations

import hashlib
import json
import io
import zipfile
from typing import Dict, Iterable, List, Mapping, Optional, Tuple

LISTA_BLANCA = (
    "manifest.json",
    "training/weights.safetensors",
    "training/config.json",
    "training/lineage.json",
    "evaluation/summary.json",
    "integrity/checksums.sha256",
    "model.onnx",
    "docs/FORMATO.md",
    "LICENSE.txt",
)

LIMITE_PAQUETE = 64 * 1024 * 1024
LIMITE_ENTRADAS = 64
LIMITE_TOTAL = 256 * 1024 * 1024
LIMITE_ENTRADA = 128 * 1024 * 1024


# ---------------------------- huella FNV-1a ---------------------------- #

def fnv1a_texto(texto: str) -> str:
    """FNV-1a de 32 bits sobre texto (idéntico a ``huellaFNV`` de TS)."""
    h = 0x811C9DC5
    for caracter in texto:
        h ^= ord(caracter)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def json_canonico(valor: object) -> str:
    """Serialización canónica (claves ordenadas) igual a ``establecerJSON``."""
    return json.dumps(valor, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def huella_json(valor: object) -> str:
    return fnv1a_texto(json_canonico(valor))


def hash_reglas_juego(descriptor: Mapping[str, object]) -> str:
    """gameRulesHash: FNV-1a del JSON canónico {id, reglasVersion, dimensiones, familia}."""
    return huella_json(
        {
            "id": descriptor["id"],
            "reglasVersion": descriptor["reglasVersion"],
            "dimensiones": descriptor["dimensiones"],
            "familia": descriptor["familia"],
        }
    )


# Descriptor del tres en raya 3×3: DEBE coincidir con juegos/registro.ts.
DESCRIPTOR_TRES_EN_RAYA_3 = {
    "id": "tres-en-raya-3",
    "reglasVersion": "1",
    "dimensiones": {"ancho": 3, "alto": 3},
    "familia": "celda",
}


# --------------------------- exportación .lba --------------------------- #

def _sha256(datos: bytes) -> str:
    return hashlib.sha256(datos).hexdigest()


def sha256_hex(datos: bytes) -> str:
    """SHA-256 hexadecimal (alias público usado por entrenar.py)."""
    return _sha256(datos)


def construir_paquete(
    manifiesto: Mapping[str, object],
    pesos_safetensors: bytes,
    config_entrenamiento: Mapping[str, object],
    linaje: Mapping[str, object],
    resumen_evaluacion: Optional[Mapping[str, object]] = None,
) -> Tuple[bytes, str]:
    """Construye el .lba completo y devuelve (bytes, sha256 del paquete)."""
    archivos: Dict[str, bytes] = {
        "training/weights.safetensors": pesos_safetensors,
        "training/config.json": (json.dumps(config_entrenamiento, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
        "training/lineage.json": (json.dumps(linaje, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    }
    if resumen_evaluacion is not None:
        archivos["evaluation/summary.json"] = (
            json.dumps(resumen_evaluacion, indent=2, ensure_ascii=False) + "\n"
        ).encode("utf-8")

    manifiesto_final = dict(manifiesto)
    manifiesto_final["pesos"] = {
        "training/weights.safetensors": {
            "bytes": len(pesos_safetensors),
            "sha256": _sha256(pesos_safetensors),
        }
    }
    archivos["manifest.json"] = json_canonico(manifiesto_final).encode("utf-8")

    lineas = [f"{_sha256(archivos[ruta])}  {ruta}" for ruta in sorted(archivos)]
    archivos["integrity/checksums.sha256"] = ("\n".join(lineas) + "\n").encode("utf-8")

    for ruta in archivos:
        if ruta not in LISTA_BLANCA:
            raise ValueError(f"ruta fuera de la lista blanca: {ruta}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for ruta in sorted(archivos):  # orden estable
            zf.writestr(ruta, archivos[ruta])  # sin entradas de directorio
    datos = buffer.getvalue()
    return datos, _sha256(datos)


# ----------------------------- lectura .lba ----------------------------- #

class ErrorPaquete(Exception):
    """Rechazo de paquete .lba en el lado Python."""


def leer_paquete(datos: bytes) -> Dict[str, bytes]:
    """Lee y valida (estructura, límites, checksums) un .lba. Sin código arbitrario."""
    if not 0 < len(datos) <= LIMITE_PAQUETE:
        raise ErrorPaquete(f"tamaño del paquete fuera de rango ({len(datos)} bytes)")
    try:
        with zipfile.ZipFile(io.BytesIO(datos)) as zf:
            infos = zf.infolist()
            if not 0 < len(infos) <= LIMITE_ENTRADAS:
                raise ErrorPaquete(f"número de entradas fuera de rango ({len(infos)})")
            total = 0
            for info in infos:
                if info.is_dir():
                    raise ErrorPaquete(f"entrada de directorio no permitida: {info.filename}")
                if info.filename not in LISTA_BLANCA:
                    raise ErrorPaquete(f"ruta fuera de la lista blanca: {info.filename}")
                if ".." in info.filename.split("/") or info.filename.startswith("/"):
                    raise ErrorPaquete(f"ruta insegura: {info.filename}")
                total += info.file_size
                if info.file_size > LIMITE_ENTRADA:
                    raise ErrorPaquete(f"entrada demasiado grande: {info.filename}")
            if total > LIMITE_TOTAL:
                raise ErrorPaquete(f"total descomprimido excede el límite ({total} bytes)")
            archivos = {info.filename: zf.read(info.filename) for info in infos}
    except zipfile.BadZipFile as error:
        raise ErrorPaquete(f"ZIP ilegible: {error}") from error

    if "integrity/checksums.sha256" not in archivos:
        raise ErrorPaquete("falta integrity/checksums.sha256")
    if "manifest.json" not in archivos:
        raise ErrorPaquete("falta manifest.json")

    lineas = archivos["integrity/checksums.sha256"].decode("utf-8").rstrip("\n").split("\n")
    declarados: Dict[str, str] = {}
    for linea in lineas:
        partes = linea.split("  ", 1)
        if len(partes) != 2 or len(partes[0]) != 64:
            raise ErrorPaquete(f"línea de checksum malformada: {linea[:80]}")
        if partes[1] in declarados:
            raise ErrorPaquete(f"ruta duplicada en checksums: {partes[1]}")
        declarados[partes[1]] = partes[0]

    esperados = sorted(ruta for ruta in archivos if ruta != "integrity/checksums.sha256")
    if sorted(declarados.keys()) != esperados:
        raise ErrorPaquete(
            f"cobertura de checksums incorrecta: {sorted(declarados.keys())} ≠ {esperados}"
        )
    for ruta, hash_declarado in declarados.items():
        real = _sha256(archivos[ruta])
        if real != hash_declarado:
            raise ErrorPaquete(f"SHA-256 de {ruta} no coincide")

    manifiesto = json.loads(archivos["manifest.json"].decode("utf-8"))
    pesos_manifest = manifiesto.get("pesos", {}).get("training/weights.safetensors")
    if pesos_manifest is None:
        raise ErrorPaquete("el manifiesto no declara training/weights.safetensors")
    if pesos_manifest.get("bytes") != len(archivos["training/weights.safetensors"]):
        raise ErrorPaquete("bytes declarados del manifiesto difieren del archivo real")

    return archivos


def escribir_safetensors(tensores: Mapping[str, object]) -> bytes:
    """Escribe safetensors F32 desde tensores torch (vía safetensors.numpy)."""
    from safetensors.numpy import save

    numpy_dict = {}
    for nombre, tensor in tensores.items():
        import numpy as np

        t = tensor.detach().cpu().contiguous()
        if t.dtype != torch.float32:
            t = t.to(torch.float32)
        numpy_dict[nombre] = t.numpy().astype(np.float32, copy=False)
    return save(numpy_dict)


def leer_safetensors(datos: bytes) -> Dict[str, "object"]:
    """Lee safetensors F32 → {nombre: torch.Tensor}."""
    import torch as _torch
    from safetensors.numpy import load as cargar_numpy

    numpy_dict = cargar_numpy(datos)
    salida: Dict[str, object] = {}
    for nombre, arreglo in numpy_dict.items():
        if arreglo.dtype != __import__("numpy").float32:
            raise ErrorPaquete(f"tensor {nombre}: dtype {arreglo.dtype} no es F32")
        salida[nombre] = _torch.from_numpy(arreglo.copy())
    return salida


# import diferido para evitar dependencia circular en anotaciones
import torch  # noqa: E402


def _iterar_rutas(archivos: Mapping[str, bytes]) -> Iterable[str]:
    return sorted(archivos.keys())


def lista_rutas(archivos: Mapping[str, bytes]) -> List[str]:
    return list(_iterar_rutas(archivos))
