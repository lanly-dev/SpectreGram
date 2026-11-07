import { defineConfig } from 'vite';

// Minimal Vite config. The module Web Worker is created in src/main.ts with the
// locked Vite syntax `new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' })`,
// which Vite bundles automatically.
export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
