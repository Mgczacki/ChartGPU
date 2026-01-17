import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ChartGPU',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: []
    }
  },
  server: {
    open: '/examples'
  }
});
