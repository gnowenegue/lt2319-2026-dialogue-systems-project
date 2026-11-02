import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
  optimizeDeps: {
    include: ['speechstate'],
  },
  build: {
    commonjsOptions: {
      include: [/speechstate/, /node_modules/],
    },
  },
});
