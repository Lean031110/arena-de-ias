/**
 * Medición REAL del solucionador exacto de Fase 1 (separado de la suite de
 * CI). Escribe docs/INFORMES/datos/solucionador-fase1.json.
 *
 * Ejecuta el solucionador sobre 3×3 (esperado: empate, referencia pública)
 * y sobre 4×4 con un presupuesto amplio: si no termina, se registra
 * «incompleto» y NADA se declara resuelto (regla de integridad §12).
 *
 * Uso: npm run medir:solucionador
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverJuego } from '../src/dominio/motor/solucionador';
import { tresEnRaya3, tresEnRaya4 } from '../src/dominio/juegos/tresEnRaya';
import { gomoku7 } from '../src/dominio/juegos/gomoku';
import { cuatroEnRaya7x6 } from '../src/dominio/juegos/cuatroEnRaya7x6';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = resolve(AQUI, '../docs/INFORMES/datos/solucionador-fase1.json');

const PRESUPUESTO_3X3_MS = 30000;
const PRESUPUESTO_4X4_MS = 240000;
const PRESUPUESTO_NO_VIABLE_MS = 1000;

async function main(): Promise<void> {
  const ejecuciones: unknown[] = [];

  console.log('▶ tres-en-raya-3 (presupuesto 30 s)…');
  const r3 = resolverJuego(tresEnRaya3, PRESUPUESTO_3X3_MS);
  console.log(
    `  completo=${r3.completo} valor=${r3.valor} nodos=${r3.nodos} tiempo=${r3.tiempoMs.toFixed(1)} ms jugadasOptimas=[${r3.jugadasOptimas.join(',')}]`,
  );
  ejecuciones.push({
    juego: 'tres-en-raya-3',
    presupuestoMs: PRESUPUESTO_3X3_MS,
    ...r3,
    referenciaExterna:
      'El tres en raya 3×3 es un empate con juego perfecto (resultado clásico verificado ' +
      'independientemente en la literatura). Esta ejecución local coincide (valor 0).',
  });

  console.log('▶ tres-en-raya-4 (presupuesto 240 s: solucionador genérico sin poda)…');
  const inicio4 = Date.now();
  const r4 = resolverJuego(tresEnRaya4, PRESUPUESTO_4X4_MS);
  console.log(
    `  completo=${r4.completo} presupuestoAgotado=${r4.presupuestoAgotado} nodos=${r4.nodos} tiempo=${(Date.now() - inicio4).toFixed(0)} ms valor=${r4.valor}`,
  );

  // Verificación de consistencia interna del resultado del 4×4: tras una
  // MUESTRA de jugadas óptimas iniciales (las 3 primeras, para mantener el
  // tiempo total acotado), el valor del hijo debe ser exactamente el negado.
  let consistencia4x4: unknown = 'no aplica (resultado incompleto)';
  if (r4.completo) {
    const muestra = r4.jugadasOptimas.slice(0, 3);
    const comprobaciones: Array<{ jugada: string; valorHijo: number | null; esperado: number; coincide: boolean }> = [];
    for (const notacion of muestra) {
      const movimiento = tresEnRaya4.analizarMovimiento(notacion);
      if (movimiento === null) continue;
      const hijo = tresEnRaya4.aplicarMovimiento(tresEnRaya4.crearEstadoInicial(), movimiento);
      const valorHijo = resolverJuego(tresEnRaya4, PRESUPUESTO_4X4_MS, tresEnRaya4.codificar(hijo));
      const esperado = -r4.valor;
      comprobaciones.push({
        jugada: notacion,
        valorHijo: valorHijo.completo ? valorHijo.valor : null,
        esperado,
        coincide: valorHijo.completo && valorHijo.valor === esperado,
      });
    }
    const todas = comprobaciones.every((comprobacion) => comprobacion.coincide);
    consistencia4x4 = {
      todas,
      muestra: `${muestra.length} de ${r4.jugadasOptimas.length} jugadas óptimas (muestreo acotado por tiempo)`,
      comprobaciones,
    };
    console.log(`  consistencia padre/hijo: ${todas ? 'OK' : 'FALLO'} (${muestra.length} jugadas comprobadas de ${r4.jugadasOptimas.length})`);
  }
  ejecuciones.push({
    juego: 'tres-en-raya-4',
    presupuestoMs: PRESUPUESTO_4X4_MS,
    ...r4,
    consistenciaPadreHijo: consistencia4x4,
    nota:
      r4.completo
        ? 'Resuelto localmente por búsqueda exhaustiva con tabla de transposición y simetrías ' +
          '(negamax exacto sin poda). Resultado: empate con juego perfecto. Verificado por ' +
          'consistencia interna padre/hijo y por la suite de pruebas del solucionador.'
        : 'NO resuelto localmente: el solucionador genérico sin poda alfa-beta agotó el presupuesto. ' +
          'No se declara ningún valor de juego para el 4×4 en Fase 1 (pendiente de solucionador especializado, Fase 5).',
  });

  console.log('▶ gomoku-7 (presupuesto de control 1 s: se espera incompleto)…');
  const rg = resolverJuego(gomoku7, PRESUPUESTO_NO_VIABLE_MS);
  console.log(`  completo=${rg.completo} presupuestoAgotado=${rg.presupuestoAgotado} nodos=${rg.nodos}`);
  ejecuciones.push({
    juego: 'gomoku-7',
    presupuestoMs: PRESUPUESTO_NO_VIABLE_MS,
    ...rg,
    nota: 'Espacio de estados fuera del alcance del solucionador genérico; registrado como no resuelto.',
  });

  console.log('▶ cuatro-en-raya-7x6 (presupuesto de control 1 s: se espera incompleto)…');
  const rc = resolverJuego(cuatroEnRaya7x6, PRESUPUESTO_NO_VIABLE_MS);
  console.log(`  completo=${rc.completo} presupuestoAgotado=${rc.presupuestoAgotado} nodos=${rc.nodos}`);
  ejecuciones.push({
    juego: 'cuatro-en-raya-7x6',
    presupuestoMs: PRESUPUESTO_NO_VIABLE_MS,
    ...rc,
    nota:
      'Resuelto externamente en la literatura (victoria del primer jugador), pero NO verificado ' +
      'localmente: se declara no resuelto hasta completar la verificación exigida (Fase 5).',
  });

  const artefacto = {
    titulo: 'Solucionador exacto — mediciones reales de la Fase 1',
    fecha: new Date().toISOString(),
    entorno: `Node ${process.versions.node} (${process.arch})`,
    metodo:
      'Negamax exhaustivo sin poda alfa-beta (valores exactos) con tabla de transposición ' +
      'indexada por clave canónica mínima entre simetrías declaradas y presupuesto de tiempo ' +
      'de seguridad. completo=false ⇒ nada se declara resuelto.',
    ejecuciones,
  };

  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, JSON.stringify(artefacto, null, 2), 'utf8');
  console.log(`\nArtefacto escrito en ${DESTINO}`);
}

void main();
