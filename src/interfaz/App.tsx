import { useCallback, useState } from 'react';
import { Cabecera } from './componentes/Cabecera';
import { Navegacion } from './componentes/Navegacion';
import type { Vista } from './componentes/Navegacion';
import { PanelArena } from './componentes/PanelArena';
import { PanelResultados } from './componentes/PanelResultados';
import { PanelRegistro } from './componentes/PanelRegistro';
import { PanelAgentes } from './componentes/PanelAgentes';
import { PanelGuia } from './componentes/PanelGuia';
import { useTema } from './ganchos/useTema';
import { useAlmacen } from './ganchos/useAlmacen';
import { useTrabajador } from './ganchos/useTrabajador';
import { usePartida } from './ganchos/usePartida';
import { Aviso } from './componentes/EstadoVacio';

export function App() {
  const { tema, alternarTema } = useTema();
  const almacen = useAlmacen();
  const cliente = useTrabajador();
  const partida = usePartida(cliente);
  const [vista, setVista] = useState<Vista>('arena');

  const irAArena = useCallback(() => setVista('arena'), []);
  const irAResultados = useCallback(() => setVista('resultados'), []);

  const reproducirDesdeResultados = useCallback(
    (registro: Parameters<typeof partida.reproducir>[0]) => {
      partida.reproducir(registro);
      setVista('arena');
    },
    [partida],
  );

  return (
    <>
      <Cabecera tema={tema} onAlternarTema={alternarTema} />
      <Navegacion vista={vista} onCambio={setVista} />

      {almacen.avisos.length > 0 && (
        <div className="principal" style={{ paddingBottom: 0 }} role="alert">
          {almacen.avisos.map((aviso, indice) => (
            <Aviso key={indice} tipo={aviso.includes('corrupto') ? 'error' : 'info'}>
              {aviso}
            </Aviso>
          ))}
        </div>
      )}

      <main className="principal" id="contenido">
        {vista === 'arena' && (
          <PanelArena cliente={cliente} almacen={almacen} alIrAResultados={irAResultados} />
        )}
        {vista === 'resultados' && (
          <PanelResultados
            almacen={almacen}
            alIrAArena={irAArena}
            onReproducir={reproducirDesdeResultados}
          />
        )}
        {vista === 'registro' && <PanelRegistro almacen={almacen} />}
        {vista === 'agentes' && <PanelAgentes />}
        {vista === 'guia' && <PanelGuia />}
      </main>

      <footer className="pie">
        Arena de IAs · Fase 1 — motor de juegos, cuatro niveles de agentes y evaluación con
        integridad de datos. Sin telemetría; funciona sin conexión.
      </footer>
    </>
  );
}
