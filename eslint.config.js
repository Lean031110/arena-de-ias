import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { globalIgnores } from 'eslint/config';

export default tseslint.config([
  // «salida-kernel» y «.venv» son artefactos locales del flujo de Kaggle y
  // del entrenamiento Python: nunca se lintean (revisión de Fase 2).
  globalIgnores(['dist', 'coverage', 'node_modules', '.venv', 'salida-kernel']),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        // APIs usadas por la aplicación en navegador
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        navigator: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Worker: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      // El dominio captura y tipa sus propios errores con causas legibles.
      '@typescript-eslint/no-explicit-any': 'error',
      // Permitir ciclos imposibles: sin `any` salvo alias documentados del dominio.
    },
  },
  {
    files: ['src/dominio/**/*.ts'],
    rules: {
      // El dominio no puede depender de React ni del navegador.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'El dominio debe ser independiente de React.' },
            { name: 'react-dom', message: 'El dominio debe ser independiente de React.' },
          ],
          patterns: [
            { group: ['**/interfaz/**', '**/aplicacion/**', '**/trabajadores/**'], message: 'El dominio no puede importar capas superiores.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      // En pruebas permitimos `any` controlado para stubs de agentes/juegos heterogéneos.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
