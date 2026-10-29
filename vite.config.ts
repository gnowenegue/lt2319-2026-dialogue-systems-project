import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["speechstate"],
  },
  build: {
    commonjsOptions: {
      include: [/speechstate/, /node_modules/],
    },
  },
});
