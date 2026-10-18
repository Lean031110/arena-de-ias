# Criterios de aceptación por fase

Una fase se declara **completada** solo si todos sus criterios obligatorios están
verificados con evidencia real (prueba, artefacto o ejecución registrada). En caso
contrario se declara **parcialmente completada** o **bloqueada**, citando los criterios
fallidos.

## Fase 0 — Arquitectura, auditoría y plan

1. Auditoría real del entorno registrada (herramientas, versiones, conectividad). ✅
2. README inicial con instrucciones reales. ✅
3. Documento de arquitectura. ✅
4. Registro de decisiones (ADR) iniciado. ✅
5. Modelo de datos inicial (registros, eventos, huella, fórmulas). ✅
6. Plan de pruebas. ✅
7. Criterios de aceptación (este documento). ✅
8. Riesgos y mitigaciones. ✅
9. Catálogo de juegos con reglas y estados. ✅
10. No se afirma que la aplicación esté construida. ✅ (solo documentación y plan)

## Fase 1 — Motor, tests, niveles y evaluación

Obligatorios (todos verificables):

1. Contratos `Juego` y `Agente` implementados con TypeScript estricto sin errores.
2. Seis variantes de juego operativas (3×3, 4×4, Gomoku 7/9/15, Cuatro en raya 7×6) con
   pruebas de reglas verdes.
3. Imposibilidad de movimientos ilegales probada por juego.
4. Partidas terminadas no continúan (probado).
5. Resultado final conforme a reglas (probado).
6. Reproducción determinista de partidas (probado; misma semilla ⇒ misma secuencia y
   resultado).
7. Semillas registradas y derivación controlada (probado).
8. Serialización ida/vuelta (probada, incluida propiedad sobre estados aleatorios).
9. Simetrías declaradas preservan legalidad/terminalidad (probado).
10. Minimax respeta presupuesto de profundidad y nodos (probado).
11. MCTS respeta presupuesto exacto de simulaciones (probado).
12. Solucionador exacto coincide con referencia conocida: 3×3 ⇒ empate (probado);
    4×4 resuelto dentro del presupuesto con consistencia padre/hijo (probado).
13. Ejecutor de partidas con registro completo (semilla, versiones, configs, movimientos,
    resultado, tiempos, estadísticas de búsqueda, validez, huella) — probado.
14. Validación de replay aplicada a cada partida terminada — probado.
15. Evaluación round-robin con alternancia de lados y resúmenes con IC Wilson — probado.
16. Al menos una evaluación real ejecutada con ≥ 4 agentes y ≥ 40 partidas por par,
    artefacto JSON versionado con resultados reales (script de medición).
17. Interfaz ejecutable en español: arena con partida interactiva (humano/IA), tablero
    por juego, evaluación con progreso real, resultados con IC, registro de eventos,
    catálogo de agentes, exportación JSON/CSV, tema claro/oscuro, estados vacíos
    informativos, accesibilidad básica (teclado, contraste, `prefers-reduced-motion`).
18. Build de producción exitoso; trabajador web incluido en el bundle.
19. CI de GitHub Actions verde en el commit final (typecheck + lint + pruebas + build),
    verificado vía API con resultados reales.
20. Red neuronal: contrato definido y visible con estado «Pendiente» — **criterio
    declarado NO completado en Fase 1** (diferido a Fase 2 según ADR-008; sin datos ni
    interfaces simuladas).

Extraibles de 17-19: la fase se declara «completada» con la salvedad explícita del
criterio 20 y de las coberturas no automatizadas listadas en PLAN_PRUEBAS §4.

## Fase 2 — Memoria, identidad y panel experimental (pendiente)

1. Agente con cerebro persistido: guardar/cargar/clonar/ramificar/versionar.
2. Paquete de exportación con manifiesto versionado, metadatos y huella; importación
   validada; paquete inválido no corrompe datos existentes (probado).
3. Entrenamiento por autojuego con red de política/valor real; pérdidas reales medidas y
   registradas; ninguna mejora declarada sin evaluación contra referencia congelada
   (ADR-007).
4. Panel experimental: cada indicador con fuente, método y marca temporal; series vacías
   mostradas como vacías (sin puntos inventados).
5. Migraciones protegidas y errores de almacenamiento visibles.
6. Checkpoints de trabajos largos y reanudación sin duplicación de eventos (probado).

## Fase 3 — Equipos, plantel y mentoría (pendiente)

1. Modo consulta con registro de propuestas, agregación y decisión (probado).
2. Modo parejas con protocolo documentado (probado).
3. Mentoría con registro de ejemplos y evaluación de alumnos (probado).
4. Experimento registrado: ¿la cooperación mejora fuerza / reduce errores / aumenta coste?

## Fase 4 — Torneos, ratings (pendiente)

1. Round-robin, eliminatoria y suizo con emparejamientos validados (probado).
2. Elo y Glicko-2 contra casos de referencia públicos (probado).
3. Idempotencia: re-registrar una partida no actualiza dos veces (probado).
4. Reanudación de torneos sin duplicar resultados (probado).
5. Historial de rankings exportable y rastreable.

## Fase 5 — Expansión, descubrimiento, garantías (pendiente)

1. Las 15 variantes operativas con reglas documentadas y probadas.
2. Detector de patrones con estados de validación diferenciados.
3. Libro de estrategias con búsqueda/filtros/exportación.
4. Certificaciones «no perder» solo con solucionador completado y artefacto versionado;
   incertidumbre empírica declarada en variantes no resueltas.

## Promoción entre niveles (definición operativa, ADR-007)

Un cerebro `aspirante` se promueve al nivel `n+1` cuando, contra el mejor agente del
nivel `n` (referencia congelada y archivada):

- ≥ 200 partidas alternando lados (100 por color), semillas registradas;
- puntuación ≥ 0.60;
- límite inferior del IC 95 % (Wilson) de la puntuación > 0.55.

Cualquier declaración de promoción debe citar el `RegistroEvaluación` que la respalda.
