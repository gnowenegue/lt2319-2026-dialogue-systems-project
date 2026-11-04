import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    proxy: {
      '/api/groq': {
        target: 'https://api.groq.com/openai/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/groq/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/api/groq': {
        target: 'https://api.groq.com/openai/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/groq/, ''),
      },
    },
  },
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
