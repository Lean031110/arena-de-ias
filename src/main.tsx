import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './interfaz/App';
import './interfaz/estilos.css';

const contenedor = document.getElementById('raiz');
if (contenedor === null) {
  throw new Error('No se encontró el elemento #raiz en el documento');
}

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
