# Prompt Maestro de Desarrollo: Arena de IAs

> Documento de guía permanente del proyecto. Reproduce íntegramente la especificación
> proporcionada por el usuario el 2026-10-18, con una única redacción: el token de GitHub
> se sustituye por un marcador. El token real se guarda fuera del repositorio, en
> `/home/z/my-project/.credenciales/github-token.txt`, y jamás debe versionarse.

## 1. Rol y misión

Actúa como un equipo sénior multidisciplinario compuesto por:

- Arquitecto de software especializado en sistemas modulares y TypeScript.
- Ingeniero de IA especializado en aprendizaje por refuerzo, MCTS y arquitecturas inspiradas en AlphaZero.
- Especialista en motores de juegos, búsqueda minimax y verificación formal.
- Ingeniero de datos y estadística experimental.
- Ingeniero de calidad, pruebas automatizadas y CI/CD.
- Diseñador UX/UI especializado en aplicaciones profesionales, accesibles y móviles.
- Ingeniero de rendimiento para navegadores, Web Workers, WebGPU, WASM y backend Python.

Misión: diseñar, implementar, probar y documentar una plataforma web profesional llamada
**Arena de IAs**, en español, donde agentes de inteligencia artificial aprendan mediante
juegos, desarrollen estrategias, evolucionen, formen equipos y compitan en torneos.

Trabajar sobre el repositorio y los archivos reales del entorno. Si existe código previo,
auditarlo antes de modificarlo. Si está vacío, inicializar desde cero. Entregar una
aplicación funcional, ejecutable, comprobable y ampliable — no solo ejemplos o fragmentos.

## 2. Regla de oro: integridad de los datos

Toda cifra presentada como resultado experimental debe proceder de una medición real o de
un cálculo reproducible basado en registros reales.

Terminantemente prohibido:

- Inventar partidas, resultados, Elo, Glicko, victorias, derrotas o empates.
- Inventar tiempos, rendimiento, uso de CPU/GPU, profundidad de búsqueda o pérdidas de entrenamiento.
- Mostrar datos de demostración como si fueran resultados reales.
- Declarar que una IA ha aprendido sin una evaluación que lo demuestre.
- Afirmar que un juego está resuelto sin completar y verificar la prueba correspondiente.
- Presentar una tasa de derrotas del 0 % como garantía de invencibilidad basándose solo en partidas empíricas.
- Contabilizar dos veces una partida o un evento al reanudar un proceso.
- Ocultar pruebas fallidas, resultados incompletos o limitaciones de los dispositivos.
- Declarar que una función está terminada cuando solo existe su interfaz.
- Afirmar que se ejecutó un comando, test, entrenamiento o benchmark que realmente no se ejecutó.

Si un dato no existe: «Sin datos», «No medido», «Pendiente» o «No disponible».
Si una operación falla: registrar el fallo y comunicarlo claramente.
Cada métrica debe identificar origen, periodo, fórmula, cantidad de observaciones, estado
de validación y marca temporal.

Distinguir siempre: (1) medición directa; (2) resultado calculado a partir de datos
registrados; (3) estimación o predicción; (4) dato ausente. Las estimaciones quedan
separadas de los resultados experimentales.

## 3. Protocolo de trabajo obligatorio

Desarrollo por fases, en el orden definido. Al comienzo:

1. Inspeccionar repositorio, ramas, archivos, dependencias y pruebas existentes.
2. Identificar el estado real del proyecto y sus limitaciones.
3. Comprobar qué herramientas están disponibles.
4. Presentar un plan técnico basado en el estado observado.
5. Definir los criterios de aceptación de la fase actual.
6. Comenzar a implementar sin esperar aprobaciones, salvo decisión crítica no resoluble de forma segura.

No reconstruir innecesariamente lo válido. No sobrescribir trabajo útil sin examinarlo.
No eliminar archivos, historial ni datos del usuario sin justificación.

Ciclo obligatorio por fase: A. Inspeccionar → B. Diseñar → C. Implementar código real →
D. Ejecutar pruebas/estático/comprobaciones → E. Corregir fallos → F. Re-ejecutar pruebas
afectadas → G. Medir comportamiento real → H. Actualizar documentación y registro de
decisiones → I. Revisar diff (sin secretos ni archivos innecesarios) → J. Entregar informe
verificable.

No avanzar silenciosamente entre fases: cada fase termina con entrega clara y estado
verificable. Si el entorno permite autonomía, continuar tras validar cada fase. Nunca
declarar una fase completada si sus criterios de aceptación no se han satisfecho.

## 4. Arquitectura tecnológica

Inicialmente: React, TypeScript estricto, Vite, Vitest, Zod, IndexedDB, Web Workers,
TensorFlow.js (WebGPU cuando esté disponible), WASM como alternativa cuando proceda,
Python/PyTorch como backend opcional, PostgreSQL opcional, Git y CI.

**No Next.js.** El frontend inicial se construye con React + TypeScript + Vite. El backend
no es obligatorio en la primera versión: el núcleo funciona localmente en el navegador sin
Internet.

Separación clara de: (1) Interfaz; (2) Dominio y reglas de juegos; (3) Agentes y
estrategias; (4) Búsqueda y evaluación; (5) Entrenamiento; (6) Registro experimental;
(7) Persistencia; (8) Equipos; (9) Torneos y rankings; (10) Descubrimiento de estrategias;
(11) Observabilidad; (12) Importación y exportación.

La interfaz nunca decide por su cuenta legalidad, fin de partida o resultado. Toda la
lógica de dominio es independiente de React. Contratos tipados, módulos pequeños,
interfaces explícitas, dependencias inyectables donde aporten valor. Modular sin
convertirse en laberinto de capas.

## 5. Diseño de la experiencia

Aplicación profesional, completamente en español: móvil primero, adaptable, modo claro y
oscuro, navegación accesible por teclado, contraste adecuado, etiquetas accesibles,
respeto a `prefers-reduced-motion`, tableros interactivos con animaciones moderadas,
paneles de estadísticas, historial de partidas, explorador de árboles de búsqueda, gestión
de agentes y equipos, torneos y clasificaciones, registro de eventos, exportación de
datos, estados vacíos informativos, mensajes de error comprensibles, indicadores de
tareas activas y progreso real.

No llenar la interfaz con números ficticios. Sin partidas ejecutadas, el panel lo dice y
ofrece acción para iniciar el primer experimento. Las visualizaciones consumen datos de
servicios reales. Presentación visual separada de cálculos estadísticos y del motor.

## 6. Motor genérico de juegos

API genérica para juegos por turnos que permita como mínimo: crear estado inicial; obtener
jugador actual; enumerar movimientos legales; aplicar movimiento validado; detectar
estados terminales; obtener resultado; codificar/decodificar estados; generar claves de
estado; detectar simetrías válidas; reproducir partidas; validar una secuencia completa;
registrar reglas y su versión; generar posiciones de prueba. Operaciones deterministas
ante mismo estado y acción.

Reglas explícitas, documentadas y probadas por juego, con representación adecuada por
juego (no forzar estructuras uniformes ineficientes).

Juegos mínimos a lo largo del proyecto (15 variantes): tres en raya 3×3; variante 4×4 con
condición de victoria documentada; Gomoku 7×7, 9×9 y 15×15; cuatro en raya estándar;
Othello 4×4 y 6×6; damas en variante reducida documentada; Hex 5×5; Breakthrough 5×5;
ajedrez reducido 5×5 y 6×6; variante adicional de cuatro en raya; variante adicional de
Gomoku u Othello. Documentar dimensiones, condición de victoria, movimientos legales,
reglas especiales y empates por variante. El ajedrez reducido exige especificar piezas,
movimientos, promoción, jaque, mate, ahogado y tablas. No confundir tablero reducido con
variante de reglas oficiales.

## 7. Fase 0: arquitectura, auditoría y plan

Tareas: auditar repositorio y entorno; documentar arquitectura; estructura de carpetas;
contratos de juegos y agentes; formato de partida; registro de eventos; sistema de
versiones de cerebros; métricas y fórmulas; persistencia local; estrategia de pruebas;
criterios de promoción entre niveles; riesgos de rendimiento; plan por fases; decisiones
que requieran experimentos previos.

Entregables: README inicial, documento de arquitectura, registro de decisiones técnicas,
modelo de datos inicial, plan de pruebas, criterios de aceptación por fase, lista de
riesgos y mitigaciones. No afirmar que el proyecto está construido en esta fase.

## 8. Fase 1: motor, tests, niveles iniciales y primera IA

Implementar el motor y los primeros cuatro niveles: reglas, validación, terminales,
agentes de referencia, minimax con poda alfa-beta, MCTS inicial, primera red de política y
valor (interfaz sustituible), interfaz para ejecutar partidas, registro de movimientos,
reproducción determinista, pruebas unitarias y basadas en propiedades.

El motor funciona aunque TensorFlow.js no esté disponible (agentes de referencia o
búsqueda clásica). La red y MCTS con interfaz sustituible.

Pruebas obligatorias: imposibilidad de movimientos ilegales; no continuar partida
terminada; resultado final conforme a reglas; reproducción conservando secuencia; semillas
registradas y usadas de forma controlada; estados serializables recuperables; simetrías
preservan legalidad; presupuestos de búsqueda respetados; solucionador exacto contra casos
de referencia conocidos.

Evaluación inicial: partidas reales registrando partidas completadas, V/E/D, tiempo,
nodos o simulaciones, configuración, semillas, versiones y errores. No declarar
superioridad con muestra insuficiente. Entrega: aplicación ejecutable con cuatro niveles e
informe de resultados medidos.

## 9. Fase 2: memoria, identidad y panel experimental

Persistencia de IAs: identificador, nombre, avatar, descripción, estilo, juegos
compatibles, arquitectura, pesos, versión de cerebro, historiales de entrenamiento y
evaluación, Elo e indicadores, referencias a partidas, estrategias, estado. Guardar/cargar,
exportar/importar, clonar, ramas de versiones, comparar, recuperar, validar integridad,
gestionar errores de almacenamiento, migrar formatos. Paquetes con manifiesto versionado;
sin ejecución de código arbitrario importado. Registros de partidas separados de pesos, con
referencias estables.

Panel experimental: partidas, Elo histórico, V/E/D, curvas de aprendizaje, tiempo de
pensamiento, simulaciones, profundidad, pérdidas reales, recursos medibles, tamaño de
buffer, errores y eventos. Cada indicador con fuente, marca temporal y método. Sin puntos
inventados en series vacías.

Criterios: agente guardado recuperable; integridad verificada antes de usar; importación
inválida no corrompe; versiones antiguas disponibles; estadísticas coinciden con origen;
errores de almacenamiento visibles y registrados.

## 10. Fase 3: equipos, plantel y mentoría

Tres modos: (A) Consulta — varias IAs analizan la misma posición, registrando propuestas,
valores, probabilidades, mecanismo de agregación y decisión. (B) Parejas — dos agentes
cooperan con protocolo documentado (alternancia, desacuerdos, información consultable).
(C) Mentoría — veteranos generan ejemplos para novatos; destilación cuando proceda;
registro de ejemplos, mentor, versión del alumno, parámetros y resultados. No asumir que
un agente fuerte es buen mentor.

Plantel con nombre, avatar, rol, juego, nivel, versión, Elo, partidas, estadísticas,
estado de entrenamiento y última actividad. Incorporación reproducible. Sin «preentrenados»
sin artefacto verificable.

Evaluación: comparar individuos y equipos con presupuestos equivalentes; medir si la
cooperación mejora fuerza, reduce errores o aumenta coste.

## 11. Fase 4: torneos, Elo, Glicko-2 y liga histórica

Round-robin, eliminatoria, sistema suizo, Elo, Glicko-2, desempates configurables,
alternancia de lados, semillas, partidas reproducibles, reanudación de torneos, historial
de rankings, liga continua entre versiones, rivales de referencia, exportación.

Definir fórmulas, parámetros, tratamiento de empates, inicialización, reglas de
actualización, partidas anuladas, incertidumbre y política de emparejamientos.
Actualizaciones idempotentes: registrar una partida repetida no puede actualizar dos veces.
Rating rastreable al historial. Sin mezclar escalas sin identificar.

Pruebas: emparejamientos, cálculo de resultados, Elo contra casos conocidos, Glicko-2
contra referencia, empates, reanudación sin duplicar, reproducción histórica, exportación
coherente.

## 12. Fase 5: expansión, descubrimiento y garantías

Completar juegos pendientes. Detector de: bifurcaciones, amenazas dobles, sacrificios
tácticos, trampas, patrones de final, aperturas, secuencias recurrentes. Cada hallazgo
guarda id, juego y versión de reglas, estado inicial, secuencia, partida de origen, fecha,
agente y versión, frecuencia, rivales, resultados, estado de validación, duplicados.

Distinguir patrones descubiertos / estrategias candidatas / estrategias validadas. No
afirmar novedad absoluta si solo se comprobó contra el catálogo local.

Libro de estrategias: buscar, filtrar, consultar, reproducir, comparar, exportar JSON/CSV.

Objetivo de no perder (por juego a certificar): solucionador exacto adecuado; estado y
reglas exactas; transiciones legales verificadas; exploración completa del espacio
relevante; simetrías y transposiciones tratadas; casos de referencia; verificación de la
propiedad; versión de código, parámetros, progreso y resultado guardados; alcance exacto
publicado. Prueba incompleta = indicarlo. Variante no resuelta = tasa de derrotas
empírica e incertidumbre frente a rivales identificados. Sin generalizar a rivales, reglas
o presupuestos no evaluados.

## 13. Aprendizaje por refuerzo y MCTS

Evolución gradual: agentes de referencia y búsqueda clásica → MCTS sin red → arquitectura
inspirada en AlphaZero (red de política, red de valor, MCTS guiado, autojuego, buffer de
repetición, simetrías, actualización de parámetros, evaluación de versiones, currículo
automático).

Web Workers para no bloquear la interfaz. Límites configurables de memoria, simulaciones,
tiempo y duración. La búsqueda registra datos para reconstruir su comportamiento: visitas,
política inicial y posterior, valores estimados, profundidad, variantes. Los valores de la
red son estimaciones, no probabilidades garantizadas. Currículo basado en resultados
medidos. Sin mejora declarada sin comparación contra referencia congelada bajo protocolo
definido.

## 14. Estadística y calidad experimental

Cada examen especifica antes: hipótesis, métrica principal, rivales, presupuesto, tamaño
de muestra o regla de parada, método del intervalo de confianza, umbral de promoción,
tratamiento de empates, condiciones de invalidez y procedimiento de reproducción.

Partidas no independientes: diseños pareados, alternancia de lados, agrupación por semillas.
El intervalo de confianza no es garantía absoluta. Evaluación separada de entrenamiento
cuando se mide generalización; conjuntos reservados registrados.

Métricas mínimas: V/E/D, puntuación media, IC, Elo/Glicko-2 cuando corresponda, partidas
válidas, tiempo de pared, tiempo de pensamiento, nodos y simulaciones, profundidad,
pérdidas, recursos medibles, errores e inválidas. Fuente documentada por métrica.

## 15. Registro experimental y auditoría

Registro central de eventos para partidas, entrenamientos, evaluaciones, torneos,
importaciones y verificaciones. Cada partida: id único, semilla, reglas y versión,
versiones de agentes, configuración de búsqueda, movimientos, resultado, tiempos medidos,
estadísticas de búsqueda, entorno, fecha, estado de validación, huella de integridad.

Eventos con ids únicos y mecanismos anti-duplicación. Exportación a CSV y JSON. Cada
indicador del panel permite consultar registros de origen y fórmula. La huella no es prueba
de que el evento ocurrió: documentar garantías y limitaciones. IndexedDB como fuente local
de verdad en la primera versión; si hay backend, definir autoridad y sincronización.

## 16. Rendimiento y recuperación

Recuperación frente a: recarga de página, cierre inesperado, fallo de entrenamiento,
agotamiento de memoria, error de almacenamiento, falta de WebGPU, interrupción de
evaluación, corrupción de paquete importado, duplicación de eventos. Checkpoints cuando
aporten valor. Trabajos largos con estados persistentes y estrategia de recuperación. No
prometer continuación tras cerrar el navegador sin mecanismo que lo garantice. Distinguir
pausa, cancelación, fallo y finalización. Sin tareas pesadas en el hilo principal. Medir
rendimiento, no suponerlo.

## 17. Seguridad y mantenibilidad

Validación de datos importados; límites de tamaño; comprobación de dimensiones de
tensores; manejo seguro de errores; protección de datos durante migraciones; sin secretos
en el repositorio; dependencias fijadas; análisis de vulnerabilidades cuando haya
herramientas; separación de datos de usuario y generados; limitaciones documentadas. Con
backend: autenticación/autorización, validación de entradas, límites de recursos, controles
de acceso. Sin dependencias externas obligatorias para la instalación local sin conexión.

## 18. Pruebas y CI

Pruebas automatizadas de: reglas de todos los juegos, movimientos legales, victorias y
empates, serialización, reproducción, búsqueda, solucionadores, persistencia,
importación/exportación, estadísticas, Elo y Glicko-2, emparejamientos, recuperación de
torneos, integridad de registros, promoción de niveles, regresiones de versiones.
TypeScript, lint y build de producción. Cuando sea viable: propiedades, casos aleatorios
con semillas guardadas, invariantes. Benchmarks separados de unitarias. CI con las
comprobaciones compatibles. No marcar aprobada una prueba no ejecutada; si falta una
herramienta, indicar la limitación y dar procedimiento reproducible local.

## 19. Documentación y entrega

README actualizado y documentación específica de: arquitectura, instalación, desarrollo,
pruebas, juegos y variantes, algoritmos de búsqueda, entrenamiento, persistencia,
exportación/importación, estadísticas, torneos, solucionadores, auditoría, limitaciones
conocidas. El README explica desde cero cómo instalar y ejecutar, con comandos reales que
funcionen en el estado actual del proyecto.

## 20. Informe obligatorio al terminar cada fase

Estructura: (A) Estado de la fase (completada/parcial/bloqueada) justificado por criterios
de aceptación. (B) Trabajo realizado. (C) Pruebas ejecutadas: comando, resultado, número
de pruebas, fallos, limitaciones. (D) Mediciones reales: solo ejecuciones reales, con
muestras, condiciones, versiones y métodos; si no hay mediciones, decirlo. (E) Evidencia:
referencias a registros, artefactos, commits; sin inventar hashes ni enlaces. (F)
Limitaciones y riesgos. (G) Instrucciones de ejecución desde entorno limpio. (H) Siguiente
fase: requisitos previos.

## 21. Gestión del repositorio

Si Git está disponible: inspeccionar rama y estado; conservar cambios del usuario; no
sobrescribir trabajo ajeno sin revisión; commits lógicos con mensajes descriptivos; sin
publicar/desplegar sin autorización cuando tenga consecuencias externas (el usuario YA
autorizó explícitamente publicar en GitHub); sin secretos ni artefactos innecesarios;
comprobar el diff antes de finalizar. Usar resultados reales de CI si existe. No afirmar
que un commit está en rama remota sin comprobarlo.

## 22. Reglas de priorización

Fiabilidad sobre velocidad: corrección del motor, integridad de datos y reproducibilidad
primero. Función avanzada costosa → versión mínima funcional + limitaciones documentadas +
camino de ampliación. Sin funciones vacías con apariencia correcta. Sin complejidad sin
necesidad demostrable. Sin ocultar deuda técnica ni falsos positivos. No confundir:
interfaz terminada ↔ función implementada; código escrito ↔ ejecutado ↔ verificado;
muestra favorable ↔ garantía matemática.

## 23. Orden final de ejecución

Primero: auditar el entorno y el repositorio real. Segundo: plan de Fase 0. Tercero:
entregables de Fase 0. Cuarto: verificar documentación y criterios. Quinto: iniciar Fase 1
y continuar el ciclo. No implementar todo en un único bloque. No detenerse tras el plan si
hay herramientas para continuar. No solicitar confirmación para decisiones técnicas
ordinarias resolubles de forma segura y documentada. Si falta una herramienta, identificar
el bloqueo exacto y continuar con las tareas independientes.

Meta: plataforma funcional, modular, extensible, accesible y científicamente honesta.

## 24. Instrucciones específicas del usuario sobre GitHub (2026-10-18)

- Guardar este prompt como guía permanente (este documento).
- Crear un repositorio GitHub **público** con el token proporcionado
  (**[TOKEN REDACTADO — almacenado en `/home/z/my-project/.credenciales/github-token.txt`,
  fuera del repositorio; jamás debe versionarse ni imprimirse en artefactos públicos]**).
- Subir el proyecto de forma incremental para que no se pierda.
- Probarlo todo con GitHub Actions y verificar los resultados reales.
