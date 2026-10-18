# Motor central vendorizado — Procedencia

**NO MODIFICAR LOS ARCHIVOS DE ESTA CARPETA.**

Esta carpeta es una copia exacta (sin los archivos `.test.ts`) de
`src/dominio/` del repositorio central:

- **Repositorio**: https://github.com/Lean031110/arena-de-ias
- **Commit de origen**: `a908319` (docs: badge de CI con URL real y evidencia del run 39149193576 en el informe de Fase 1)
- **Fecha de extracción**: 2026-10-18
- **Ruta de origen**: `src/dominio/`
- **Principio**: la interfaz nunca decide legalidad ni resultados; estos contratos son la única autoridad (docs/ARQUITECTURA.md §3 del núcleo).

## Reglas de esta carpeta

1. Los archivos se copian **verbatim**, byte a byte, para que `git diff`
   contra el núcleo sea trivial en futuras sincronizaciones.
2. Cualquier corrección pertenece al núcleo, no a esta copia. Para
   sincronizar: volver a copiar desde el commit deseado del núcleo.
3. Este prototipo **solo consume** los módulos desde la capa de adaptadores
   de `src/lib/motor-adaptadores.ts`, nunca importa directamente desde
   los componentes visuales.
4. Los tests del motor viven en el núcleo; aquí se excluyen para no duplicar
   la batería de pruebas.

## Qué significa «motor local»

Cuando la interfaz muestra «Motor de juegos: LOCAL (vendorizado)», significa:
las reglas y agentes ejecutados son los **reales** del núcleo (mismas
semillas, mismas estadísticas, misma huella), pero ejecutándose en el
navegador dentro de este prototipo. **No** está conectado el almacén
experimental central (IndexedDB del núcleo), ni el entrenamiento, ni los
torneos persistentes.
