import { useEffect, useState } from 'react';

export type Tema = 'claro' | 'oscuro';

const CLAVE_TEMA = 'arena-de-ias:tema';

function temaInicial(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  } catch {
    // almacenamiento no disponible: seguir con la preferencia del sistema
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'oscuro';
  }
  return 'claro';
}

export function useTema(): { tema: Tema; alternarTema: () => void } {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      // sin almacenamiento: la preferencia solo dura la sesión
    }
  }, [tema]);

  return {
    tema,
    alternarTema: () => setTema((actual) => (actual === 'claro' ? 'oscuro' : 'claro')),
  };
}

/** ¿El usuario prefiere movimiento reducido? */
export function prefiereMovimientoReducido(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
