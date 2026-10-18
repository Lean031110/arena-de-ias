"""Entrenamiento REAL por autojuego supervisado (Tarea D).

Ciclo completo y medible:
    autojuego → buffer FIFO → optimización (CE política + MSE valor) →
    evaluación frente a rivales congelados → exportación .lba candidata.

Cada ejecución escribe un registro JSON con TODAS las magnitudes reales:
semillas, partidas, ejemplos, pasos, pérdidas medidas, duraciones,
dispositivo, versiones, checkpoints y evaluaciones. Ninguna cifra se
inventa: si algo no se ejecuta, no aparece.

Uso:
    python -m entrenamiento.entrenar \
        --semilla 20261019 --iteraciones 6 --partidas 40 --simulaciones 128 \
        --salida modelos/candidatas

    # Reanudar desde un paquete .lba (el padre se conserva intacto):
    python -m entrenamiento.entrenar --reanudar modelos/candidatas/red-ter-3@1.0.0.lba ...
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from . import juego_tres_en_raya as juego
from . import lba
from .autojuego import MCTS, Ejemplo, jugar_partida
from .red import RedPoliticaValor, cargar_tensores, exportar_tensores, inicializar_determinista, tabla_formas


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def version_codigo() -> str:
    """Hash del commit actual: los entrenamientos se trazan a código exacto."""
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except Exception:
        return "sin-git"


def wilson_ic(exitos: int, n: int, z: float = 1.959963985) -> Tuple[float, float]:
    """IC de Wilson 95 % — misma fórmula que estadistica.ts (documentada)."""
    if n == 0:
        return 0.0, 1.0
    p = exitos / n
    denominador = 1 + z * z / n
    centro = p + z * z / (2 * n)
    ajuste = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return max(0.0, (centro - ajuste) / denominador), min(1.0, (centro + ajuste) / denominador)


class BufferFIFO:
    """Buffer de repetición con capacidad fija y trazabilidad de origen."""

    def __init__(self, capacidad: int) -> None:
        self.capacidad = capacidad
        self.ejemplos: List[Ejemplo] = []
        self.origenes: List[str] = []
        self.descartados = 0
        self.total_insertados = 0

    def agregar(self, ejemplos: List[Ejemplo], origen: str) -> None:
        for ejemplo in ejemplos:
            if len(self.ejemplos) >= self.capacidad:
                self.ejemplos.pop(0)
                self.origenes.pop(0)
                self.descartados += 1
            self.ejemplos.append(ejemplo)
            self.origenes.append(origen)
            self.total_insertados += 1

    def lote(self, tamano: int, rng: np.random.Generator) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        if len(self.ejemplos) < tamano:
            raise ValueError(f"buffer con {len(self.ejemplos)} ejemplos < lote {tamano}")
        indices = rng.choice(len(self.ejemplos), size=tamano, replace=False)
        planos = np.array([self.ejemplos[i].planos for i in indices], dtype=np.float32)
        politica = np.array([self.ejemplos[i].politica for i in indices], dtype=np.float32)
        valor = np.array([self.ejemplos[i].valor for i in indices], dtype=np.float32)
        return (
            torch.from_numpy(planos),
            torch.from_numpy(politica),
            torch.from_numpy(valor),
        )


def evaluar_contra_aleatorio(
    red: RedPoliticaValor,
    mcts: MCTS,
    rng: np.random.Generator,
    partidas: int,
) -> Dict[str, object]:
    """Evaluación REAL: la red (con muestreo de visitas) contra uniforme."""
    victorias = empates = derrotas = 0
    duraciones: List[float] = []
    for indice in range(partidas):
        # Alternancia de lados: la red juega como 1 y como 2.
        red_como_j1 = indice % 2 == 0
        estado = juego.estado_inicial()
        inicio = time.perf_counter()
        while juego.resultado(estado) is None:
            turno_red = (juego.jugador_actual(estado) == 1) == red_como_j1
            if turno_red:
                visitas, _ = mcts.buscar(estado)  # sin ruido ni temperatura
                legales = juego.movimientos_legales(estado)
                eleccion = max(legales, key=lambda a: visitas[a])
            else:
                eleccion = int(rng.choice(juego.movimientos_legales(estado)))
            estado = juego.aplicar(estado, eleccion)
        duraciones.append(time.perf_counter() - inicio)
        res = juego.resultado(estado)
        if res == 0:
            empates += 1
        elif (res == 1) == red_como_j1:
            victorias += 1
        else:
            derrotas += 1
    n = partidas
    puntuacion = (victorias + empates / 2) / n
    ic = wilson_ic(victorias + empates / 2, n)  # sobre puntuación, como en TS
    return {
        "oponente": "aleatorio-uniforme",
        "partidas": n,
        "victorias": victorias,
        "empates": empates,
        "derrotas": derrotas,
        "puntuacion": round(puntuacion, 4),
        "ic95_puntuacion": [round(ic[0], 4), round(ic[1], 4)],
        "duracionTotalS": round(sum(duraciones), 2),
    }


def evaluar_contra_congelada(
    red: RedPoliticaValor,
    congelada: RedPoliticaValor,
    mcts_eval: MCTS,
    rng: np.random.Generator,
    partidas: int,
) -> Dict[str, object]:
    """Duelo medido: red actual contra copia congelada (misma arquitectura)."""
    mcts_congelada = MCTS(congelada, mcts_eval.simulaciones, mcts_eval.c_puct)
    victorias = empates = derrotas = 0
    for indice in range(partidas):
        red_como_j1 = indice % 2 == 0
        estado = juego.estado_inicial()
        while juego.resultado(estado) is None:
            turno_red = (juego.jugador_actual(estado) == 1) == red_como_j1
            mcts_turno = mcts_eval if turno_red else mcts_congelada
            visitas, _ = mcts_turno.buscar(estado)
            legales = juego.movimientos_legales(estado)
            eleccion = max(legales, key=lambda a: visitas[a])
            estado = juego.aplicar(estado, eleccion)
        res = juego.resultado(estado)
        if res == 0:
            empates += 1
        elif (res == 1) == red_como_j1:
            victorias += 1
        else:
            derrotas += 1
    n = partidas
    puntuacion = (victorias + empates / 2) / n
    ic = wilson_ic(victorias + empates / 2, n)
    return {
        "oponente": "version-inicial-congelada",
        "partidas": n,
        "victorias": victorias,
        "empates": empates,
        "derrotas": derrotas,
        "puntuacion": round(puntuacion, 4),
        "ic95_puntuacion": [round(ic[0], 4), round(ic[1], 4)],
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Entrenamiento real por autojuego (Arena de IAs)")
    parser.add_argument("--semilla", type=int, default=20261019)
    parser.add_argument("--iteraciones", type=int, default=6)
    parser.add_argument("--partidas", type=int, default=40)
    parser.add_argument("--simulaciones", type=int, default=128)
    parser.add_argument("--lote", type=int, default=64)
    parser.add_argument("--pasos", type=int, default=40)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--buffer", type=int, default=20000)
    parser.add_argument("--c-puct", type=float, default=1.5)
    parser.add_argument("--agent-id", type=str, default="red-ter-3")
    parser.add_argument("--version", type=str, default="1.0.0")
    parser.add_argument("--run-id", type=str, default=None)
    parser.add_argument("--eval-partidas", type=int, default=40)
    parser.add_argument("--reanudar", type=str, default=None, help="paquete .lba del padre")
    parser.add_argument("--salida", type=str, default="modelos/candidatas")
    parser.add_argument("--dispositivo", type=str, default=None)
    args = parser.parse_args(argv)

    dispositivo = args.dispositivo or ("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(args.semilla)
    rng = np.random.default_rng(args.semilla)

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)

    run_id = args.run_id or f"{datetime.now(timezone.utc):%Y%m%d}-{args.agent_id}-{args.semilla}"
    padre_modelo: Optional[str] = None
    padre_huella: Optional[str] = None
    linaje_notas = "entrenamiento inicial por autojuego supervisado"

    red = RedPoliticaValor(3, 3, juego.ACCIONES).to(dispositivo)
    if args.reanudar:
        datos = Path(args.reanudar).read_bytes()
        archivos = lba.leer_paquete(datos)
        manifiesto = json.loads(archivos["manifest.json"].decode("utf-8"))
        if manifiesto["architecture"]["tipo"] != "conv-politica-valor-v1":
            raise SystemExit("arquitectura del paquete no soportada en este entrenador")
        if manifiesto["gameId"] != "tres-en-raya-3":
            raise SystemExit("el entrenador v1 solo reanuda cerebros de tres-en-raya-3")
        tensores = lba.leer_safetensors(archivos["training/weights.safetensors"])
        cargar_tensores(red, tensores)
        red = red.to(dispositivo)
        padre_modelo = f"{manifiesto['agentId']}@{manifiesto['brainVersion']}"
        padre_huella = lba.sha256_hex(datos)
        linaje_notas = f"reanudado desde {padre_modelo}"
        # La versión del hijo: parche+1 sobre la del padre.
        mayor, menor, parche = (int(x) for x in manifiesto["brainVersion"].split("."))
        args.version = f"{mayor}.{menor}.{parche + 1}"
        args.agent_id = manifiesto["agentId"]
    else:
        inicializar_determinista(red, args.semilla)

    # Copia congelada de la versión inicial: referencia de evaluación.
    congelada = RedPoliticaValor(3, 3, juego.ACCIONES)
    if args.reanudar:
        cargar_tensores(congelada, lba.leer_safetensors(archivos["training/weights.safetensors"]))
    else:
        congelada.load_state_dict({k: v.clone() for k, v in red.state_dict().items()})
    congelada.eval()

    mcts = MCTS(red, args.simulaciones, args.c_puct)
    optimizador = torch.optim.Adam(red.parameters(), lr=args.lr)
    buffer = BufferFIFO(args.buffer)

    registro: Dict[str, object] = {
        "runId": run_id,
        "fechaInicio": ahora_iso(),
        "versionCodigo": version_codigo(),
        "dispositivo": dispositivo,
        "torch": torch.__version__,
        "numpy": np.__version__,
        "config": {
            "tipo": "autojuego-supervisado-v1",
            "semilla": args.semilla,
            "iteraciones": args.iteraciones,
            "partidasPorIteracion": args.partidas,
            "simulacionesMCTS": args.simulaciones,
            "temperatura": 1.0,
            "dirichletAlfa": 0.03,
            "dirichletEpsilon": 0.25,
            "tamanoLote": args.lote,
            "tasaAprendizaje": args.lr,
            "pasosPorIteracion": args.pasos,
            "bufferCapacidad": args.buffer,
            "dispositivo": dispositivo,
            "versionCodigo": version_codigo(),
        },
        "iteracionesRegistradas": [],
        "estadoFinal": "en-curso",
    }

    print(f"=== Entrenamiento {run_id} en {dispositivo} (torch {torch.__version__}) ===")
    print(f"    semilla={args.semilla} iteraciones={args.iteraciones} partidas/iter={args.partidas} sims={args.simulaciones}")

    inicio_total = time.perf_counter()
    for iteracion in range(1, args.iteraciones + 1):
        # 1) Autojuego real.
        t0 = time.perf_counter()
        ejemplos_iteracion = 0
        resultados: List[Optional[int]] = []
        for partida_idx in range(args.partidas):
            ejemplos, resultado, _acciones = jugar_partida(red, mcts, rng)
            buffer.agregar(ejemplos, f"{run_id}/iter{iteracion}/p{partida_idx}")
            ejemplos_iteracion += len(ejemplos)
            resultados.append(resultado)
        t_autojuego = time.perf_counter() - t0

        # 2) Optimización real con medición de pérdida.
        t0 = time.perf_counter()
        perdidas: List[float] = []
        red.train()
        for _paso in range(args.pasos):
            if len(buffer.ejemplos) < args.lote:
                break
            planos, politica, valor = buffer.lote(args.lote, rng)
            logits, salida_valor = red(planos.to(dispositivo))
            # CE de política contra distribución de visitas + MSE de valor.
            perdida_politica = -(torch.log_softmax(logits, dim=1) * politica.to(dispositivo)).sum(dim=1).mean()
            perdida_valor = torch.nn.functional.mse_loss(salida_valor, valor.to(dispositivo))
            perdida = perdida_politica + perdida_valor
            optimizador.zero_grad()
            perdida.backward()
            optimizador.step()
            perdidas.append(float(perdida.item()))
        red.eval()
        t_entrenamiento = time.perf_counter() - t0

        perdida_media = sum(perdidas) / len(perdidas) if perdidas else None
        victorias_p1 = sum(1 for r in resultados if r == 1)
        empates_p = sum(1 for r in resultados if r == 0)
        paso_registro = {
            "iteracion": iteracion,
            "partidas": args.partidas,
            "resultados": {"jugador1": victorias_p1, "empates": empates_p, "jugador2": args.partidas - victorias_p1 - empates_p},
            "ejemplosNuevos": ejemplos_iteracion,
            "buffer": {"tamano": len(buffer.ejemplos), "descartados": buffer.descartados},
            "pasos": len(perdidas),
            "perdidaMedia": round(perdida_media, 6) if perdida_media is not None else None,
            "perdidaInicial": round(perdidas[0], 6) if perdidas else None,
            "perdidaFinal": round(perdidas[-1], 6) if perdidas else None,
            "duracionAutojuegoS": round(t_autojuego, 2),
            "duracionEntrenamientoS": round(t_entrenamiento, 2),
        }
        registro["iteracionesRegistradas"].append(paso_registro)  # type: ignore[union-attr]
        print(
            f"  iter {iteracion}: {args.partidas} partidas, {ejemplos_iteracion} ejemplos, "
            f"{len(perdidas)} pasos, pérdida {perdida_media:.4f}, "
            f"autojuego {t_autojuego:.1f}s + entrenamiento {t_entrenamiento:.1f}s"
            if perdida_media is not None
            else f"  iter {iteracion}: sin entrenamiento (buffer insuficiente)"
        )

    # 3) Evaluación real frente a rivales congelados.
    print("=== Evaluación frente a rivales congelados ===")
    t0 = time.perf_counter()
    eval_aleatorio = evaluar_contra_aleatorio(red, mcts, rng, args.eval_partidas)
    eval_congelada = evaluar_contra_congelada(red, congelada, mcts, rng, args.eval_partidas)
    t_eval = time.perf_counter() - t0
    print(f"    vs aleatorio: {eval_aleatorio['victorias']}V {eval_aleatorio['empates']}E {eval_aleatorio['derrotas']}D "
          f"(puntuación {eval_aleatorio['puntuacion']})")
    print(f"    vs inicial congelada: {eval_congelada['victorias']}V {eval_congelada['empates']}E {eval_congelada['derrotas']}D "
          f"(puntuación {eval_congelada['puntuacion']})")

    duracion_total = time.perf_counter() - inicio_total
    registro["evaluacion"] = {
        "duracionesS": {"evaluacion": round(t_eval, 2)},
        "contraAleatorio": eval_aleatorio,
        "contraInicialCongelada": eval_congelada,
    }
    registro["duracionTotalS"] = round(duracion_total, 2)
    registro["estadoFinal"] = "completado"
    registro["fechaFin"] = ahora_iso()

    # 4) Exportación .lba candidata (con la evaluación real incluida).
    pesos = exportar_tensores(red)
    pesos_bytes = lba.escribir_safetensors(pesos)
    config_entrenamiento = dict(registro["config"])  # type: ignore[arg-type]
    linaje = {
        "formatVersion": 1,
        "agentId": args.agent_id,
        "brainVersion": args.version,
        "parentModelId": padre_modelo,
        "parentPackageSha256": padre_huella,
        "motivo": "reentrenamiento" if args.reanudar else "entrenamiento-inicial",
        "notas": linaje_notas,
        "createdAt": ahora_iso(),
    }
    resumen_evaluacion = {
        "fecha": ahora_iso(),
        "juegoId": "tres-en-raya-3",
        "gameRulesVersion": "1",
        "oponentes": [
            {"id": "aleatorio-uniforme", "descripcion": "Referencia mínima (Python)", "presupuesto": f"{args.simulaciones} sims PUCT vs uniforme"},
            {"id": "version-inicial-congelada", "descripcion": "Copia congelada de la versión inicial del run", "presupuesto": f"{args.simulaciones} sims PUCT ambos"},
        ],
        "partidasPorOponente": args.eval_partidas,
        "resultados": [
            {
                "oponenteId": "aleatorio-uniforme",
                "victorias": eval_aleatorio["victorias"],
                "empates": eval_aleatorio["empates"],
                "derrotas": eval_aleatorio["derrotas"],
                "puntuacion": eval_aleatorio["puntuacion"],
                "ic95": eval_aleatorio["ic95_puntuacion"],
            },
            {
                "oponenteId": "version-inicial-congelada",
                "victorias": eval_congelada["victorias"],
                "empates": eval_congelada["empates"],
                "derrotas": eval_congelada["derrotas"],
                "puntuacion": eval_congelada["puntuacion"],
                "ic95": eval_congelada["ic95_puntuacion"],
            },
        ],
        "conclusion": (
            f"Evaluación real en Python ({args.eval_partidas} partidas por rival, alternancia de lados, "
            f"misma semilla {args.semilla}): puntuación {eval_aleatorio['puntuacion']} contra aleatorio y "
            f"{eval_congelada['puntuacion']} contra la versión inicial congelada. Sin afirmación de fuerza "
            "frente a agentes TS (minimax/MCTS) sin examen en la app (Tarea E)."
        ),
    }
    manifiesto = {
        "formatVersion": 1,
        "agentId": args.agent_id,
        "brainVersion": args.version,
        "parentModelId": padre_modelo,
        "createdAt": ahora_iso(),
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
        "trainingRunId": run_id,
        "trainingConfig": config_entrenamiento,
        "datasetLineage": {
            "origen": "autojuego",
            "partidas": args.iteraciones * args.partidas,
            "ejemplos": buffer.total_insertados,
            "semilla": args.semilla,
            "rival": None,
            "buffer": f"FIFO {args.buffer}, muestreo uniforme sin repetición por lote",
        },
        "evaluationRunIds": [f"{run_id}-eval-final"],
        "evaluationSummary": resumen_evaluacion,
    }

    datos_lba, huella = lba.construir_paquete(
        manifiesto, pesos_bytes, config_entrenamiento, linaje, resumen_evaluacion
    )
    destino_lba = salida / f"{args.agent_id}@{args.version}.lba"
    destino_lba.write_bytes(datos_lba)
    registro["paquete"] = {"ruta": str(destino_lba), "sha256": huella, "bytes": len(datos_lba)}
    registro["checkpoints"] = {"entrenable": "training/weights.safetensors dentro del .lba (safetensors F32)"}

    destino_registro = salida / f"{run_id}-registro.json"
    destino_registro.write_text(json.dumps(registro, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"=== .lba candidato: {destino_lba} ({len(datos_lba)} bytes, sha256 {huella[:16]}…) ===")
    print(f"    registro: {destino_registro}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
