import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  // tsconfig keeps JSX as-is for Next to compile; tests that import a module
  // re-exporting components need it transformed here.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    setupFiles: ['./src/db/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
