/**
 * Panel de cerebros .lba (Tarea G): importar, validar, activar, clonar,
 * ramificar, exportar e inspeccionar manifiestos. Estados vacíos honestos:
 * hasta que no hay datos reales importados, se dice tal cual.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Almacenamiento } from '../../aplicacion/almacen';
import { RegistroCerebros } from '../../aplicacion/registroCerebros';
import type { CerebroConEstado, EstadoCerebro } from '../../aplicacion/registroCerebros';
import { cerebrosCargados, desregistrarCerebroCargado } from '../../dominio/agentes/registro';
import { leerTensores } from '../../dominio/lba/safetensors';
import { validarPaqueteLBA } from '../../dominio/lba/validador';
import type { ClienteTrabajador } from '../../trabajadores/cliente';
import { Aviso, EstadoVacio } from './EstadoVacio';

interface PropsPanelCerebros {
  readonly almacen: Almacenamiento;
  readonly cliente: ClienteTrabajador;
  readonly alIrAArena: () => void;
}

interface Mensaje {
  readonly tipo: 'ok' | 'error' | 'info';
  readonly texto: string;
}

const ETIQUETAS_ESTADO: Readonly<Record<EstadoCerebro, { texto: string; clase: string }>> = {
  raiz: { texto: 'Raíz', clase: 'insignia insignia--neutra' },
  candidato: { texto: 'Candidata', clase: 'insignia insignia--candidata' },
  campeon: { texto: 'Campeona', clase: 'insignia insignia--campeona' },
  archivado: { texto: 'Archivada', clase: 'insignia insignia--neutra' },
  incompatible: { texto: 'Incompatible', clase: 'insignia insignia--peligro' },
};

export function PanelCerebros({ almacen, cliente, alIrAArena }: PropsPanelCerebros) {
  const [registro] = useState(() => new RegistroCerebros(almacen));
  const [cerebros, setCerebros] = useState<readonly CerebroConEstado[]>([]);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [activos, setActivos] = useState<readonly string[]>([]);
  const [detalle, setDetalle] = useState<string | null>(null);
  const entradaArchivo = useRef<HTMLInputElement | null>(null);

  const cargarLista = useCallback(async () => {
    setCerebros(await registro.listar());
    setActivos(cerebrosCargados().map((c) => c.idAgente));
  }, [registro]);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const lista = await registro.listar();
      if (cancelado) return;
      setCerebros(lista);
      setActivos(cerebrosCargados().map((c) => c.idAgente));
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [registro]);

  const importarArchivo = useCallback(
    async (archivo: File) => {
      try {
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        const resultado = await registro.importarPaquete(bytes);
        setMensaje({
          tipo: resultado.resultado === 'colision' ? 'error' : resultado.resultado === 'duplicado' ? 'info' : 'ok',
          texto: resultado.mensaje,
        });
        await cargarLista();
      } catch (error) {
        setMensaje({
          tipo: 'error',
          texto: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [registro, cargarLista],
  );

  const cargar = useCallback(
    async (agentId: string, brainVersion: string) => {
      try {
        const clave = await registro.cargar(agentId, brainVersion);
        // Además del hilo principal, se registra en el TRABAJADOR: las
        // partidas y evaluaciones ejecutan la inferencia allí (contrato §6).
        const exportado = await registro.exportar(agentId, brainVersion);
        const paquete = await validarPaqueteLBA(exportado.bytes);
        const tensores = [...leerTensores(paquete.pesosSafetensors).values()].map((t) => ({
          nombre: t.nombre,
          forma: t.forma,
          datos: t.datos,
        }));
        const claveTrabajador = await cliente.registrarCerebro(paquete.manifiesto, tensores);
        if (claveTrabajador !== clave) {
          setMensaje({ tipo: 'error', texto: `inconsistencia de claves entre hilos (${clave} ≠ ${claveTrabajador})` });
          return;
        }
        setMensaje({ tipo: 'ok', texto: `Cerebro activo como «${clave}» (hilo principal y trabajador): elígelo en la Arena para jugar partidas reales.` });
        await cargarLista();
      } catch (error) {
        setMensaje({ tipo: 'error', texto: error instanceof Error ? error.message : String(error) });
      }
    },
    [registro, cargarLista, cliente],
  );

  const desactivar = useCallback(
    async (clave: string) => {
      desregistrarCerebroCargado(clave);
      try {
        await cliente.retirarCerebro(clave);
      } catch {
        // Sin trabajador (degradación): el registro local ya se retiró.
      }
      await cargarLista();
    },
    [cargarLista, cliente],
  );

  const clonar = useCallback(
    async (agentId: string, brainVersion: string) => {
      try {
        const clon = await registro.clonar(agentId, brainVersion);
        setMensaje({ tipo: 'ok', texto: `Clon creado: ${clon.agentId}@${clon.brainVersion} (mismos pesos, versión nueva).` });
        await cargarLista();
      } catch (error) {
        setMensaje({ tipo: 'error', texto: error instanceof Error ? error.message : String(error) });
      }
    },
    [registro, cargarLista],
  );

  const ramificar = useCallback(
    async (agentId: string, brainVersion: string) => {
      try {
        const rama = await registro.crearRama(agentId, brainVersion);
        setMensaje({
          tipo: 'ok',
          texto: `Rama creada: ${rama.agentId}@${rama.brainVersion}. Exporta el paquete y continúa el entrenamiento con «entrenar.py --reanudar».`,
        });
        await cargarLista();
      } catch (error) {
        setMensaje({ tipo: 'error', texto: error instanceof Error ? error.message : String(error) });
      }
    },
    [registro, cargarLista],
  );

  const exportar = useCallback(
    async (agentId: string, brainVersion: string) => {
      try {
        const paquete = await registro.exportar(agentId, brainVersion);
        const blob = new Blob([paquete.bytes as unknown as BlobPart], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `${agentId}@${brainVersion}.lba`;
        enlace.click();
        URL.revokeObjectURL(url);
        setMensaje({ tipo: 'ok', texto: `Paquete exportado (${paquete.bytes.length} bytes, sha256 ${paquete.sha256.slice(0, 12)}…).` });
      } catch (error) {
        setMensaje({ tipo: 'error', texto: error instanceof Error ? error.message : String(error) });
      }
    },
    [registro],
  );

  return (
    <section className="panel" aria-labelledby="titulo-cerebros">
      <h2 className="panel__titulo" id="titulo-cerebros">
        Cerebros (.lba)
      </h2>
      <p className="panel__descripcion">
        Importa paquetes de cerebro <strong>.lba</strong> (LBA Model Package v1): se validan
        tamaño, contenedor, lista blanca, manifiesto, checksums SHA-256, pesos y
        compatibilidad con el catálogo de juegos <em>antes</em> de registrarse. Una
        importación fallida nunca toca el registro.
      </p>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor="importar-lba">
          Importar paquete .lba
        </label>
        <input
          id="importar-lba"
          ref={entradaArchivo}
          type="file"
          accept=".lba"
          className="seleccion"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            if (archivo !== undefined) void importarArchivo(archivo);
            evento.target.value = '';
          }}
        />
      </div>

      {mensaje !== null && (
        <Aviso tipo={mensaje.tipo === 'ok' ? 'info' : mensaje.tipo === 'error' ? 'error' : 'info'}>
          {mensaje.texto}
        </Aviso>
      )}

      {cerebros.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay cerebros importados"
          descripcion="Importa un paquete .lba generado por el entrenamiento (entrenamiento/entrenar.py) o descárgalo de los artefactos del workflow de Kaggle. Sin datos reales no se muestra nada: ninguna métrica se simula."
        />
      ) : (
        <div className="tarjetas-juego" role="list">
          {cerebros.map((cerebro) => {
            const clave = `neural:${cerebro.registro.agentId}@${cerebro.registro.brainVersion}`;
            const m = cerebro.registro.manifiesto;
            const activo = activos.includes(clave);
            const etiquetaEstado = ETIQUETAS_ESTADO[cerebro.estado];
            return (
              <article className="tarjeta-juego" role="listitem" key={clave}>
                <header className="tarjeta-juego__cabecera">
                  <h3>
                    {m.agentId}@{m.brainVersion}
                  </h3>
                  <span className={etiquetaEstado.clase} aria-label={`Estado: ${etiquetaEstado.texto}`}>
                    {etiquetaEstado.texto}
                  </span>
                </header>
                <dl className="parametros">
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Juego</dt>
                    <dd className="parametro__valor">{m.gameId} (reglas {m.gameRulesVersion})</dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Arquitectura</dt>
                    <dd className="parametro__valor">
                      {m.architecture.tipo} · {m.architecture.entrada.alto}×{m.architecture.entrada.ancho}×
                      {m.architecture.entrada.canales}
                    </dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Padre</dt>
                    <dd className="parametro__valor">{m.parentModelId ?? '— (raíz)'}</dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Ejemplos de entrenamiento</dt>
                    <dd className="parametro__valor">
                      {m.datasetLineage === null
                        ? 'Sin datos'
                        : `${m.datasetLineage.ejemplos} de ${m.datasetLineage.partidas} partidas`}
                    </dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Huella del paquete</dt>
                    <dd className="parametro__valor">{cerebro.registro.huellaPaquete.slice(0, 16)}…</dd>
                  </div>
                  <div className="parametro">
                    <dt className="parametro__etiqueta">Eventos</dt>
                    <dd className="parametro__valor">{cerebro.eventos.length}</dd>
                  </div>
                </dl>
                <div className="acciones">
                  {activo ? (
                    <>
                      <button type="button" className="boton boton--primario" onClick={() => void desactivar(clave)}>
                        Activo ✓ (desactivar)
                      </button>
                      <button type="button" className="boton" onClick={alIrAArena}>
                        Ir a la Arena
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="boton boton--primario"
                      onClick={() => void cargar(cerebro.registro.agentId, cerebro.registro.brainVersion)}
                    >
                      Activar para jugar
                    </button>
                  )}
                  <button
                    type="button"
                    className="boton"
                    onClick={() => void clonar(cerebro.registro.agentId, cerebro.registro.brainVersion)}
                  >
                    Clonar
                  </button>
                  <button
                    type="button"
                    className="boton"
                    onClick={() => void ramificar(cerebro.registro.agentId, cerebro.registro.brainVersion)}
                  >
                    Rama de entrenamiento
                  </button>
                  <button
                    type="button"
                    className="boton"
                    onClick={() => void exportar(cerebro.registro.agentId, cerebro.registro.brainVersion)}
                  >
                    Exportar .lba
                  </button>
                  <button
                    type="button"
                    className="boton boton--peque"
                    aria-expanded={detalle === clave}
                    onClick={() => setDetalle(detalle === clave ? null : clave)}
                  >
                    {detalle === clave ? 'Ocultar manifiesto' : 'Ver manifiesto'}
                  </button>
                </div>
                {detalle === clave && (
                  <pre className="manifiesto-json" tabIndex={0} aria-label="Manifiesto JSON del paquete">
                    {JSON.stringify(m, null, 2)}
                  </pre>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
