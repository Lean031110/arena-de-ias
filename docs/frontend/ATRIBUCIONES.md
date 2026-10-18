# Atribuciones y licencias — Prototipo visual de Arena de IAs

Política: **solo recursos propios (creados para el proyecto) o FOSS con licencia identificada**.
Ninguna imagen remota en tiempo de ejecución; ninguna dependencia de red para los componentes
esenciales. Este archivo se mantiene actualizado con cada incorporación.

## Recursos de creación propia (dominio del proyecto)

| Recurso | Descripción | Licencia |
|---|---|---|
| `docs/assets/logo.svg` | Marca Arena de IAs: hexágono-arena, rejilla de juego, dos agentes (dorado/azul) conectados al núcleo. Dibujo vectorial original. | Dominio del proyecto (CC0-equivalente: uso libre dentro del proyecto) |
| `docs/assets/logo-banner.svg` · `logo.png` · `logo-banner.png` | Versiones de banner y PNG exportadas del mismo diseño. | Ídem |
| Texturas CSS | Rejilla técnica, resplandor superior, corchetes HUD, leds y barras (CSS puro, sin imágenes). | Ídem |
| Mapa y unidades tácticas | SVG generado por código en `RendererMapa.tsx` + terreno simétrico diseñado a mano en `nucleo.ts`. | Ídem |
| Diagramas y contratos | Documentación y tipos redactados para el prototipo. | Ídem |

## Tipografías (autohospedadas en build por `next/font`)

| Fuente | Uso | Licencia |
|---|---|---|
| Chakra Petch | Display táctico (títulos, cifras HUD) | SIL Open Font License 1.1 — Cadson Demak |
| Geist | Cuerpo de texto | SIL Open Font License 1.1 — Vercel |
| Geist Mono | Cifras de consola y notación | SIL Open Font License 1.1 — Vercel |

Las fuentes se descargan en build y se sirven autohospedadas: la aplicación funciona 100 % sin
conexión. El cuerpo usa además la pila `system-ui` como respaldo.

## Dependencias de código

| Paquete | Uso | Licencia |
|---|---|---|
| Next.js 16 / React 19 | Marco de la aplicación (solo el prototipo) | MIT |
| Tailwind CSS 4 | Sistema de estilos | MIT |
| shadcn/ui (Radix UI) | Primitivas de componentes | MIT (Radix: MIT) |
| lucide-react | Iconografía (juegos, paneles, controles) | ISC |
| clsx · tailwind-merge · class-variance-authority | Utilidades de clases | MIT |
| next-themes | Tema claro/oscuro | MIT |
| zod | (presente en el scaffold; no usado por las vistas) | MIT |

El **motor de juegos** y sus agentes son código del propio núcleo
(`src/dominio/` @ `a908319`, licencia del repositorio).

## Notas de cumplimiento

- **No se incluyen** imágenes, texturas o fotografías de terceros.
- **No se cargan** recursos remotos en tiempo de ejecución (fuentes autohospedadas; iconografía
  SVG embebida).
- **No se guardan** tokens ni secretos en el frontend (política verificada en Ajustes §Seguridad).
- Si en el futuro se incorporan assets CC0/CC-BY de terceros, deben registrarse aquí con:
  autor, URL, licencia exacta y fecha de descarga.
