# Auditoría de Fase 1 — Re-verificación independiente

Fecha: 2026-10-19 · Auditor: agente principal (sesión de continuación)
Commit auditado: `a908319` (main, sincronizado con origin/main)
Método: re-ejecución completa desde instalación limpia, lectura del código y de los
artefactos versionados, consultas reales a la API de GitHub Actions y búsqueda de
secretos en todo el historial. Nada de lo abajo se toma del informe anterior sin
re-ejecutarlo.

## Confirmado

- **Repositorio**: rama `main` en `a908319`, árbol de trabajo limpio, 11 commits con
  historial lógico. Los ~92 archivos marcados «modified» eran solo cambios de permiso
  644→755 (artefacto del contenedor, 0 cambios de contenido); se configuró
  `core.fileMode=false`. No hay cambios ajenos de contenido que conservar.
- **Instalación reproducible**: `rm -rf node_modules && npm ci` → correcto, 0 vulnerabilidades.
- **Tipos**: `npx tsc --noEmit` → 0 errores.
- **Lint**: `npx eslint .` → 0 errores, 0 avisos.
- **Pruebas**: `npx vitest run` → **170/170 aprobadas** (19 archivos), 0 fallos. El número
  declarado es exacto.
- **Build**: `npm run build` → correcto (index.html, JS, CSS y trabajador web); `dist/`
  existe localmente y NO está versionado (correcto).
- **Artefactos versionados**: `docs/INFORMES/datos/evaluacion-fase1.json` (14.917 líneas,
  504 partidas con jugadas, semillas y huellas) y `solucionador-fase1.json` (4 ejecuciones)
  existen y están trackeados en git.
- **Solucionador 4×4**: la variante implementada exige 4 en línea en tablero 4×4
  (`tam: 4, objetivo: 4` en `tresEnRaya.ts`); el artefacto registra empate completo con
  6.460.009 nodos y 48,6 s. Las 16 jugadas iniciales aparecen como óptimas (coherente con
  un empate con juego perfecto). Las pruebas de CI verifican el comportamiento del
  presupuesto para 4×4 (incompleto sin declarar valor), y el test 3×3 valida contra la
  referencia conocida (empate). Consistente entre reglas, pruebas y artefacto.
- **Reproducibilidad**: se regeneró el artefacto de evaluación con las semillas
  registradas → huellas de evaluación idénticas (`a23c6abd`, `80f57573`, `b1bfc269`,
  `93623f57`) y las huellas de las 504 partidas coinciden 1:1 con las versionadas.
  (El artefacto se restauró después: los tiempos varían entre ejecuciones, las huellas no.)
- **Partidas verificadas por replay**: las 504 registradas con `validez: "verificada"`,
  0 inválidas, 0 errores.
- **Sin secretos versionados**: `git log --all -S"ghp_"` y `-S"github_pat_"` (pickaxe sobre
  todo el historial) → 0 resultados; escaneo del árbol de trabajo → 0 resultados;
  `.gitignore` cubre `.env`, `*.key`, `*.pem`, `token*.txt`, `credenciales*`.
- **CI real en GitHub**: 2 runs del workflow `CI` (39149193576 sobre `d5cfa37` y
  39149312463 sobre `a908319`), ambos `success`. Coincide con §E del informe de Fase 1.
- **Contrato neural honesto**: `neural.ts` declara «PENDIENTE DE IMPLEMENTACIÓN» sin pesos
  ni métricas simuladas.
- **Implementaciones reales presentes**: motor (tipos, rng, huella, eventos, validación,
  partida, evaluación, estadística, exportación, solucionador), 6 variantes de juegos con
  simetrías probadas, agentes aleatorio/heurístico/minimax/MCTS, IndexedDB con Zod,
  Web Worker con protocolo tipado, interfaz React en español (arena, evaluación,
  registro, agentes, guía), scripts de medición reales.

## No confirmado

- **«456 partidas»** (FASE-1.md §C y §D.2): el artefacto contiene **504** partidas
  (240 + 96 + 96 + 72). El desglose por agente de las tablas (120/48/48/36 por agente)
  sí es correcto; únicamente el total agregado estaba mal calculado. Corregido en esta
  auditoría. No afecta a ninguna métrica individual ni a las conclusiones.

## Fallos encontrados

- Solo el error aritmético anterior. **Ninguna regresión**: la batería completa
  (instalación limpia → tipos → lint → 170 pruebas → build) pasa sin fallos.
- Nota operativa (fuera del repositorio): el token de API guardado en
  `.credenciales/github-token.txt` fue rechazado («Bad credentials»; probablemente
  rotado tras la exposición previa). El token de `git-credentials` sigue válido con
  permisos de administración y se usa para push y API. Ningún archivo del repositorio
  contiene credenciales.

## Correcciones necesarias (y aplicadas)

1. FASE-1.md: «456 partidas» → «504 partidas» en §C y §D.2. **Aplicado en esta rama.**
2. Ninguna otra corrección de código requerida por la auditoría.

## Conclusión de la auditoría

La Fase 1 es sólida: las afirmaciones centrales (170 pruebas, build, artefactos,
reproducibilidad por semillas, CI verde, ausencia de secretos, honestidad del contrato
neural) se verifican de forma independiente. El único defecto es un total agregado mal
calculado en el texto del informe, ya corregido. Se puede proseguir con la Fase 2 sobre
esta base sin reconstruir nada.
