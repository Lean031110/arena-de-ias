# Riesgos y mitigaciones

Revisión: Fase 1. Severidad: 🔴 alta / 🟠 media / 🟢 baja.

| # | Riesgo | Severidad | Mitigación implementada / prevista |
|---|---|---|---|
| R1 | MCTS y minimax lentos en Gomoku 15×15 (navegadores modestos) | 🟠 | Presupuestos configurables con topes por defecto conservadores; ejecución en Web Worker (el hilo principal nunca se bloquea en evaluaciones); UI advierte de coste en tableros grandes. |
| R2 | Memoria: nodos MCTS con estado completo por nodo | 🟠 | Presupuesto de simulaciones como límite de nodos (≤ simulaciones+1); Fase 2: liberar estados tras backprop si el perfil lo exige (medir antes de optimizar). |
| R3 | Divergencia numérica entre motores JS (V8/SpiderMonkey/JavaScriptCore) al reproducir una semilla | 🟢 | Documentado en MODELO_DATOS §11. La reproducibilidad se garantiza y se prueba dentro del mismo motor; los artefactos de medición registran plataforma y versión. |
| R4 | IndexedDB no disponible (modo privado, cuota) | 🟠 | Detección con degradación a memoria + aviso visible en la UI + evento de error registrado. La sesión sigue siendo funcional. |
| R5 | Interrupción de evaluaciones largas (recarga/cierre) | 🟠 | Fase 1: cancelación explícita guarda las partidas ya completadas y registra el evento. Fase 2: checkpoints persistentes y reanudación sin duplicar (criterio Fase 2.6). No se promete continuidad tras cerrar el navegador. |
| R6 | Corrupción de registros en almacenamiento | 🟠 | Huella FNV + validación Zod al leer; registro corrupto se aísla como error y no se mezcla con datos válidos. |
| R7 | Solucionador 4×4 excesivamente lento en CI de 2 vCPU | 🟠 | Presupuesto de tiempo de seguridad; medición local antes de fijar la prueba; si se agota el presupuesto la prueba falla (no se declara resuelto). Medido: ver informe de Fase 1. |
| R8 | WebGPU no disponible | 🟢 | Fase 1 no usa TensorFlow.js ni WebGPU. La Fase 2 detectará capacidades y degradará a CPU/WASM sin datos inventados de GPU. |
| R9 | Dependencias abandonadas o con vulnerabilidades | 🟠 | Versiones exactas + lock versionado; `npm audit` en revisión manual periódica; superficie mínima (3 deps de runtime). |
| R10 | Crecimiento del registro experimental (cuota IndexedDB) | 🟠 | Las evaluaciones guardan todas las partidas (necesarias para auditoría). Previsto: compactación explícita por usuario con manifiesto de qué se conservó (Fase 2), nunca borrado silencioso. |
| R11 | Token de GitHub filtrado al repositorio | 🔴 | Almacenado fuera del repo (permisos 600), usado por credenciales de git y cabeceras de API; `.gitignore` defensivo; revisión de diff antes de cada push (protocolo §3.I). |
| R12 | Falsos «verde» en CI (pruebas no ejecutadas realmente) | 🔴 | `vitest run` con recuento de pruebas impreso; verificación del run de Actions vía API con conclusiones reales por paso; el informe de fase cita run id y conclusiones. |
| R13 | Sobrescribir trabajo del usuario en el repositorio | 🟠 | Auditoría inicial (repo vacío en Fase 0); commits lógicos por área; revisión de `git status`/diff antes de cada commit. |
| R14 | Complejidad de la Fase 2 (entrenamiento en navegador) | 🟠 | Evolución por fases ya definida (referencia → MCTS → red); contratos preparados (AgenteNeural, versionado de cerebros); presupuesto de entrenamiento configurable y abortable. |

## Limitaciones conocidas declaradas (Fase 1)

- Sin entrenamiento de redes: cualquier métrica de aprendizaje muestra «Sin datos».
- Solo 6 de 15 variantes de juego implementadas (catálogo completo con estados en
  `docs/JUEGOS.md`).
- La reanudación de trabajos largos no está implementada (solo cancelación con guardado
  de lo completado).
- La reproducibilidad de partidas está verificada dentro de V8/Node; no se ha verificado
  entre navegadores distintos.
- El explorador de árboles de búsqueda (visitas, política previa/posterior) está previsto
  para Fase 2 con MCTS guiado por red; en Fase 1 se muestran estadísticas agregadas
  (nodos, simulaciones, profundidad) medidas realmente.
