# Arquitectura de Arena de IAs

Versión del documento: 1.0 (Fase 0, revisada en Fase 1)
Estado: vigente.

## 1. Principios

1. **Integridad de los datos ante todo.** Cada cifra mostrada proviene de registros reales;
   los datos ausentes se muestran como ausentes.
2. **El dominio no conoce la interfaz.** `src/dominio/` no importa React ni APIs de
   navegador en tiempo de carga; es TypeScript puro ejecutable también en Node (así se
   prueban y miden las mismas funciones que corre el navegador).
3. **La interfaz nunca decide.** Legalidad, terminalidad y resultado son exclusivos del
   dominio. La UI llama a `juego.validarMovimiento` / `juego.aplicarMovimiento` /
   `juego.esTerminal` y se limita a presentar y recoger acciones del usuario.
4. **Determinismo con semillas.** Toda aleatoriedad del dominio fluye por un RNG propio
   (mulberry32) instanciado con semillas registradas. `Math.random` está prohibido en el
   dominio (regla de lint no automática; revisión en code review y cubierta por pruebas de
   reproducibilidad).
5. **Presupuestos explícitos.** Ninguna búsqueda es «ilimitada»: profundidad, nodos,
   simulaciones y tiempo se configuran, se aplican y se registran.
6. **Modular sin laberinto.** Módulos pequeños con interfaces explícitas; el registro de
   juegos y de agentes es la única parte con tipos borrados (`any` interno contenido en un
   solo archivo por registro, justificado en DECISIONES-002).

## 2. Visión general

```
┌───────────────────────────────────────────────────────────────┐
│ INTERFAZ (React + TS)  src/interfaz/                          │
│  Arena · Resultados · Registro · Agentes · Guía               │
│  Solo presenta y recoge acciones; sin lógica de reglas        │
└───────────────┬───────────────────────────────────────────────┘
                │ llama (vía cliente de trabajador o directo)
┌───────────────▼───────────────────────────────────────────────┐
│ APLICACIÓN  src/aplicacion/                                   │
│  Persistencia IndexedDB · servicios de almacenamiento         │
│  Valida registros con Zod en los bordes de confianza          │
└───────────────┬───────────────────────────────────────────────┘
                │ usa
┌───────────────▼───────────────────────────────────────────────┐
│ TRABAJADOR WEB  src/trabajadores/                             │
│  Ejecuta partidas completas y evaluaciones fuera del hilo     │
│  principal; cálculo de jugada suelta para partidas humanas.   │
│  Protocolo de mensajes tipado (Solicitud/Respuesta).          │
└───────────────┬───────────────────────────────────────────────┘
                │ importa (mismo código, sin copias)
┌───────────────▼───────────────────────────────────────────────┐
│ DOMINIO  src/dominio/  (sin React, sin DOM, ejecutable en Node)│
│                                                               │
│  motor/    contratos (Juego, Agente), RNG, eventos, huella,   │
│            partidas, validación/replay, evaluación,           │
│            estadística (Wilson), exportación, solucionador    │
│  juegos/   reglas por juego + registro/catálogo               │
│  agentes/  niveles 1-4 + registro/catálogo (+ contrato neural) │
└───────────────────────────────────────────────────────────────┘
```

El trabajador y la interfaz comparten **el mismo código de dominio** (una sola fuente de
verdad de las reglas). No existe ninguna copia paralela de la lógica de juegos.

## 3. Contrato de juego (resumen)

`src/dominio/motor/tipos.ts` define `Juego<S, M>`:

| Operación | Semántica |
|---|---|
| `crearEstadoInicial()` | estado inicial determinista |
| `jugadorActual(estado)` | 1 o 2 |
| `movimientosLegales(estado)` | lista completa de jugadas legales |
| `validarMovimiento(estado, m)` | `{ valido, motivo? }` sin excepciones |
| `aplicarMovimiento(estado, m)` | inmutable; lanza `ErrorMovimientoIlegal` si `m` no es legal |
| `esTerminal(estado)` / `resultado(estado)` | terminalidad y resultado (null si no terminal) |
| `codificar` / `decodificar` / `claveEstado` | serialización y clave canónica |
| `simetrias` + `aplicarSimetria` | grupo de simetrías declarado y comprobado por pruebas |
| `evaluar(estado, jugador)` | heurística en [-1, 1] (usada por minimax y rollouts) |
| `formatearMovimiento` / `analizarMovimiento` | notación textual y su inversa exacta |
| `posicionesPrueba()` | casos de referencia para pruebas |

Cada juego declara `id`, `reglasVersion`, `nombre`, `descripcion` y `dimensiones`.

## 4. Contrato de agente

`src/dominio/agentes/tipos.ts` define `Agente` con
`elegirMovimiento(juego, estado, contexto) → { movimiento, estadisticas }`.
El contexto aporta el RNG con semilla derivada (reproducible) y la configuración de
presupuesto. Todo agente recibe el contrato `Juego` completo: los agentes de niveles 1-4
son **genéricos** y funcionan con cualquier juego que cumpla el contrato (sin código por
juego). El nivel 5 (red neuronal) tiene contrato (`AgenteNeural`) y estado «Pendiente».

## 5. Flujo de una partida

1. La UI (o el script de medición) construye `ConfigPartida` (juego, dos configs de
   agente, semilla) validada con Zod.
2. `ejecutarPartida(config, decidir?)` recorre turnos: pide la jugada al agente (o a la
   función `decidir` en partidas interactivas con humano), la **valida** contra el juego y
   la aplica; acumula movimientos en notación, estadísticas de búsqueda y tiempos medidos.
3. Al terminar: `validarSecuencia` **repite** la partida desde el estado inicial y
   comprueba legalidad de cada jugada y coincidencia del resultado → `validez:
   'verificada' | 'invalida'`.
4. Se calcula la huella FNV-1a del núcleo determinista y se construye el `RegistroPartida`.
5. La capa de aplicación lo persiste en IndexedDB y añade un evento al registro
   experimental (deduplicado por id).

## 6. Flujo de una evaluación

`ejecutarEvaluacion(config, onProgreso)` juega un round-robin: cada par de agentes disputa
`encuentrosPorPar` partidas alternando lados, con semillas derivadas de `semillaBase`.
Cada partida pasa por el mismo cauce del punto 5 (incluida su validación). El resumen por
agente calcula victorias/empates/derrotas, puntuación media (V + E/2) y **intervalo de
confianza de Wilson al 95 %** sobre la puntuación. El progreso comunicado es real
(partidas completadas / total).

## 7. Trabajador web

Protocolo tipado (`src/trabajadores/protocolo.ts`): solicitudes `movimiento`, `partida`,
`evaluacion`, `cancelar`; respuestas `movimiento-completado`, `partida-completada`,
`evaluacion-progreso`, `evaluacion-completada`, `cancelada`, `error`. Los estados viajan
**codificados** (JSON del dominio), no como objetos vivos. El cliente
(`cliente.ts`) degrada con elegancia: sin `Worker`, ejecuta en el hilo principal e informa.

## 8. Persistencia (Fase 1)

IndexedDB `arena-de-ias` v1 con almacenes `partidas`, `evaluaciones`, `eventos` (clave: id).
Los registros se validan con esquemas Zod al leer (`MODELO_DATOS.md` §6). Los errores se
envuelven en `ErrorAlmacenaje` y se muestran en la UI; la sesión degrada a memoria.
La Fase 2 añade el almacén de cerebros/versiones sobre el mismo patrón.

## 9. Extensibilidad

- **Nuevo juego:** implementar `Juego<S, M>` + pruebas de reglas + documentarlo en
  `docs/JUEGOS.md` + registrarlo en `src/dominio/juegos/registro.ts`. Los 4 agentes
  funcionan sin cambios.
- **Nuevo agente:** implementar `Agente` + pruebas + registrarlo en
  `src/dominio/agentes/registro.ts`.
- **Backend futuro (opcional):** la separación dominio/aplicación permite envolver el
  dominio en un servicio; el registro experimental definirá entonces la autoridad de los
  datos y la política de sincronización (decisiones pendientes, ver RIESGOS.md).

## 10. Decisiones que requieren experimentos antes de tomarse

- Presupuestos por defecto por juego y nivel (rendimiento real en navegadores modestos).
- Constante de exploración MCTS por juego.
- Orden de expansión/jugadas en minimax (impacto de la poda en la práctica).
- Ventana del rollout de MCTS (longitud del cap) por juego.
- Variante exacta de damas reducida y de ajedrez 6×6 (Fase 5, antes de implementar).
- Mentoría y destilación: qué agente sirve de mentor (experimento de Fase 3).
- Promoción de niveles del cerebro entrenado (umbral estadístico, Fase 2).
