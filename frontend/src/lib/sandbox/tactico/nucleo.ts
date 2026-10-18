/**
 * ═════════════════════════════════════════════════════════════════════
 * SANDBOX TÁCTICO 2D — núcleo de simulación (puro, sin React)
 * ═════════════════════════════════════════════════════════════════════
 *
 * NO forma parte del motor central. Es el terreno visual del simulador
 * competitivo FUTURO, con contrato propio (arena-tactica-2d v0.1.0-sandbox,
 * esquema estado-plano-json-v1). Reglas visibles y deterministas; las IAs
 * de las facciones son conductas de demostración (heurísticas simples),
 * NO agentes entrenados.
 *
 * Separación estricta: este módulo no toca React, DOM ni estilos; el
 * renderizador (components/arena/tactico/) solo pinta el estado.
 */

import type {
  EdificioTactico,
  EntidadTactica,
  EventoTactico,
  FaccionTactica,
  OrdenTactica,
  RolUnidad,
  SimulationAdapter,
  SimulationCommand,
  SimulationState,
  TipoTerreno,
} from '@/lib/contratos';
import { SIMULACION_TACTICA } from '@/lib/contratos';

/* ─── Constantes de reglas v0.1.0 ──────────────────────────────────── */

const ANCHO = 20;
const ALTO = 12;
const TICKS_LIMITE = 300;
const TICKS_DOMINIO_VICTORIA = 15;

const ESTADISTICAS_ROL: Record<RolUnidad, { pv: number; at: number; rango: number; mov: number; coste: number; nombre: string }> = {
  infanteria: { pv: 100, at: 24, rango: 1, mov: 2, coste: 50, nombre: 'Infantería' },
  explorador: { pv: 70, at: 14, rango: 1, mov: 4, coste: 60, nombre: 'Explorador' },
  francotirador: { pv: 60, at: 38, rango: 3, mov: 1, coste: 90, nombre: 'Francotirador' },
  blindado: { pv: 180, at: 30, rango: 1, mov: 1, coste: 140, nombre: 'Blindado' },
};

const COSTE_TERRENO: Record<TipoTerreno, number> = {
  llanura: 1,
  carretera: 1,
  ruinas: 1,
  bosque: 2,
  agua: Number.POSITIVE_INFINITY,
  montana: Number.POSITIVE_INFINITY,
};

const DEFENSA_TERRENO: Partial<Record<TipoTerreno, number>> = {
  bosque: 0.25,
  ruinas: 0.15,
};

/** Terreno simétrico (20 columnas × 12 filas). Espejo horizontal. */
const MAPA_TERRENO: readonly string[] = [
  '....mm...rr...mm....',
  '..a....b....b....a..',
  '.a..bb......bb..a..',
  '..cc..........cc..',
  '.....r.......r.....',
  '...b....m..m....b...',
  '.m................m.',
  '..b...a.....a...b..',
  '....c..........c....',
  '..a...mm..mm...a..',
  '.....b......b.....',
  '....mm...rr...mm....',
];

function parsearTerreno(): TipoTerreno[] {
  const celdas: TipoTerreno[] = [];
  for (let fila = 0; fila < ALTO; fila += 1) {
    const línea = (MAPA_TERRENO[fila] ?? '').padEnd(ANCHO, '.');
    for (let columna = 0; columna < ANCHO; columna += 1) {
      const símbolo = línea[columna] ?? '.';
      celdas.push(
        símbolo === 'a' ? 'agua'
        : símbolo === 'm' ? 'montana'
        : símbolo === 'b' ? 'bosque'
        : símbolo === 'c' ? 'carretera'
        : símbolo === 'r' ? 'ruinas'
        : 'llanura',
      );
    }
  }
  return celdas;
}

/* ─── Estado interno ────────────────────────────────────────────────── */

/* Los tipos públicos del contrato son readonly; el núcleo interno muta
   sus entidades durante la simulación y proyecta copias al exterior. */
type UnidadInterna = Omit<EntidadTactica, 'fila' | 'columna' | 'puntosVida' | 'puntosAccion'> & {
  fila: number;
  columna: number;
  puntosVida: number;
  puntosAccion: number;
};
type EdificioInterno = Omit<EdificioTactico, 'faccion' | 'puntosVida'> & {
  faccion: 'auriga' | 'vector' | 'neutral';
  puntosVida: number;
};

interface Núcleo {
  tick: number;
  estado: 'ejecutando' | 'pausada' | 'finalizada';
  terreno: TipoTerreno[];
  unidades: UnidadInterna[];
  edificios: EdificioInterno[];
  eventos: EventoTactico[];
  instantáneas: SimulationState[];
  ganador: 'auriga' | 'vector' | null;
  ticksDominio: { auriga: number; vector: number };
  créditos: { auriga: number; vector: number };
  contadorIds: number;
  cicloProducción: { auriga: number; vector: number };
  controlManual: { auriga: boolean; vector: boolean };
}

function crearUnidad(núcleo: Núcleo, facción: 'auriga' | 'vector', rol: RolUnidad, fila: number, columna: number): UnidadInterna {
  const stats = ESTADISTICAS_ROL[rol];
  const id = `u${núcleo.contadorIds}`;
  núcleo.contadorIds += 1;
  return {
    id,
    faccion: facción,
    tipo: 'unidad',
    rol,
    fila,
    columna,
    puntosVida: stats.pv,
    puntosVidaMax: stats.pv,
    ataque: stats.at,
    rango: stats.rango,
    puntosAccion: stats.mov,
    puntosAccionMax: stats.mov,
    movimiento: stats.mov,
  };
}

function crearEdificio(
  núcleo: Núcleo,
  tipo: EdificioInterno['tipo'],
  facción: 'auriga' | 'vector' | 'neutral',
  fila: number,
  columna: number,
): EdificioInterno {
  const id = `e${núcleo.contadorIds}`;
  núcleo.contadorIds += 1;
  const pv = tipo === 'base' ? 500 : tipo === 'generador' ? 200 : 150;
  return { id, faccion: facción, tipo, fila, columna, puntosVida: pv, puntosVidaMax: pv };
}

function crearNúcleo(): Núcleo {
  const núcleo: Núcleo = {
    tick: 0,
    estado: 'pausada',
    terreno: parsearTerreno(),
    unidades: [],
    edificios: [],
    eventos: [],
    instantáneas: [],
    ganador: null,
    ticksDominio: { auriga: 0, vector: 0 },
    créditos: { auriga: 180, vector: 180 },
    contadorIds: 0,
    cicloProducción: { auriga: 0, vector: 0 },
    controlManual: { auriga: false, vector: false },
  };

  // Bases y generadores
  núcleo.edificios.push(crearEdificio(núcleo, 'base', 'auriga', 6, 1));
  núcleo.edificios.push(crearEdificio(núcleo, 'generador', 'auriga', 6, 3));
  núcleo.edificios.push(crearEdificio(núcleo, 'base', 'vector', 6, 18));
  núcleo.edificios.push(crearEdificio(núcleo, 'generador', 'vector', 6, 16));

  // Nodos de recursos neutrales (simétricos)
  for (const [fila, columna] of [
    [2, 7], [2, 12], [9, 7], [9, 12],
  ] as const) {
    núcleo.edificios.push(crearEdificio(núcleo, 'nodo-recursos', 'neutral', fila, columna));
  }

  // Puntos estratégicos (condición de dominio)
  núcleo.edificios.push(crearEdificio(núcleo, 'punto-estrategico', 'neutral', 3, 9));
  núcleo.edificios.push(crearEdificio(núcleo, 'punto-estrategico', 'neutral', 8, 10));

  // Unidades iniciales (simetría especular)
  núcleo.unidades.push(
    crearUnidad(núcleo, 'auriga', 'infanteria', 7, 3),
    crearUnidad(núcleo, 'auriga', 'infanteria', 5, 3),
    crearUnidad(núcleo, 'auriga', 'explorador', 6, 4),
    crearUnidad(núcleo, 'auriga', 'francotirador', 8, 2),
    crearUnidad(núcleo, 'vector', 'infanteria', 7, 16),
    crearUnidad(núcleo, 'vector', 'infanteria', 5, 16),
    crearUnidad(núcleo, 'vector', 'explorador', 6, 15),
    crearUnidad(núcleo, 'vector', 'francotirador', 8, 17),
  );

  return núcleo;
}

/* ─── Utilidades del mundo ──────────────────────────────────────────── */

function terrenoEn(núcleo: Núcleo, fila: number, columna: number): TipoTerreno {
  return núcleo.terreno[fila * ANCHO + columna] ?? 'llanura';
}

function ocupado(núcleo: Núcleo, fila: number, columna: number): boolean {
  return (
    núcleo.unidades.some((u) => u.fila === fila && u.columna === columna) ||
    núcleo.edificios.some((e) => e.fila === fila && e.columna === columna)
  );
}

function transitable(núcleo: Núcleo, fila: number, columna: number): boolean {
  if (fila < 0 || fila >= ALTO || columna < 0 || columna >= ANCHO) return false;
  return Number.isFinite(COSTE_TERRENO[terrenoEn(núcleo, fila, columna)]);
}

function distancia(a: { fila: number; columna: number }, b: { fila: number; columna: number }): number {
  return Math.max(Math.abs(a.fila - b.fila), Math.abs(a.columna - b.columna));
}

/** BFS de coste uniforme por terreno; devuelve el primer paso hacia el destino. */
function primerPasoHacia(
  núcleo: Núcleo,
  origen: { fila: number; columna: number },
  destino: { fila: number; columna: number },
  pasosDisponibles: number,
): { fila: number; columna: number } | null {
  if (origen.fila === destino.fila && origen.columna === destino.columna) return null;
  const clave = (fila: number, columna: number): number => fila * ANCHO + columna;
  const previo = new Map<number, number>();
  const coste = new Map<number, number>([[clave(origen.fila, origen.columna), 0]]);
  const pendientes: Array<{ fila: number; columna: number; g: number }> = [{ ...origen, g: 0 }];
  const destinoClave = clave(destino.fila, destino.columna);

  while (pendientes.length > 0) {
    pendientes.sort((x, y) => x.g - y.g);
    const actual = pendientes.shift()!;
    if (clave(actual.fila, actual.columna) === destinoClave) break;
    for (const df of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        if (df === 0 && dc === 0) continue;
        const fila = actual.fila + df;
        const columna = actual.columna + dc;
        if (!transitable(núcleo, fila, columna)) continue;
        const esDestino = fila === destino.fila && columna === destino.columna;
        if (!esDestino && ocupado(núcleo, fila, columna)) continue;
        const nuevoCoste = actual.g + COSTE_TERRENO[terrenoEn(núcleo, fila, columna)];
        const claveVecina = clave(fila, columna);
        if (nuevoCoste <= pasosDisponibles && nuevoCoste < (coste.get(claveVecina) ?? Number.POSITIVE_INFINITY)) {
          coste.set(claveVecina, nuevoCoste);
          previo.set(claveVecina, clave(actual.fila, actual.columna));
          pendientes.push({ fila, columna, g: nuevoCoste });
        }
      }
    }
  }

  if (!previo.has(destinoClave)) return null;
  let cursor = destinoClave;
  while (previo.get(cursor) !== clave(origen.fila, origen.columna)) {
    const anterior = previo.get(cursor);
    if (anterior === undefined) return null;
    cursor = anterior;
  }
  return { fila: Math.floor(cursor / ANCHO), columna: cursor % ANCHO };
}

function registrar(núcleo: Núcleo, evento: Omit<EventoTactico, 'tick'>): void {
  núcleo.eventos.unshift({ ...evento, tick: núcleo.tick });
  if (núcleo.eventos.length > 160) núcleo.eventos.pop();
}

/* ─── IA de demostración (heurística, NO neuronal) ───────────────────── */

function objetivoDeUnidad(núcleo: Núcleo, unidad: UnidadInterna, facción: 'auriga' | 'vector'):
  { fila: number; columna: number } | null {
  const enemiga = facción === 'auriga' ? 'vector' : 'auriga';

  // 1. Enemigo cercano: la unidad más próxima alcanzable
  const enemigos = núcleo.unidades.filter((u) => u.faccion === enemiga);
  if (enemigos.length > 0) {
    const másCercano = enemigos.reduce((mejor, actual) =>
      distancia(unidad, actual) < distancia(unidad, mejor) ? actual : mejor,
    );
    if (distancia(unidad, másCercano) <= unidad.rango + unidad.movimiento + 2) {
      return { fila: másCercano.fila, columna: másCercano.columna };
    }
  }

  // 2. Capturable más cercano: nodo o punto sin dueño o enemigo
  const capturables = núcleo.edificios.filter(
    (e) => (e.tipo === 'nodo-recursos' || e.tipo === 'punto-estrategico') && e.faccion !== facción,
  );
  if (capturables.length > 0) {
    const másCercano = capturables.reduce((mejor, actual) =>
      distancia(unidad, actual) < distancia(unidad, mejor) ? actual : mejor,
    );
    return { fila: másCercano.fila, columna: másCercano.columna };
  }

  // 3. Base enemiga
  const baseEnemiga = núcleo.edificios.find((e) => e.tipo === 'base' && e.faccion === enemiga);
  return baseEnemiga === undefined ? null : { fila: baseEnemiga.fila, columna: baseEnemiga.columna };
}

function moverUnidad(núcleo: Núcleo, unidad: UnidadInterna, destino: { fila: number; columna: number }): void {
  const paso = primerPasoHacia(núcleo, unidad, destino, unidad.puntosAccion);
  if (paso === null) return;
  unidad.fila = paso.fila;
  unidad.columna = paso.columna;
  unidad.puntosAccion -= COSTE_TERRENO[terrenoEn(núcleo, paso.fila, paso.columna)];
  // Captura al pisar un capturable
  const capturable = núcleo.edificios.find(
    (e) =>
      (e.tipo === 'nodo-recursos' || e.tipo === 'punto-estrategico') &&
      e.fila === unidad.fila &&
      e.columna === unidad.columna &&
      e.faccion !== unidad.faccion,
  );
  if (capturable !== undefined) {
    capturable.faccion = unidad.faccion;
    registrar(núcleo, {
      tipo: 'captura',
      faccion: unidad.faccion,
      descripcion: `${ESTADISTICAS_ROL[unidad.rol].nombre} captura ${capturable.tipo === 'nodo-recursos' ? 'nodo de recursos' : 'punto estratégico'} (${capturable.fila},${capturable.columna})`,
    });
  }
}

function atacar(núcleo: Núcleo, atacante: { fila: number; columna: number; ataque: number; faccion: string }, objetivo: UnidadInterna | EdificioInterno): void {
  const defensa = 'rol' in objetivo ? DEFENSA_TERRENO[terrenoEn(núcleo, objetivo.fila, objetivo.columna)] ?? 0 : 0;
  const daño = Math.max(4, Math.round(atacante.ataque * (1 - defensa)));
  objetivo.puntosVida -= daño;
  const nombreObjetivo = 'rol' in objetivo
    ? `${ESTADISTICAS_ROL[objetivo.rol].nombre} ${objetivo.id}`
    : `${objetivo.tipo} ${objetivo.id}`;
  registrar(núcleo, {
    tipo: 'ataque',
    faccion: atacante.faccion as 'auriga' | 'vector',
    descripcion: `${atacante.faccion} ataca a ${nombreObjetivo}: ${daño} de daño (${Math.max(0, objetivo.puntosVida)}/${objetivo.puntosVidaMax} PV)`,
  });
  if (objetivo.puntosVida <= 0) {
    if ('rol' in objetivo) {
      núcleo.unidades = núcleo.unidades.filter((u) => u.id !== objetivo.id);
    } else {
      núcleo.edificios = núcleo.edificios.filter((e) => e.id !== objetivo.id);
      registrar(núcleo, { tipo: 'fin', faccion: objetivo.faccion === 'neutral' ? 'neutral' : objetivo.faccion === 'auriga' ? 'vector' : 'auriga', descripcion: `${nombreObjetivo} destruido` });
    }
  }
}

function turnoDeFacción(núcleo: Núcleo, facción: 'auriga' | 'vector'): void {
  const enemiga = facción === 'auriga' ? 'vector' : 'auriga';
  for (const unidad of [...núcleo.unidades]) {
    if (unidad.faccion !== facción) continue;
    if (núcleo.ganador !== null || núcleo.estado === 'finalizada') return;

    // ¿Enemigo en rango? (unidades primero, luego edificios)
    const enemigosUnidades = núcleo.unidades.filter((u) => u.faccion === enemiga && distancia(unidad, u) <= unidad.rango);
    if (enemigosUnidades.length > 0) {
      const másDébil = enemigosUnidades.reduce((mejor, actual) => (actual.puntosVida < mejor.puntosVida ? actual : mejor));
      atacar(núcleo, unidad, másDébil);
      unidad.puntosAccion = 0;
      continue;
    }
    const enemigosEdificios = núcleo.edificios.filter(
      (e) => e.faccion === enemiga && distancia(unidad, e) <= unidad.rango,
    );
    if (enemigosEdificios.length > 0) {
      atacar(núcleo, unidad, enemigosEdificios[0]!);
      unidad.puntosAccion = 0;
      continue;
    }

    // Mover hacia el objetivo
    const objetivo = objetivoDeUnidad(núcleo, unidad, facción);
    if (objetivo !== null) {
      moverUnidad(núcleo, unidad, objetivo);
    }
  }
}

function economía(núcleo: Núcleo): void {
  for (const facción of ['auriga', 'vector'] as const) {
    let ingresos = 2; // base
    for (const edificio of núcleo.edificios) {
      if (edificio.faccion === facción && edificio.tipo === 'generador') ingresos += 3;
      if (edificio.faccion === facción && edificio.tipo === 'nodo-recursos') ingresos += 5;
    }
    núcleo.créditos[facción] += ingresos;
  }
}

function producir(núcleo: Núcleo, facción: 'auriga' | 'vector'): void {
  const base = núcleo.edificios.find((e) => e.tipo === 'base' && e.faccion === facción);
  if (base === undefined) return;
  const ciclo = ['infanteria', 'explorador', 'infanteria', 'francotirador', 'blindado'] as const;
  if (núcleo.tick % 6 !== 0) return;
  const paso = núcleo.cicloProducción[facción];
  const rol = ciclo[paso % ciclo.length]!;
  const stats = ESTADISTICAS_ROL[rol];
  if (núcleo.créditos[facción] < stats.coste) return;

  // celda libre adyacente a la base
  const celdas: Array<[number, number]> = [
    [base.fila - 1, base.columna], [base.fila + 1, base.columna],
    [base.fila, base.columna + (facción === 'auriga' ? 1 : -1)], [base.fila - 1, base.columna + (facción === 'auriga' ? 1 : -1)],
    [base.fila + 1, base.columna + (facción === 'auriga' ? 1 : -1)],
  ];
  const celda = celdas.find(([fila, columna]) => transitable(núcleo, fila, columna) && !ocupado(núcleo, fila, columna));
  if (celda === undefined) return;
  núcleo.créditos[facción] -= stats.coste;
  núcleo.cicloProducción[facción] = paso + 1;
  const nueva = crearUnidad(núcleo, facción, rol, celda[0], celda[1]);
  núcleo.unidades.push(nueva);
  registrar(núcleo, {
    tipo: 'produccion',
    faccion: facción,
    descripcion: `${facción} produce ${stats.nombre} (−${stats.coste} créditos)`,
  });
}

function comprobarVictoria(núcleo: Núcleo): void {
  const baseA = núcleo.edificios.find((e) => e.tipo === 'base' && e.faccion === 'auriga');
  const baseB = núcleo.edificios.find((e) => e.tipo === 'base' && e.faccion === 'vector');
  if (baseA === undefined) {
    núcleo.ganador = 'vector';
  } else if (baseB === undefined) {
    núcleo.ganador = 'auriga';
  } else {
    const puntos = núcleo.edificios.filter((e) => e.tipo === 'punto-estrategico');
    const controlA = puntos.filter((p) => p.faccion === 'auriga').length;
    const controlB = puntos.filter((p) => p.faccion === 'vector').length;
    if (puntos.length > 0 && controlA === puntos.length) núcleo.ticksDominio.auriga += 1;
    else núcleo.ticksDominio.auriga = 0;
    if (puntos.length > 0 && controlB === puntos.length) núcleo.ticksDominio.vector += 1;
    else núcleo.ticksDominio.vector = 0;
    if (núcleo.ticksDominio.auriga >= TICKS_DOMINIO_VICTORIA) núcleo.ganador = 'auriga';
    if (núcleo.ticksDominio.vector >= TICKS_DOMINIO_VICTORIA) núcleo.ganador = 'vector';
  }
  if (núcleo.ganador !== null) {
    núcleo.estado = 'finalizada';
    registrar(núcleo, { tipo: 'fin', descripcion: `Victoria de ${núcleo.ganador} en el tick ${núcleo.tick}` });
  } else if (núcleo.tick >= TICKS_LIMITE) {
    núcleo.estado = 'finalizada';
    registrar(núcleo, { tipo: 'fin', descripcion: `Límite de ${TICKS_LIMITE} ticks alcanzado sin vencedor` });
  }
}

/* ─── Instantánea pública (contrato) ────────────────────────────────── */

function resumenFacciones(núcleo: Núcleo): FaccionTactica[] {
  return [
    {
      id: 'auriga',
      nombre: 'Áuriga',
      color: '#e8b64c',
      creditos: núcleo.créditos.auriga,
      unidadesVivas: núcleo.unidades.filter((u) => u.faccion === 'auriga').length,
      zonasControladas: núcleo.edificios.filter((e) => e.faccion === 'auriga' && e.tipo !== 'base' && e.tipo !== 'generador').length,
    },
    {
      id: 'vector',
      nombre: 'Véctor',
      color: '#7cc4ff',
      creditos: núcleo.créditos.vector,
      unidadesVivas: núcleo.unidades.filter((u) => u.faccion === 'vector').length,
      zonasControladas: núcleo.edificios.filter((e) => e.faccion === 'vector' && e.tipo !== 'base' && e.tipo !== 'generador').length,
    },
  ];
}

function instantánea(núcleo: Núcleo, conHistorial: boolean): SimulationState {
  return {
    simulacionId: SIMULACION_TACTICA.id,
    versionReglas: SIMULACION_TACTICA.versionReglas,
    tick: núcleo.tick,
    estado: núcleo.estado,
    ancho: ANCHO,
    alto: ALTO,
    terreno: [...núcleo.terreno],
    facciones: resumenFacciones(núcleo),
    unidades: núcleo.unidades.map((u) => ({ ...u })),
    edificios: núcleo.edificios.map((e) => ({ ...e })),
    eventos: conHistorial ? núcleo.eventos.map((e) => ({ ...e })) : [],
    ganador: núcleo.ganador,
    instantaneas: núcleo.instantáneas.length,
  };
}

/* ─── Adaptador público ─────────────────────────────────────────────── */

export class SimulacionTactica implements SimulationAdapter {
  readonly simulacionId = SIMULACION_TACTICA.id;
  readonly versionReglas = SIMULACION_TACTICA.versionReglas;
  readonly esquemaObservacion = SIMULACION_TACTICA.esquemaObservacion;
  readonly catalogoAcciones = SIMULACION_TACTICA.catalogoAcciones;

  private núcleo = crearNúcleo();
  private oyentes = new Set<(estado: SimulationState) => void>();
  private vistaTick = 0; // tick visualizado para la reproducción
  private caché: SimulationState | null = null; // requisito de useSyncExternalStore

  obtenerEstado(): SimulationState {
    if (this.caché !== null) return this.caché;
    this.caché = this.construirEstado();
    return this.caché;
  }

  private construirEstado(): SimulationState {
    if (this.vistaTick === this.núcleo.tick) return instantánea(this.núcleo, true);
    const guardada = this.núcleo.instantáneas[this.vistaTick];
    if (guardada === undefined) return instantánea(this.núcleo, true);
    return { ...guardada, eventos: this.núcleo.eventos.map((e) => ({ ...e })), instantaneas: this.núcleo.instantáneas.length };
  }

  suscribir(oyente: (estado: SimulationState) => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  private notificar(): void {
    this.caché = null;
    for (const oyente of this.oyentes) oyente(this.obtenerEstado());
  }

  despachar(comando: SimulationCommand): void {
    switch (comando.tipo) {
      case 'iniciar':
        this.núcleo.estado = 'ejecutando';
        this.vistaTick = this.núcleo.tick;
        registrar(this.núcleo, { tipo: 'movimiento', descripcion: 'Simulación iniciada por el observador' });
        break;
      case 'pausar':
        if (this.núcleo.estado === 'ejecutando') this.núcleo.estado = 'pausada';
        break;
      case 'reanudar':
        if (this.núcleo.estado === 'pausada') this.núcleo.estado = 'ejecutando';
        break;
      case 'velocidad':
        // la velocidad la aplica el conductor (componente) sobre sus intervalos
        break;
      case 'reiniciar':
        this.núcleo = crearNúcleo();
        this.vistaTick = 0;
        break;
      case 'saltar-a-tick':
        this.vistaTick = Math.max(0, Math.min(comando.tick, this.núcleo.tick));
        if (this.vistaTick === this.núcleo.tick) this.núcleo.estado = this.núcleo.estado === 'finalizada' ? 'finalizada' : 'pausada';
        break;
      case 'orden': {
        // Solo se admiten órdenes sobre unidades de una facción bajo control manual
        this.aplicarOrden(comando.orden);
        break;
      }
    }
    this.notificar();
  }

  private aplicarOrden(orden: OrdenTactica): void {
    const unidad = this.núcleo.unidades.find((u) => u.id === orden.unidadId);
    if (unidad === undefined) return;
    if (this.núcleo.estado === 'finalizada') return;
    if (unidad.faccion !== 'neutral' && !this.núcleo.controlManual[unidad.faccion]) return;
    if (this.vistaTick !== this.núcleo.tick) return; // sin órdenes sobre el pasado
    switch (orden.tipo) {
      case 'mover':
        if (orden.filaObjetivo !== undefined && orden.columnaObjetivo !== undefined) {
          moverUnidad(this.núcleo, unidad, { fila: orden.filaObjetivo, columna: orden.columnaObjetivo });
        }
        break;
      case 'atacar': {
        const objetivo =
          this.núcleo.unidades.find((u) => u.id === orden.objetivoId) ??
          this.núcleo.edificios.find((e) => e.id === orden.objetivoId);
        if (objetivo !== undefined && distancia(unidad, objetivo) <= unidad.rango) {
          atacar(this.núcleo, unidad, objetivo);
          unidad.puntosAccion = 0;
        }
        break;
      }
      case 'capturar': {
        const objetivo = this.núcleo.edificios.find((e) => e.id === orden.objetivoId);
        if (objetivo !== undefined && distancia(unidad, objetivo) <= 1 && objetivo.faccion !== unidad.faccion) {
          objetivo.faccion = unidad.faccion;
          registrar(this.núcleo, { tipo: 'captura', faccion: unidad.faccion, descripcion: `Orden manual: captura de ${objetivo.tipo} (${objetivo.fila},${objetivo.columna})` });
        }
        break;
      }
      case 'mantener':
        unidad.puntosAccion = 0;
        break;
    }
  }

  ordenesDisponibles(unidadId: string): readonly OrdenTactica[] {
    const unidad = this.núcleo.unidades.find((u) => u.id === unidadId);
    if (unidad === undefined) return [];
    const órdenes: OrdenTactica[] = [];
    const enemiga = unidad.faccion === 'auriga' ? 'vector' : 'auriga';
    for (const enemigo of this.núcleo.unidades.filter((u) => u.faccion === enemiga && distancia(unidad, u) <= unidad.rango)) {
      órdenes.push({ tipo: 'atacar', unidadId, objetivoId: enemigo.id });
    }
    for (const edificio of this.núcleo.edificios.filter((e) => e.faccion === enemiga && distancia(unidad, e) <= unidad.rango)) {
      órdenes.push({ tipo: 'atacar', unidadId, objetivoId: edificio.id });
    }
    for (const capturable of this.núcleo.edificios.filter(
      (e) => (e.tipo === 'nodo-recursos' || e.tipo === 'punto-estrategico') && e.faccion !== unidad.faccion && distancia(unidad, e) <= 1,
    )) {
      órdenes.push({ tipo: 'capturar', unidadId, objetivoId: capturable.id });
    }
    for (const df of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        const fila = unidad.fila + df;
        const columna = unidad.columna + dc;
        if ((df !== 0 || dc !== 0) && transitable(this.núcleo, fila, columna) && !ocupado(this.núcleo, fila, columna)) {
          órdenes.push({ tipo: 'mover', unidadId, filaObjetivo: fila, columnaObjetivo: columna });
        }
      }
    }
    órdenes.push({ tipo: 'mantener', unidadId });
    return órdenes;
  }

  /** Avanza un tick de la simulación (lo invoca el conductor del reloj). */
  avanzarTick(): void {
    if (this.núcleo.estado !== 'ejecutando') return;
    this.núcleo.instantáneas.push(instantánea(this.núcleo, false));
    if (this.núcleo.instantáneas.length > TICKS_LIMITE + 1) this.núcleo.instantáneas.shift();
    this.núcleo.tick += 1;
    for (const unidad of this.núcleo.unidades) unidad.puntosAccion = unidad.puntosAccionMax;
    economía(this.núcleo);
    if (!this.núcleo.controlManual.auriga) turnoDeFacción(this.núcleo, 'auriga');
    if (!this.núcleo.controlManual.vector) turnoDeFacción(this.núcleo, 'vector');
    producir(this.núcleo, 'auriga');
    producir(this.núcleo, 'vector');
    comprobarVictoria(this.núcleo);
    this.vistaTick = this.núcleo.tick;
    this.notificar();
  }

  /** Activa o desactiva el control manual del observador sobre una facción. */
  establecerControl(facción: 'auriga' | 'vector', activo: boolean): void {
    this.núcleo.controlManual[facción] = activo;
    this.notificar();
  }

  get tickActual(): number {
    return this.núcleo.tick;
  }

  get totalInstantáneas(): number {
    return this.núcleo.instantáneas.length;
  }
}
