import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/db/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
