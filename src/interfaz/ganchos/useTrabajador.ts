import { useState } from 'react';
import { ClienteTrabajador } from '../../trabajadores/cliente';

/**
 * Instancia única del cliente del trabajador web (con degradación).
 * Se crea una sola vez por sesión mediante el inicializador perezoso
 * de useState (nunca durante el render se accede a refs).
 */
export function useTrabajador(): ClienteTrabajador {
  const [cliente] = useState(() => new ClienteTrabajador());
  return cliente;
}
