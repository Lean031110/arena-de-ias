/**
 * Registro central de vistas de la consola.
 * La navegación vive en el fragmento de la URL (#/arena, #/tactico…),
 * sin crear rutas de servidor.
 */

import {
  LayoutDashboard,
  Swords,
  Radar,
  Bot,
  PackageOpen,
  Activity,
  GitBranch,
  Trophy,
  BookOpenCheck,
  Settings2,
  type LucideIcon,
} from 'lucide-react';

export interface DefinicionVista {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly icono: LucideIcon;
  readonly grupo: 'Observación' | 'Agentes' | 'Análisis' | 'Sistema';
  /** Ancla de teclado visible en el menú (Alt+tecla). */
  readonly atajo: string;
}

export const VISTAS: readonly DefinicionVista[] = [
  {
    id: 'panel',
    titulo: 'Panel de control',
    descripcion: 'Estado del sistema, servicios conectados y actividad de la sesión.',
    icono: LayoutDashboard,
    grupo: 'Observación',
    atajo: '1',
  },
  {
    id: 'arena',
    titulo: 'Simulador de partidas',
    descripcion: 'Juegos por turnos del motor central con agentes reales y reproducción.',
    icono: Swords,
    grupo: 'Observación',
    atajo: '2',
  },
  {
    id: 'tactico',
    titulo: 'Simulador táctico',
    descripcion: 'Terreno 2D del simulador competitivo futuro — sandbox visual.',
    icono: Radar,
    grupo: 'Observación',
    atajo: '3',
  },
  {
    id: 'plantel',
    titulo: 'Plantel de IAs',
    descripcion: 'Catálogo real de agentes, comparación y personalización local.',
    icono: Bot,
    grupo: 'Agentes',
    atajo: '4',
  },
  {
    id: 'importar',
    titulo: 'Importador «.lba»',
    descripcion: 'Inspección de paquetes de cerebros con validación pendiente de la Fase 2.',
    icono: PackageOpen,
    grupo: 'Agentes',
    atajo: '5',
  },
  {
    id: 'entrenamiento',
    titulo: 'Entrenamiento',
    descripcion: 'Tareas reales del motor: sin entrenamiento disponible hasta la Fase 2.',
    icono: Activity,
    grupo: 'Agentes',
    atajo: '6',
  },
  {
    id: 'explorador',
    titulo: 'Búsqueda y repetición',
    descripcion: 'Estadísticas de búsqueda reales por jugada y repeticiones de partidas.',
    icono: GitBranch,
    grupo: 'Análisis',
    atajo: '7',
  },
  {
    id: 'torneos',
    titulo: 'Torneos',
    descripcion: 'Evaluación comparativa local real y torneos persistentes (Fase 4).',
    icono: Trophy,
    grupo: 'Análisis',
    atajo: '8',
  },
  {
    id: 'estrategias',
    titulo: 'Estrategias y auditoría',
    descripcion: 'Catálogo de hallazgos y trazabilidad de métricas hasta su origen.',
    icono: BookOpenCheck,
    grupo: 'Análisis',
    atajo: '9',
  },
  {
    id: 'ajustes',
    titulo: 'Ajustes',
    descripcion: 'Tema, accesibilidad, almacenamiento, servicios y diagnóstico.',
    icono: Settings2,
    grupo: 'Sistema',
    atajo: '0',
  },
];

export const IDS_VISTA = VISTAS.map((vista) => vista.id);

export function esIdVista(valor: string): boolean {
  return IDS_VISTA.includes(valor);
}

export function vistaPorId(id: string): DefinicionVista {
  return VISTAS.find((vista) => vista.id === id) ?? VISTAS[0];
}
