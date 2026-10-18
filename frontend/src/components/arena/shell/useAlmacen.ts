/**
 * Gancho de lectura del almacén local del prototipo con suscripción reactiva.
 *
 * Seguridad de hidratación: durante la hidratación, React usa
 * `getServerSnapshot` EN EL CLIENTE; debe devolver exactamente lo que
 * el servidor renderizó (almacén vacío), nunca leer localStorage.
 * Tras la hidratación, React consulta `getSnapshot` (almacén real) y
 * repinta si difiere.
 */

import * as React from 'react';
import { VACIO, obtenerAlmacen, suscribirAlmacen, type DatosAlmacen } from '@/lib/almacen-local';

export function useAlmacen(): DatosAlmacen {
  const suscripción = React.useSyncExternalStore(
    suscribirAlmacen,
    obtenerAlmacen,
    (): DatosAlmacen => VACIO,
  );
  return suscripción;
}
