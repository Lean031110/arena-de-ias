"""Mentoría y destilación (Fase 3, Tarea D).

Primer flujo de generación de ejemplos mediante un agente VETERANO real (un
paquete ``.l`` con huella verificable) y entrenamiento de una versión
candidata ALUMNA a partir de esos ejemplos.

Diseño (documentado en docs/INFORMES/FASE-3.md):
- **Veterano**: red cargada de un ``.lba`` real (se registra su identidad y
  su huella sha256). Juega partidas completas contra sí misma con MCTS-PUCT;
  cada posición visitada produce un ejemplo (observación, distribución de
  visitas del veterano como objetivo de política, resultado final z como
  objetivo de valor) — destilación conductual clásica.
- **Alumno**: red inicializada de forma DETERMINISTA (semilla registrada).
  Se evalúa ANTES del entrenamiento y DESPUÉS con el MISMO conjunto
  independiente de evaluación (semillas fijas distintas de las de
  entrenamiento; nunca se usan como datos de entrenamiento).
- **Conjunto de evaluación independiente**: rng dedicado con semilla
  ``semilla + 1_000_000``; rivales: aleatorio-uniforme y el VETERANO
  congelado. Comparación emparejada antes/después.
- **Registro**: JSON con datos de origen completos (veterano, semillas,
  partidas, ejemplos, evaluaciones antes/después) + paquete ``.lba``
  candidata exportada.

Uso::

    python -m entrenamiento.mentoria \
        --veterano modelos/versionados/red-ter-3@1.0.1.lba \
        --semilla 20261021 --partidas 48 --simulaciones 64 \
        --pasos 240 --lote 64 --agent-id red-ter-3 --version 1.1.0 \
        --salida modelos/candidatas
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from . import juego_tres_en_raya as juego
from . import lba
from .autojuego import MCTS, jugar_partida
from .entrenar import BufferFIFO, ahora_iso, version_codigo, wilson_ic
from .red import (
    RedPoliticaValor,
    cargar_tensores,
    exportar_tensores,
    inicializar_determinista,
)

SEMILLA_EVAL_INDEPENDIENTE_OFFSET = 1_000_000


def cargar_veterano(ruta: Path, dispositivo: str) -> Tuple[RedPoliticaValor, Dict[str, object]]:
    """Carga el veterano desde un .lba REAL; devuelve (red, identidad)."""
    datos = ruta.read_bytes()
    archivos = lba.leer_paquete(datos)
    manifiesto = json.loads(archivos["manifest.json"].decode("utf-8"))
    if manifiesto["architecture"]["tipo"] != "conv-politica-valor-v1":
        raise SystemExit("arquitectura del veterano no soportada")
    if manifiesto["gameId"] != "tres-en-raya-3":
        raise SystemExit("el mentor v1 solo acepta veteranos de tres-en-raya-3")
    red = RedPoliticaValor(3, 3, juego.ACCIONES)
    cargar_tensores(red, lba.leer_safetensors(archivos["training/weights.safetensors"]))
    red = red.to(dispositivo)
    red.eval()
    identidad = {
        "ruta": str(ruta),
        "agentId": manifiesto["agentId"],
        "brainVersion": manifiesto["brainVersion"],
        "huella": lba.sha256_hex(datos),
        "trainingRunId": manifiesto.get("trainingRunId"),
        "parentModelId": manifiesto.get("parentModelId"),
    }
    return red, identidad


def generar_ejemplos_veterano(
    veterano: RedPoliticaValor,
    simulaciones: int,
    c_puct: float,
    partidas: int,
    rng: np.random.Generator,
) -> Tuple[List, List[Optional[int]]]:
    """Partidas REALES del veterano contra sí misma → ejemplos de destilación."""
    mcts = MCTS(veterano, simulaciones, c_puct)
    ejemplos: List = []
    resultados: List[Optional[int]] = []
    for _ in range(partidas):
        ejemplos_partida, resultado, _acciones = jugar_partida(veterano, mcts, rng)
        ejemplos.extend(ejemplos_partida)
        resultados.append(resultado)
    return ejemplos, resultados


def entrenar_alumno(
    alumno: RedPoliticaValor,
    ejemplos: List,
    pasos: int,
    lote: int,
    lr: float,
    rng: np.random.Generator,
    dispositivo: str,
) -> List[float]:
    """Optimización supervisada del alumno con los ejemplos del veterano."""
    buffer = BufferFIFO(max(len(ejemplos), lote * 4))
    buffer.agregar(ejemplos, "mentoria/generacion")
    optimizador = torch.optim.Adam(alumno.parameters(), lr=lr)
    perdidas: List[float] = []
    alumno.train()
    for _paso in range(pasos):
        if len(buffer.ejemplos) < lote:
            break
        planos, politica, valor = buffer.lote(lote, rng)
        logits, salida_valor = alumno(planos.to(dispositivo))
        perdida_politica = -(torch.log_softmax(logits, dim=1) * politica.to(dispositivo)).sum(dim=1).mean()
        perdida_valor = torch.nn.functional.mse_loss(salida_valor, valor.to(dispositivo))
        perdida = perdida_politica + perdida_valor
        optimizador.zero_grad()
        perdida.backward()
        optimizador.step()
        perdidas.append(float(perdida.item()))
    alumno.eval()
    return perdidas


def evaluar_contra_aleatorio(
    red: RedPoliticaValor,
    mcts: MCTS,
    rng: np.random.Generator,
    partidas: int,
) -> Dict[str, object]:
    """Evaluación REAL de la red (muestreo de visitas) contra uniforme."""
    victorias = empates = derrotas = 0
    for indice in range(partidas):
        red_como_j1 = indice % 2 == 0
        estado = juego.estado_inicial()
        while juego.resultado(estado) is None:
            turno_red = (juego.jugador_actual(estado) == 1) == red_como_j1
            if turno_red:
                visitas, _ = mcts.buscar(estado)
                legales = juego.movimientos_legales(estado)
                eleccion = max(legales, key=lambda a: visitas[a])
            else:
                eleccion = int(rng.choice(juego.movimientos_legales(estado)))
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
        "oponente": "aleatorio-uniforme",
        "partidas": n,
        "victorias": victorias,
        "empates": empates,
        "derrotas": derrotas,
        "puntuacion": round(puntuacion, 4),
        "ic95_puntuacion": [round(ic[0], 4), round(ic[1], 4)],
    }


def evaluar_contra_veterano(
    red: RedPoliticaValor,
    mcts_red: MCTS,
    veterano: RedPoliticaValor,
    mcts_veterano: MCTS,
    rng: np.random.Generator,
    partidas: int,
) -> Dict[str, object]:
    """Duelo medido: red contra el VETERANO congelado (ambos PUCT)."""
    victorias = empates = derrotas = 0
    for indice in range(partidas):
        red_como_j1 = indice % 2 == 0
        estado = juego.estado_inicial()
        while juego.resultado(estado) is None:
            turno_red = (juego.jugador_actual(estado) == 1) == red_como_j1
            mcts_turno = mcts_red if turno_red else mcts_veterano
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
        "oponente": "veterano-congelado",
        "partidas": n,
        "victorias": victorias,
        "empates": empates,
        "derrotas": derrotas,
        "puntuacion": round(puntuacion, 4),
        "ic95_puntuacion": [round(ic[0], 4), round(ic[1], 4)],
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Mentoría: destilación de un veterano real en un alumno.")
    parser.add_argument("--veterano", type=str, required=True, help="ruta del .lba del veterano")
    parser.add_argument("--semilla", type=int, default=20261021)
    parser.add_argument("--partidas", type=int, default=48, help="partidas de autojuego del veterano")
    parser.add_argument("--simulaciones", type=int, default=64, help="simulaciones PUCT del veterano por jugada")
    parser.add_argument("--pasos", type=int, default=240, help="pasos de optimización del alumno")
    parser.add_argument("--lote", type=int, default=64)
    parser.add_argument("--lr", type=float, default=0.003)
    parser.add_argument("--c-puct", type=float, default=1.5)
    parser.add_argument("--eval-partidas", type=int, default=40, help="partidas por rival en la evaluación independiente")
    parser.add_argument("--agent-id", type=str, default="red-ter-3")
    parser.add_argument("--version", type=str, default="1.1.0")
    parser.add_argument("--salida", type=str, default="modelos/candidatas")
    parser.add_argument("--run-id", type=str, default=None)
    parser.add_argument("--dispositivo", type=str, default=None)
    args = parser.parse_args(argv)

    dispositivo = args.dispositivo or ("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(args.semilla)
    rng_datos = np.random.default_rng(args.semilla)
    # Conjunto de evaluación INDEPENDIENTE: semilla dedicada, nunca usada
    # para generar datos de entrenamiento (documentado en el registro).
    rng_eval = np.random.default_rng(args.semilla + SEMILLA_EVAL_INDEPENDIENTE_OFFSET)

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    run_id = args.run_id or (
        f"{datetime.now(timezone.utc):%Y%m%d}-{args.agent_id}-mentoria-{args.semilla}"
    )

    veterano, identidad_veterano = cargar_veterano(Path(args.veterano), dispositivo)
    print(f"=== Mentoría {run_id} en {dispositivo} (torch {torch.__version__}) ===")
    print(
        f"    veterano: {identidad_veterano['agentId']}@{identidad_veterano['brainVersion']} "
        f"(huella {str(identidad_veterano['huella'])[:16]}…)"
    )

    # Alumno: inicialización determinista (evaluable ANTES de entrenar).
    alumno = RedPoliticaValor(3, 3, juego.ACCIONES).to(dispositivo)
    inicializar_determinista(alumno, args.semilla)
    alumno.eval()
    pesos_iniciales = {k: v.clone() for k, v in alumno.state_dict().items()}

    mcts_alumno = MCTS(alumno, args.simulaciones, args.c_puct)
    mcts_veterano = MCTS(veterano, args.simulaciones, args.c_puct)

    inicio_total = time.perf_counter()

    # 1) Evaluación ANTES (mismo conjunto independiente que después).
    print(f"=== Evaluación ANTES del entrenamiento ({args.eval_partidas} partidas/rival, semillas independientes) ===")
    t0 = time.perf_counter()
    antes_aleatorio = evaluar_contra_aleatorio(alumno, mcts_alumno, rng_eval, args.eval_partidas)
    antes_veterano = evaluar_contra_veterano(alumno, mcts_alumno, veterano, mcts_veterano, rng_eval, args.eval_partidas)
    t_antes = time.perf_counter() - t0
    print(f"    vs aleatorio: {antes_aleatorio['victorias']}V {antes_aleatorio['empates']}E {antes_aleatorio['derrotas']}D "
          f"(puntuación {antes_aleatorio['puntuacion']})")
    print(f"    vs veterano: {antes_veterano['victorias']}V {antes_veterano['empates']}E {antes_veterano['derrotas']}D "
          f"(puntuación {antes_veterano['puntuacion']})")

    # 2) Generación de ejemplos por el veterano (partidas reales).
    t0 = time.perf_counter()
    ejemplos, resultados = generar_ejemplos_veterano(
        veterano, args.simulaciones, args.c_puct, args.partidas, rng_datos
    )
    t_generacion = time.perf_counter() - t0
    v1 = sum(1 for r in resultados if r == 1)
    emp = sum(1 for r in resultados if r == 0)
    print(f"=== El veterano generó {len(ejemplos)} ejemplos en {args.partidas} partidas "
          f"({v1}V1/{emp}E/{args.partidas - v1 - emp}V2) en {t_generacion:.1f}s ===")

    # 3) Entrenamiento del alumno con los ejemplos del veterano.
    t0 = time.perf_counter()
    perdidas = entrenar_alumno(
        alumno, ejemplos, args.pasos, args.lote, args.lr, rng_datos, dispositivo
    )
    t_entrenamiento = time.perf_counter() - t0
    cambio_pesos = any(
        not torch.equal(pesos_iniciales[k], alumno.state_dict()[k]) for k in pesos_iniciales
    )
    perdida_media = sum(perdidas) / len(perdidas) if perdidas else None
    print(f"=== Alumno entrenado: {len(perdidas)} pasos, pérdida media {perdida_media:.4f}, "
          f"pesos cambiados: {cambio_pesos}, {t_entrenamiento:.1f}s ===")

    # 4) Evaluación DESPUÉS (mismo conjunto independiente).
    print(f"=== Evaluación DESPUÉS del entrenamiento ({args.eval_partidas} partidas/rival) ===")
    t0 = time.perf_counter()
    mcts_alumno = MCTS(alumno, args.simulaciones, args.c_puct)
    despues_aleatorio = evaluar_contra_aleatorio(alumno, mcts_alumno, rng_eval, args.eval_partidas)
    despues_veterano = evaluar_contra_veterano(alumno, mcts_alumno, veterano, mcts_veterano, rng_eval, args.eval_partidas)
    t_despues = time.perf_counter() - t0
    print(f"    vs aleatorio: {despues_aleatorio['victorias']}V {despues_aleatorio['empates']}E {despues_aleatorio['derrotas']}D "
          f"(puntuación {despues_aleatorio['puntuacion']})")
    print(f"    vs veterano: {despues_veterano['victorias']}V {despues_veterano['empates']}E {despues_veterano['derrotas']}D "
          f"(puntuación {despues_veterano['puntuacion']})")

    duracion_total = time.perf_counter() - inicio_total

    # 5) Registro con datos de origen completos y exportación .lba candidata.
    registro: Dict[str, object] = {
        "runId": run_id,
        "tipo": "mentoria-destilacion-v1",
        "fechaInicio": ahora_iso(),
        "versionCodigo": version_codigo(),
        "dispositivo": dispositivo,
        "torch": torch.__version__,
        "numpy": np.__version__,
        "origen": {
            "veterano": identidad_veterano,
            "alumnoInit": "aleatorio-determinista",
            "semillaAlumno": args.semilla,
            "semillaEvaluacionIndependiente": args.semilla + SEMILLA_EVAL_INDEPENDIENTE_OFFSET,
        },
        "config": {
            "tipo": "mentoria-destilacion-v1",
            "semilla": args.semilla,
            "partidasVeterano": args.partidas,
            "simulacionesMCTS": args.simulaciones,
            "cPuct": args.c_puct,
            "pasosAlumno": args.pasos,
            "tamanoLote": args.lote,
            "tasaAprendizaje": args.lr,
            "evalPartidasPorRival": args.eval_partidas,
            "dispositivo": dispositivo,
            "versionCodigo": version_codigo(),
        },
        "datosGenerados": {
            "partidas": args.partidas,
            "ejemplos": len(ejemplos),
            "resultadosVeterano": {
                "jugador1": v1,
                "empates": emp,
                "jugador2": args.partidas - v1 - emp,
            },
            "duracionGeneracionS": round(t_generacion, 2),
        },
        "entrenamientoAlumno": {
            "pasos": len(perdidas),
            "perdidaMedia": round(perdida_media, 6) if perdida_media is not None else None,
            "perdidaInicial": round(perdidas[0], 6) if perdidas else None,
            "perdidaFinal": round(perdidas[-1], 6) if perdidas else None,
            "pesosCambiaron": bool(cambio_pesos),
            "duracionEntrenamientoS": round(t_entrenamiento, 2),
        },
        "evaluacionIndependiente": {
            "descripcion": (
                "mismo conjunto emparejado antes/después; semilla dedicada "
                "(semilla + 1_000_000), jamás usada como dato de entrenamiento"
            ),
            "antes": {
                "contraAleatorio": antes_aleatorio,
                "contraVeterano": antes_veterano,
            },
            "despues": {
                "contraAleatorio": despues_aleatorio,
                "contraVeterano": despues_veterano,
            },
            "duracionesS": {
                "antes": round(t_antes, 2),
                "despues": round(t_despues, 2),
            },
        },
        "duracionTotalS": round(duracion_total, 2),
        "estadoFinal": "completado",
        "fechaFin": ahora_iso(),
    }

    config_entrenamiento = {
        "tipo": "autojuego-supervisado-v1",
        "semilla": args.semilla,
        "iteraciones": 1,
        "partidasPorIteracion": args.partidas,
        "simulacionesMCTS": args.simulaciones,
        "temperatura": 1.0,
        "dirichletAlfa": 0.03,
        "dirichletEpsilon": 0.25,
        "tamanoLote": args.lote,
        "tasaAprendizaje": args.lr,
        "pasosPorIteracion": args.pasos,
        "bufferCapacidad": max(len(ejemplos), args.lote * 4),
        "dispositivo": dispositivo,
        "versionCodigo": version_codigo(),
    }
    linaje = {
        "formatVersion": 1,
        "agentId": args.agent_id,
        "brainVersion": args.version,
        "parentModelId": f"{identidad_veterano['agentId']}@{identidad_veterano['brainVersion']}",
        "parentPackageSha256": identidad_veterano["huella"],
        "motivo": "reentrenamiento",
        "notas": (
            f"mentoría/destilación: ejemplos generados por el veterano "
            f"{identidad_veterano['agentId']}@{identidad_veterano['brainVersion']}; "
            f"alumno inicializado aleatorio-determinista con semilla {args.semilla}"
        ),
        "createdAt": ahora_iso(),
    }
    resumen_evaluacion = {
        "fecha": ahora_iso(),
        "juegoId": "tres-en-raya-3",
        "gameRulesVersion": "1",
        "oponentes": [
            {"id": "aleatorio-uniforme", "descripcion": "Referencia mínima (Python)", "presupuesto": f"{args.simulaciones} sims PUCT vs uniforme"},
            {"id": "veterano-congelado", "descripcion": f"Veterano {identidad_veterano['agentId']}@{identidad_veterano['brainVersion']}", "presupuesto": f"{args.simulaciones} sims PUCT ambos"},
        ],
        "partidasPorOponente": args.eval_partidas,
        "resultados": [
            {
                "oponenteId": "aleatorio-uniforme",
                "victorias": despues_aleatorio["victorias"],
                "empates": despues_aleatorio["empates"],
                "derrotas": despues_aleatorio["derrotas"],
                "puntuacion": despues_aleatorio["puntuacion"],
                "ic95": despues_aleatorio["ic95_puntuacion"],
            },
            {
                "oponenteId": "veterano-congelado",
                "victorias": despues_veterano["victorias"],
                "empates": despues_veterano["empates"],
                "derrotas": despues_veterano["derrotas"],
                "puntuacion": despues_veterano["puntuacion"],
                "ic95": despues_veterano["ic95_puntuacion"],
            },
        ],
        "conclusion": (
            f"Evaluación independiente emparejada ({args.eval_partidas} partidas/rival, semilla "
            f"{args.semilla + SEMILLA_EVAL_INDEPENDIENTE_OFFSET}): ANTES {antes_aleatorio['puntuacion']} vs "
            f"{antes_veterano['puntuacion']}; DESPUÉS {despues_aleatorio['puntuacion']} vs "
            f"{despues_veterano['puntuacion']}. Sin afirmación de fuerza frente a agentes TS sin examen."
        ),
    }
    manifiesto = {
        "formatVersion": 1,
        "agentId": args.agent_id,
        "brainVersion": args.version,
        "parentModelId": f"{identidad_veterano['agentId']}@{identidad_veterano['brainVersion']}",
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
            "origen": "partidas-importadas",
            "partidas": args.partidas,
            "ejemplos": len(ejemplos),
            "semilla": args.semilla,
            "rival": f"veterano:{identidad_veterano['agentId']}@{identidad_veterano['brainVersion']}",
            "buffer": f"FIFO {max(len(ejemplos), args.lote * 4)}, muestreo uniforme sin repetición por lote",
        },
        "evaluationRunIds": [f"{run_id}-eval-independiente"],
        "evaluationSummary": resumen_evaluacion,
    }

    pesos_bytes = lba.escribir_safetensors(exportar_tensores(alumno))
    datos_lba, huella = lba.construir_paquete(
        manifiesto, pesos_bytes, config_entrenamiento, linaje, resumen_evaluacion
    )
    destino_lba = salida / f"{args.agent_id}@{args.version}.lba"
    destino_lba.write_bytes(datos_lba)
    registro["paquete"] = {"ruta": str(destino_lba), "sha256": huella, "bytes": len(datos_lba)}
    registro["checkpoints"] = {"entrenable": "training/weights.safetensors dentro del .lba (safetensors F32)"}

    destino_registro = salida / f"{run_id}-registro.json"
    destino_registro.write_text(json.dumps(registro, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"=== .lba candidata del alumno: {destino_lba} ({len(datos_lba)} bytes, sha256 {huella[:16]}…) ===")
    print(f"    registro: {destino_registro}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
