import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de construcción de la aplicación (producción y desarrollo).
// El trabajador web se empaqueta automáticamente a partir de src/trabajadores/.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
