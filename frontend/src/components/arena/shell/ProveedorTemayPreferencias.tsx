'use client';

/**
 * Proveedor de tema (claro/oscuro) y preferencias de accesibilidad.
 * El tema usa next-themes con la clase .dark/.light; el movimiento
 * reducido puede ser automático (media query), forzado u desactivado.
 */

import * as React from 'react';
import { ThemeProvider } from 'next-themes';

export type PreferenciaMovimiento = 'auto' | 'reducido' | 'pleno';
export type Densidad = 'comoda' | 'compacta';

export interface Preferencias {
  movimiento: PreferenciaMovimiento;
  densidad: Densidad;
  reducirTransparencias: boolean;
}

const VALORES_POR_DEFECTO: Preferencias = {
  movimiento: 'auto',
  densidad: 'comoda',
  reducirTransparencias: false,
};

const CLAVE_PREFERENCIAS = 'arena-preferencias-v1';

const ContextoPreferencias = React.createContext<{
  preferencias: Preferencias;
  actualizar: (parcial: Partial<Preferencias>) => void;
}>({
  preferencias: VALORES_POR_DEFECTO,
  actualizar: () => undefined,
});

function leerPreferencias(): Preferencias {
  if (typeof window === 'undefined') return VALORES_POR_DEFECTO;
  try {
    const bruto = window.localStorage.getItem(CLAVE_PREFERENCIAS);
    if (bruto === null) return VALORES_POR_DEFECTO;
    const datos = JSON.parse(bruto) as Partial<Preferencias>;
    return {
      movimiento:
        datos.movimiento === 'reducido' || datos.movimiento === 'pleno' || datos.movimiento === 'auto'
          ? datos.movimiento
          : 'auto',
      densidad: datos.densidad === 'compacta' ? 'compacta' : 'comoda',
      reducirTransparencias: datos.reducirTransparencias === true,
    };
  } catch {
    return VALORES_POR_DEFECTO;
  }
}

function aplicarClases(preferencias: Preferencias): void {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  raiz.classList.toggle('movimiento-reducido', preferencias.movimiento === 'reducido');
  raiz.classList.toggle('movimiento-pleno', preferencias.movimiento === 'pleno');
  raiz.classList.toggle('densidad-compacta', preferencias.densidad === 'compacta');
  raiz.classList.toggle('sin-transparencias', preferencias.reducirTransparencias);
}

export function ProveedorTemayPreferencias({ children }: { children: React.ReactNode }) {
  const [preferencias, setPreferencias] = React.useState<Preferencias>(VALORES_POR_DEFECTO);

  React.useEffect(() => {
    const leídas = leerPreferencias();
    setPreferencias(leídas);
    aplicarClases(leídas);
  }, []);

  const actualizar = React.useCallback((parcial: Partial<Preferencias>) => {
    setPreferencias((previas) => {
      const nuevas = { ...previas, ...parcial };
      aplicarClases(nuevas);
      try {
        window.localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(nuevas));
      } catch {
        /* preferencias no persistentes en esta sesión */
      }
      return nuevas;
    });
  }, []);

  const valor = React.useMemo(() => ({ preferencias, actualizar }), [preferencias, actualizar]);

  return (
    <ContextoPreferencias.Provider value={valor}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </ContextoPreferencias.Provider>
  );
}

export function usePreferencias() {
  return React.useContext(ContextoPreferencias);
}
