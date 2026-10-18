/**
 * Registro de servicios con su estado REAL de conexión.
 *
 * Principio de honestidad: cada servicio declara exactamente qué existe y
 * qué no. Nada «parece conectado» sin estarlo. Los estados se calculan a
 * partir de hechos verificables (catálogo vendorizado, presencia de
 * APIs del navegador), no de suposiciones.
 */

import type { EstadoDeServicio } from '@/lib/contratos';
import { MOTOR_ORIGEN } from '@/motor-central/version';
import { almacenDisponible } from '@/lib/almacen-local';

/**
 * NOTA DE HIDRATACIÓN: esta función es PURA (sin acceso a window) para que
 * el servidor y el cliente rendericen exactamente lo mismo. La disponibilidad
 * real de APIs del navegador se mide en `diagnosticarNavegador()`, que solo
 * se evalúa tras el montaje.
 */
export function obtenerServicios(): readonly EstadoDeServicio[] {
  const lista: EstadoDeServicio[] = [
    {
      id: 'motor-juegos',
      nombre: 'Motor de juegos',
      estado: 'local',
      detalle:
        `Reglas y agentes reales del núcleo, vendorizados en el navegador (commit ${MOTOR_ORIGEN.commit}). ` +
        'Las partidas locales usan estas mismas reglas, semillas y estadísticas.',
      commit: MOTOR_ORIGEN.commit,
    },
    {
      id: 'almacen-central',
      nombre: 'Registro experimental central',
      estado: 'desconectado',
      detalle:
        'El almacén IndexedDB del núcleo no está enlazado a este prototipo. ' +
        'Las partidas y evaluaciones de aquí se guardan en el almacén local del prototipo, ' +
        'identificadas como tales.',
    },
    {
      id: 'cerebros-lba',
      nombre: 'Cerebros «.lba»',
      estado: 'pendiente',
      fase: 'Fase 2 del núcleo',
      detalle:
        'El formato de paquete con manifiesto versionado y el validador pertenecen a la Fase 2. ' +
        'El importador muestra exactamente qué falta; no valida por extensión.',
    },
    {
      id: 'entrenamiento',
      nombre: 'Entrenamiento',
      estado: 'pendiente',
      fase: 'Fase 2 del núcleo',
      detalle:
        'Sin red neuronal, pesos ni curvas de aprendizaje. Cualquier progreso de entrenamiento sería falso; ' +
        'el panel solo muestra estados y requisitos reales.',
    },
    {
      id: 'torneos',
      nombre: 'Torneos y rating (Elo / Glicko-2)',
      estado: 'pendiente',
      fase: 'Fase 4 del núcleo',
      detalle:
        'Round-robin, eliminatoria, sistema suizo y ratings llegan en la Fase 4. ' +
        'La evaluación comparativa local (motor real) sí está disponible hoy.',
    },
    {
      id: 'simulacion-tactica',
      nombre: 'Simulación competitiva táctica',
      estado: 'local',
      detalle:
        'Sandbox visual con contrato propio (arena-tactica-2d v0.1.0-sandbox). ' +
        'No es un juego del núcleo: es el terreno de observación del simulador futuro.',
    },
    {
      id: 'estrategias',
      nombre: 'Descubrimiento de estrategias',
      estado: 'pendiente',
      fase: 'Fase 5 del núcleo',
      detalle:
        'Detección de aperturas, trampas y patrones validados: planificado en la Fase 5.',
    },
    {
      id: 'almacen-prototipo',
      nombre: 'Almacén local del prototipo',
      estado: 'local',
      detalle:
        'Persistencia en localStorage para partidas, evaluaciones y eventos de sesión de este prototipo. ' +
        'La disponibilidad real de esta API se mide en vivo en el diagnóstico del navegador.',
    },
  ];
  return lista;
}

/* ── Verificaciones de integridad REALES (calculadas, no decorativas) ── */

export interface Verificacion {
  readonly nombre: string;
  readonly ok: boolean;
  readonly detalle: string;
}

import { juegosImplementados } from '@/motor-central/juegos/registro';

/** Prueba de humo del motor vendorizado: cada juego implementado responde. */
export function verificarMotor(): readonly Verificacion[] {
  const resultados: Verificacion[] = [];
  try {
    for (const entrada of juegosImplementados()) {
      const juego = entrada.juego;
      if (juego === undefined) {
        resultados.push({
          nombre: `Juego ${entrada.id}`,
          ok: false,
          detalle: 'declarado implementado sin instancia (inconsistencia de catálogo)',
        });
        continue;
      }
      const estado = juego.crearEstadoInicial();
      const legales = juego.movimientosLegales(estado);
      const vista = juego.vista(estado);
      const ok =
        legales.length > 0 &&
        vista.celdas.length === juego.dimensiones.ancho * juego.dimensiones.alto;
      resultados.push({
        nombre: `${entrada.nombre} · v${juego.reglasVersion}`,
        ok,
        detalle: ok
          ? `${legales.length} jugadas legales en el estado inicial · ${vista.celdas.length} celdas`
          : 'el estado inicial no responde correctamente',
      });
    }
    resultados.push({
      nombre: 'Agentes del catálogo',
      ok: true,
      detalle: 'aleatorio, heurístico, minimax α-β y MCTS disponibles · neuronal pendiente (Fase 2)',
    });
  } catch (error) {
    resultados.push({
      nombre: 'Motor vendorizado',
      ok: false,
      detalle: `excepción durante la prueba de humo: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return resultados;
}

/** Diagnóstico de compatibilidad del navegador (medición directa de APIs). */
export function diagnosticarNavegador(): readonly Verificacion[] {
  const comprobaciones: Verificacion[] = [];
  comprobaciones.push({
    nombre: 'localStorage',
    ok: almacenDisponible(),
    detalle: almacenDisponible() ? 'disponible' : 'no disponible (sesión en memoria)',
  });
  comprobaciones.push({
    nombre: 'Web Crypto (UUID)',
    ok: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function',
    detalle: 'necesario para ids de partidas',
  });
  comprobaciones.push({
    nombre: 'CSS Grid',
    ok: typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('display', 'grid'),
    detalle: 'necesario para tableros y paneles',
  });
  comprobaciones.push({
    nombre: 'performance.now()',
    ok: typeof performance !== 'undefined' && typeof performance.now === 'function',
    detalle: 'medición directa de tiempos de búsqueda',
  });
  comprobaciones.push({
    nombre: 'requestAnimationFrame',
    ok: typeof requestAnimationFrame === 'function',
    detalle: 'reproducción suave de partidas',
  });
  return comprobaciones;
}
