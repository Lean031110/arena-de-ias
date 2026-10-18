# Registro de decisiones técnicas (ADR)

Formato: contexto → decisión → consecuencias. Append-only; las decisiones se derogan
añadiendo una nueva, nunca editando la antigua.

---

## ADR-001 — React + TypeScript + Vite; NO Next.js

**Contexto.** La especificación maestra (PROMPT_MAESTRO §4) exige expresamente React +
TypeScript + Vite sin Next.js, con núcleo ejecutable sin conexión y sin backend
obligatorio. El andamiaje Next.js añade un servidor de renderizado y dependencias que
contradicen esos requisitos.

**Decisión.** Aplicación de página única con Vite 8.3.4, React 19.3.1 y TypeScript
5.9.3 estricto. Sin Next.js, sin SSR, sin backend en Fase 1.

**Consecuencias.** Despliegue trivial (archivos estáticos); funcionamiento sin conexión;
pruebas del dominio en Node puro. Se pierden las ventajas de SSR (irrelevantes para esta
aplicación local-first).

## ADR-002 — Tipos borrados confinados a los registros/catálogos

**Contexto.** El motor es genérico sobre `Juego<S, M>`, pero los catálogos (lista de
juegos, lista de agentes) y el ejecutor de partidas manejan juegos heterogéneos en
tiempo de ejecución.

**Decisión.** Cada registro expone un alias `JuegoConcreto = Juego<any, any>` con un único
punto de borrado de tipos por catálogo, comentado y justificado. El resto del código es
genérico o totalmente tipado. `any` queda prohibido fuera de esos alias.

**Consecuencias.** Heterogeneidad manejable sin `unknown` + castings dispersos; el
borrado está localizado y auditable en revisión de código.

## ADR-003 — RNG propio mulberry32 con semilla por partida

**Contexto.** Reproducibilidad exigida: `Math.random` no es semillable.

**Decisión.** `crearRng(semilla)` con mulberry32 (32 bits, calidad suficiente para
juegos por turnos y rollouts). Semilla raíz por partida; semillas derivadas por agente y
número de jugada mediante una función de mezcla documentada y probada. La semilla y su
derivación se registran en el `RegistroPartida`.

**Consecuencias.** Partidas reproducibles bit a bit dentro del mismo motor JS (V8).
Advertencia documentada: entre motores distintos (p. ej. V8 vs SpiderMonkey) las
operaciones de coma flotante podrían divergir en casos patológicos (ver RIESGOS.md).

## ADR-004 — Pruebas de propiedades con bucles deterministas propios (sin fast-check)

**Contexto.** La especificación pide pruebas basadas en propiedades «cuando sea viable».
`fast-check` es viable pero añade una dependencia y una fuente adicional de
no-determinismo entre versiones.

**Decisión.** Bucles de propiedades propios sobre el RNG del dominio (200-500 casos por
propiedad, semillas fijas). Invariantes: replay válido de partidas aleatorias, ida/vuelta
de serialización, preservación de legalidad por simetrías.

**Consecuencias.** Cero dependencias extra; propiedades 100 % deterministas y trazables a
semillas; sin shrinking automático (mitigado con mensajes de error detallados que
incluyen la semilla del caso).

## ADR-005 — Huella de integridad FNV-1a de 32 bits sobre el núcleo determinista

**Contexto.** Se exige huella de integridad y, a la vez, honestidad sobre sus límites.

**Decisión.** FNV-1a de 32 bits sobre el contenido determinista del registro (semilla,
juego y versión, agentes y configs, movimientos en notación, resultado, validez). Se
excluyen expresamente fechas, tiempos y entorno (varían entre ejecuciones de la misma
partida).

**Consecuencias.** Detección de corrupción/duplicado accidental; NO es prueba
criptográfica de autenticidad ni de que el evento ocurrió (documentado en
MODELO_DATOS.md §7). Fase 2 puede elevar a SHA-256 vía WebCrypto sin cambiar el contrato.

## ADR-006 — IndexedDB como fuente local de verdad (Fase 1)

**Contexto.** Ejecución sin conexión y sin backend obligatorio.

**Decisión.** IndexedDB `arena-de-ias` v1 con almacenes `partidas`, `evaluaciones`,
`eventos`. Validación con Zod al leer y al cruzar bordes de confianza. Detección de
no-disponibilidad con degradación a memoria y aviso en la interfaz.

**Consecuencias.** Datos sobreviven a recargas. La reanudación de trabajos largos
(evaluaciones interrumpidas) se aborda en Fase 2 con checkpoints; en Fase 1 una
interrupción se registra como evento y las partidas ya completadas quedan guardadas.

## ADR-007 — Niveles de agente y política de promoción

**Contexto.** El plan exige niveles de referencia y criterios de promoción entre niveles.

**Decisión.** Niveles: 1 aleatorio, 2 heurístico, 3 minimax α-β, 4 MCTS, 5 red neuronal
(pendiente). Promoción de un cerebro entrenado (Fase 2+): el aspirante debe superar al
mejor agente del nivel inferior en ≥ 200 partidas alternando lados, con puntuación
≥ 0.60 y límite inferior del IC 95 % (Wilson) > 0.55, medida contra una referencia
**congelada** (versión archivada, no actualizable durante el examen).

**Consecuencias.** Criterio objetivo, pre-registrado y reproducible; ninguna promoción se
declara sin su experimento registrado.

## ADR-008 — Red neuronal diferida a Fase 2 con estado «Pendiente» explícito

**Contexto.** La especificación pide «primera red de política y valor» en Fase 1 y, a la
vez, prohíge presentar interfaces como funciones terminadas. La §13 marca la evolución:
referencia → MCTS → red. Integrar TensorFlow.js + autojuego + evaluación de versiones con
garantías de integridad es una fase de trabajo por derecho propio.

**Decisión.** En Fase 1 se define el contrato (`AgenteNeural`, presupuesto, versionado de
cerebros) y se muestra en la UI con estado «Pendiente», sin pesos ni métricas simuladas.
El entrenamiento (autojuego, buffer, simetrías, promoción ADR-007) entra en Fase 2.

**Consecuencias.** Ningún dato de red puede aparecer en paneles (no existen). El informe
de Fase 1 declara esta parte como no completada y sus criterios quedan en Fase 2.

## ADR-009 — Estadística: puntuación (V + E/2) e IC de Wilson al 95 %

**Contexto.** Se exige intervalo de confianza con método declarado; las partidas son
binarias/ternarias y las muestras modestas.

**Decisión.** Métrica principal: puntuación media = (victorias + empates/2) / partidas.
IC de Wilson (score) al 95 % (z = 1.959964), robusto en muestras pequeñas. Alternancia de
lados por diseño pareado; las semillas se agrupan y registran. Documentado que el IC no es
garantía absoluta.

**Consecuencias.** Informes con incertidumbre honesta; comparaciones exigibles por IC.
Elo/Glicko-2 con sus propias fórmulas entran en Fase 4.

## ADR-010 — TypeScript 5.9.3 (no 7.x) y ESLint 10

**Contexto.** Auditoría 2026-10-18: TypeScript 7.0.2 es latest pero `typescript-eslint`
8.71.2 declara soporte `>=4.8.4 <6.1.0`; ESLint 10.13.0 sí está soportado (`^10.0.0`).

**Decisión.** typescript@5.9.3 + eslint@10.13.0 + @eslint/js@10.0.1 +
typescript-eslint@8.71.2, todos con versión exacta. Se reevaluará cuando typescript-eslint
declare soporte de TS ≥ 7.

**Consecuencias.** Herramientas garantizadamente compatibles; ninguna advertencia de
versión no soportada.

## ADR-011 — Estados viajan codificados entre hilos

**Contexto.** El trabajador web recibe posiciones; los objetos de dominio son planos pero
heterogéneos por juego.

**Decisión.** Los mensajes cruzan la frontera con `juego.codificar(estado)` (texto JSON)
y el trabajador decodifica con el mismo registro de juegos. Coste despreciable frente al
cómputo de búsqueda; fuerza la corrección del par codificar/decodificar en cada jugada.

**Consecuencias.** Protocolo de mensajes simple y auditable; serialización ejercitada
constantemente (más garantías de ida/vuelta en la práctica).

## ADR-012 — Versiones exactas + package-lock.json versionado

**Contexto.** Reproducibilidad de builds y CI.

**Decisión.** Todas las dependencias con versión exacta (sin `^`/`~`), `package-lock.json`
en el repositorio, CI con `npm ci`. Runtime: react, react-dom, zod. Desarrollo: vite,
@vitejs/plugin-react, vitest, typescript, eslint y complementos, fake-indexeddb, tsx,
@types/react(-dom).

**Consecuencias.** Instalaciones idénticas en el tiempo; actualizaciones deliberadas y
documentadas (nuevo ADR).

## ADR-013 — Solucionador exacto genérico con tabla de transposición y simetrías

**Contexto.** La Fase 1 exige verificación contra casos de referencia conocidos y la Fase 5
certificaciones de «no perder».

**Decisión.** `motor/solucionador.ts`: negamax exhaustivo (sin límite de profundidad) con
tabla de transposición indexada por clave canónica mínima entre simetrías declaradas,
contadores de nodos y presupuesto de tiempo de seguridad. Resultado: valor del juego desde
el jugador 1 (+1/0/−1) + jugadas óptimas. Solo se declara «resuelto» lo que este
solucionador (o uno específico mejor) termina dentro de su presupuesto, con artefacto JSON
de la ejecución.

**Consecuencias (medidas, no supuestas).** Tres en raya 3×3 se resuelve y verifica contra la referencia pública (empate con juego perfecto; 2.271 nodos, ~18 ms). Tres en raya 4×4 TAMBIÉN se resolvió localmente con el solucionador genérico (6.460.009 nodos, 48,6 s con presupuesto de 240 s): **empate con juego perfecto**, con consistencia padre/hijo verificada — véase el artefacto `docs/INFORMES/datos/solucionador-fase1.json`. El borrador inicial de este ADR predecía erróneamente que el 4×4 sería resoluble «en milisegundos» y que no cabía resolverlo en CI: la medición real mostró ~49 s (viable como medición fuera de CI, no como prueba unitaria de 2 vCPU). Gomoku y cuatro en raya 7×6 exceden cualquier presupuesto razonable del solucionador genérico y quedan «no resueltos localmente» hasta incorporar solucionadores especializados con poda alfa-beta y bandas en la TT (Fase 5).
