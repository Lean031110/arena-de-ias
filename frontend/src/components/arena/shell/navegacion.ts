'use client';

/** Navegación imperativa por fragmento de URL (sin estado ni hooks). */

import { esIdVista } from './vistas';

export function navegarA(vista: string): void {
  if (typeof window === 'undefined') return;
  const destino = esIdVista(vista) ? vista : 'panel';
  window.location.hash = `#/${destino}`;
}
