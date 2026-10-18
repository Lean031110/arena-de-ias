import { useCallback, useEffect, useState } from 'react';
import { crearAlmacenamiento } from '../../aplicacion/almacen';
import type { Almacenamiento } from '../../aplicacion/almacen';
import type { RegistroEvaluacion } from '../../dominio/motor/evaluacion';
import type { RegistroPartida } from '../../dominio/motor/partida';
import { crearEvento } from '../../dominio/motor/eventos';
import type { Evento } from '../../dominio/motor/eventos';
import type { RegistroEventoExterno } from '../../aplicacion/tipos';

export interface EstadoAlmacen {
  readonly disponible: boolean;
  readonly partidas: readonly RegistroPartida[];
  readonly evaluaciones: readonly RegistroEvaluacion[];
  readonly eventos: readonly RegistroEventoExterno[];
  readonly avisos: readonly string[];
  guardarPartida: (registro: RegistroPartida) => Promise<void>;
  guardarEvaluacion: (registro: RegistroEvaluacion) => Promise<void>;
  registrarEvento: (tipo: Evento['tipo'], resumen: string, datos?: unknown) => Promise<void>;
  recargar: () => void;
}

/**
 * Gancho de persistencia: carga inicial, guardados con evento asociado y
 * degradación visible a memoria si IndexedDB falla (R4 de RIESGOS.md).
 */
export function useAlmacen(): EstadoAlmacen {
  const [almacen] = useState<Almacenamiento>(() => crearAlmacenamiento());
  const [disponible, setDisponible] = useState(true);
  const [partidas, setPartidas] = useState<readonly RegistroPartida[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<readonly RegistroEvaluacion[]>([]);
  const [eventos, setEventos] = useState<readonly RegistroEventoExterno[]>([]);
  const [avisos, setAvisos] = useState<readonly string[]>([]);
  const [version, setVersion] = useState(0);

  const agregarAviso = useCallback((mensaje: string) => {
    setAvisos((actuales) => [...actuales, mensaje]);
  }, []);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      try {
        await almacen.abrir();
        const [listadoPartidas, listadoEvaluaciones, listadoEventos] = await Promise.all([
          almacen.listarPartidas(),
          almacen.listarEvaluaciones(),
          almacen.listarEventos(150),
        ]);
        if (cancelado) return;
        setPartidas(listadoPartidas.registros);
        setEvaluaciones(listadoEvaluaciones.registros);
        setEventos(listadoEventos.registros);
        setDisponible(true);
        const corruptos =
          listadoPartidas.corruptos.length +
          listadoEvaluaciones.corruptos.length +
          listadoEventos.corruptos.length;
        if (corruptos > 0) {
          agregarAviso(
            `Se detectaron ${corruptos} registros corruptos en el almacenamiento local; ` +
              'se han aislado y no se muestran como datos válidos.',
          );
        }
      } catch (error) {
        if (cancelado) return;
        setDisponible(false);
        const mensaje = error instanceof Error ? error.message : String(error);
        agregarAviso(
          `No se pudo abrir el almacenamiento local (${mensaje}). ` +
            'La sesión seguirá en memoria: los datos se perderán al cerrar la página.',
        );
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [almacen, agregarAviso, version]);

  const guardarPartida = useCallback(
    async (registro: RegistroPartida) => {
      setPartidas((actuales) => [registro, ...actuales]);
      try {
        await almacen.guardarPartida(registro);
        await almacen.agregarEvento(
          crearEvento('partida', partidaAResumen(registro), { id: registro.id, huella: registro.huella }),
        );
        setVersion((v) => v + 1);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        agregarAviso(`No se pudo guardar la partida en el almacenamiento (${mensaje}).`);
      }
    },
    [almacen, agregarAviso],
  );

  const guardarEvaluacion = useCallback(
    async (registro: RegistroEvaluacion) => {
      setEvaluaciones((actuales) => [registro, ...actuales]);
      try {
        await almacen.guardarEvaluacion(registro);
        for (const partida of registro.partidas) {
          await almacen.guardarPartida(partida);
        }
        await almacen.agregarEvento(
          crearEvento('evaluacion', evaluacionAResumen(registro), {
            id: registro.id,
            huella: registro.huella,
          }),
        );
        setVersion((v) => v + 1);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        agregarAviso(`No se pudo guardar la evaluación en el almacenamiento (${mensaje}).`);
      }
    },
    [almacen, agregarAviso],
  );

  const registrarEvento = useCallback(
    async (tipo: Evento['tipo'], resumen: string, datos?: unknown) => {
      const evento = crearEvento(tipo, resumen, datos);
      setEventos((actuales) => [evento, ...actuales].slice(0, 150));
      try {
        const resultado = await almacen.agregarEvento(evento);
        if (resultado === 'nuevo') {
          setVersion((v) => v + 1);
        }
      } catch {
        // Los eventos son complementarios: si el almacén falla, la sesión
        // continúa con el listado en memoria.
      }
    },
    [almacen],
  );

  return {
    disponible,
    partidas,
    evaluaciones,
    eventos,
    avisos,
    guardarPartida,
    guardarEvaluacion,
    registrarEvento,
    recargar: () => setVersion((v) => v + 1),
  };
}

function partidaAResumen(registro: RegistroPartida): string {
  const agente1 = registro.agentes[0]?.nombre ?? '?';
  const agente2 = registro.agentes[1]?.nombre ?? '?';
  const resultado =
    registro.resultado === null
      ? 'inválida'
      : registro.resultado.tipo === 'empate'
        ? 'empate'
        : `ganó ${registro.resultado.ganador === 1 ? agente1 : agente2}`;
  return `Partida ${registro.juego.id}: ${agente1} vs ${agente2} — ${resultado} (${registro.movimientos.length} jugadas, ${registro.validez})`;
}

function evaluacionAResumen(registro: RegistroEvaluacion): string {
  const agentes = registro.resumenPorAgente.map((r) => `${r.nombre} ${r.puntuacion.toFixed(2)}`);
  return `Evaluación ${registro.juego.id} (${registro.encuentrosPorPar} encuentros por par): ${agentes.join(' · ')}`;
}
