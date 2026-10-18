'use client';

import { MarcoAplicacion } from '@/components/arena/shell/MarcoAplicacion';
import { VistaPanel } from '@/components/arena/panel/VistaPanel';
import { VistaArena } from '@/components/arena/arena/VistaArena';
import { VistaTactico } from '@/components/arena/tactico/VistaTactico';
import { VistaPlantel } from '@/components/arena/plantel/VistaPlantel';
import { VistaImportador } from '@/components/arena/importador/VistaImportador';
import { VistaEntrenamiento } from '@/components/arena/entrenamiento/VistaEntrenamiento';
import { VistaExplorador } from '@/components/arena/explorador/VistaExplorador';
import { VistaTorneos } from '@/components/arena/torneos/VistaTorneos';
import { VistaEstrategias } from '@/components/arena/estrategias/VistaEstrategias';
import { VistaAjustes } from '@/components/arena/ajustes/VistaAjustes';
import type { DefinicionVista } from '@/components/arena/shell/vistas';

export default function PaginaConsola() {
  return (
    <MarcoAplicacion>
      {(vista: DefinicionVista) => {
        switch (vista.id) {
          case 'panel':
            return <VistaPanel />;
          case 'arena':
            return <VistaArena />;
          case 'tactico':
            return <VistaTactico />;
          case 'plantel':
            return <VistaPlantel />;
          case 'importar':
            return <VistaImportador />;
          case 'entrenamiento':
            return <VistaEntrenamiento />;
          case 'explorador':
            return <VistaExplorador />;
          case 'torneos':
            return <VistaTorneos />;
          case 'estrategias':
            return <VistaEstrategias />;
          case 'ajustes':
            return <VistaAjustes />;
          default:
            return null;
        }
      }}
    </MarcoAplicacion>
  );
}
