import { useCallback, useEffect, useRef, useState } from 'react';
import { obtenerJuego } from '../../dominio/juegos/registro';
import { CronistaPartida } from '../../dominio/motor/partida';
import type { ConfigPartida, RegistroPartida } from '../../dominio/motor/partida';
import type { EstadisticasBusqueda, JuegoConcreto, Jugador, ResultadoTerminal } from '../../dominio/motor/tipos';
import { ClienteTrabajador } from '../../trabajadores/cliente';
import { prefiereMovimientoReducido } from './useTema';

export type FasePartida =
  | { tipo: 'configuracion' }
  | { tipo: 'en-curso'; pendienteHumano: boolean; pensando: boolean }
  | { tipo: 'terminada'; registro: RegistroPartida }
  | { tipo: 'reproduccion'; registro: RegistroPartida; indice: number; automatica: boolean };

export interface JugadaVista {
  readonly notacion: string;
  readonly jugador: Jugador;
  readonly estadisticas: EstadisticasBusqueda;
}

export interface EstadoPartidaInteractiva {
  fase: FasePartida;
  estadoCodificado: string;
  jugadas: readonly JugadaVista[];
  resultado: ResultadoTerminal | null;
  movimientosLegales: readonly unknown[];
}

const PAUSA_ENTRE_JUGADAS_MS = 420;

const pausar = (ms: number) =>
  new Promise<void>((resolver) => {
    setTimeout(resolver, prefiereMovimientoReducido() ? 0 : ms);
  });

/**
 * Máquina de estados de la partida interactiva: alterna decisiones de IA
 * (vía trabajador web) con la espera de jugadas humanas, y produce el
 * mismo RegistroPartida que el ejecutor automático (mismo cronista).
 */
export function usePartida(cliente: ClienteTrabajador): {
  estado: EstadoPartidaInteractiva | null;
  iniciar: (config: ConfigPartida) => Promise<void>;
  jugarHumano: (notacion: string) => void;
  cancelar: () => void;
  reproducir: (registro: RegistroPartida) => void;
  moverReproduccion: (indice: number) => void;
  alternarReproduccionAutomatica: () => void;
  salirDeReproduccion: () => void;
} {
  const [estado, setEstado] = useState<EstadoPartidaInteractiva | null>(null);
  const juegoRef = useRef<JuegoConcreto | null>(null);
  const estadoRef = useRef<object | null>(null);
  const cronistaRef = useRef<CronistaPartida | null>(null);
  const configRef = useRef<ConfigPartida | null>(null);
  const jugadasRef = useRef<JugadaVida[]>([]);
  const esperandoHumanoRef = useRef<((notacion: string) => void) | null>(null);
  const canceladoRef = useRef(false);

  type JugadaVida = JugadaVista;

  const publicar = useCallback(
    (extra: Partial<EstadoPartidaInteractiva> & { fase?: FasePartida } = {}) => {
      const juego = juegoRef.current;
      const estadoActual = estadoRef.current;
      if (juego === null || estadoActual === null) return;
      setEstado({
        fase: { tipo: 'en-curso', pendienteHumano: false, pensando: false },
        estadoCodificado: juego.codificar(estadoActual),
        jugadas: [...jugadasRef.current],
        resultado: juego.resultado(estadoActual),
        movimientosLegales: juego.esTerminal(estadoActual)
          ? []
          : juego.movimientosLegales(estadoActual),
        ...extra,
      });
    },
    [],
  );

  const finalizar = useCallback(() => {
    const juego = juegoRef.current;
    const cronista = cronistaRef.current;
    const config = configRef.current;
    const estadoActual = estadoRef.current;
    if (juego === null || cronista === null || config === null || estadoActual === null) {
      return;
    }
    const resultado = juego.resultado(estadoActual);
    const registro = cronista.finalizar(resultado, []);
    jugadasRef.current = [];
    esperandoHumanoRef.current = null;
    juegoRef.current = null;
    estadoRef.current = null;
    cronistaRef.current = null;
    configRef.current = null;
    setEstado({
      fase: { tipo: 'terminada', registro },
      estadoCodificado: juego.codificar(estadoActual),
      jugadas: registro.movimientos.map((m) => ({
        notacion: m.notacion,
        jugador: m.jugador,
        estadisticas: m.estadisticas,
      })),
      resultado: registro.resultado,
      movimientosLegales: [],
    });
  }, []);

  const iniciar = useCallback(
    async (config: ConfigPartida) => {
      canceladoRef.current = false;
      const juego = obtenerJuego(config.juegoId);
      juegoRef.current = juego;
      estadoRef.current = juego.crearEstadoInicial();
      cronistaRef.current = new CronistaPartida(juego, config);
      configRef.current = config;
      jugadasRef.current = [];
      publicar();

      while (!juego.esTerminal(estadoRef.current) && !canceladoRef.current) {
        const jugador = juego.jugadorActual(estadoRef.current);
        const infoAgente = config.agentes[jugador - 1];
        if (infoAgente === undefined) break;
        const indiceJugada = cronistaRef.current?.numeroJugadas() ?? 0;

        if (infoAgente.id === 'humano') {
          setEstado((previo) =>
            previo === null
              ? previo
              : { ...previo, fase: { tipo: 'en-curso', pendienteHumano: true, pensando: false } },
          );
          const notacion = await new Promise<string>((resolver) => {
            esperandoHumanoRef.current = resolver;
          });
          if (canceladoRef.current) break;
          const movimiento = juego.analizarMovimiento(notacion);
          if (movimiento === null) continue;
          const comprobacion = juego.validarMovimiento(estadoRef.current, movimiento);
          if (!comprobacion.valido) continue; // la UI deshabilita celdas ilegales
          estadoRef.current = juego.aplicarMovimiento(estadoRef.current, movimiento);
          cronistaRef.current?.registrar(jugador, notacion, { tiempoMs: 0 });
          jugadasRef.current.push({ notacion, jugador, estadisticas: { tiempoMs: 0 } });
          publicar();
          continue;
        }

        setEstado((previo) =>
          previo === null
            ? previo
            : { ...previo, fase: { tipo: 'en-curso', pendienteHumano: false, pensando: true } },
        );
        const decision = await cliente.calcularMovimiento(
          juego.id,
          juego.codificar(estadoRef.current),
          infoAgente,
          config.semilla,
          indiceJugada,
          jugador,
        );
        if (canceladoRef.current) break;
        const movimiento = juego.analizarMovimiento(decision.notacion);
        if (movimiento === null) break;
        const comprobacion = juego.validarMovimiento(estadoRef.current, movimiento);
        if (!comprobacion.valido) break;
        estadoRef.current = juego.aplicarMovimiento(estadoRef.current, movimiento);
        cronistaRef.current?.registrar(jugador, decision.notacion, decision.estadisticas);
        jugadasRef.current.push({
          notacion: decision.notacion,
          jugador,
          estadisticas: decision.estadisticas,
        });
        publicar();
        await pausar(PAUSA_ENTRE_JUGADAS_MS);
      }

      if (!canceladoRef.current) {
        finalizar();
      }
    },
    [cliente, publicar, finalizar],
  );

  const jugarHumano = useCallback((notacion: string) => {
    const resolver = esperandoHumanoRef.current;
    if (resolver !== null) {
      esperandoHumanoRef.current = null;
      resolver(notacion);
    }
  }, []);

  const cancelar = useCallback(() => {
    canceladoRef.current = true;
    const resolver = esperandoHumanoRef.current;
    if (resolver !== null) {
      esperandoHumanoRef.current = null;
      resolver('');
    }
    juegoRef.current = null;
    estadoRef.current = null;
    cronistaRef.current = null;
    configRef.current = null;
    jugadasRef.current = [];
    setEstado(null);
  }, []);

  const reproducir = useCallback((registro: RegistroPartida) => {
    canceladoRef.current = true;
    const juego = obtenerJuego(registro.juego.id);
    setEstado({
      fase: { tipo: 'reproduccion', registro, indice: 0, automatica: false },
      estadoCodificado: juego.codificar(juego.crearEstadoInicial()),
      jugadas: registro.movimientos.map((m) => ({
        notacion: m.notacion,
        jugador: m.jugador,
        estadisticas: m.estadisticas,
      })),
      resultado: null,
      movimientosLegales: [],
    });
  }, []);

  const moverReproduccion = useCallback((indiceDestino: number) => {
    setEstado((previo) => {
      if (previo === null || previo.fase.tipo !== 'reproduccion') return previo;
      const juego = obtenerJuego(previo.fase.registro.juego.id);
      const limite = previo.fase.registro.movimientos.length;
      const indice = Math.max(0, Math.min(indiceDestino, limite));
      let estadoLocal: object = juego.crearEstadoInicial();
      for (let i = 0; i < indice; i++) {
        const notacion = previo.fase.registro.movimientos[i]?.notacion;
        if (notacion === undefined) break;
        const movimiento = juego.analizarMovimiento(notacion);
        if (movimiento === null) break;
        estadoLocal = juego.aplicarMovimiento(estadoLocal, movimiento);
      }
      return {
        ...previo,
        fase: { ...previo.fase, indice },
        estadoCodificado: juego.codificar(estadoLocal),
        resultado: juego.resultado(estadoLocal),
      };
    });
  }, []);

  const alternarReproduccionAutomatica = useCallback(() => {
    setEstado((previo) => {
      if (previo === null || previo.fase.tipo !== 'reproduccion') return previo;
      return { ...previo, fase: { ...previo.fase, automatica: !previo.fase.automatica } };
    });
  }, []);

  const salirDeReproduccion = useCallback(() => {
    setEstado(null);
  }, []);

  // Reproducción automática: temporizador como efecto, no durante el render.
  useEffect(() => {
    if (estado === null || estado.fase.tipo !== 'reproduccion' || !estado.fase.automatica) {
      return;
    }
    const limite = estado.fase.registro.movimientos.length;
    if (estado.fase.indice >= limite) return;
    const id = setTimeout(() => {
      moverReproduccion(estado.fase.tipo === 'reproduccion' ? estado.fase.indice + 1 : 0);
    }, PAUSA_ENTRE_JUGADAS_MS);
    return () => clearTimeout(id);
  }, [estado, moverReproduccion]);

  return {
    estado,
    iniciar,
    jugarHumano,
    cancelar,
    reproducir,
    moverReproduccion,
    alternarReproduccionAutomatica,
    salirDeReproduccion,
  };
}
