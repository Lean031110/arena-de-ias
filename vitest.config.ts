import { defineConfig } from 'vitest/config';

// Pruebas del dominio en Node (sin DOM): el núcleo no depende del navegador.
// La capa de persistencia usa fake-indexeddb para simular IndexedDB.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
    // Los tiempos solo se miden, nunca se asertan por umbrales (higiene de CI).
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
