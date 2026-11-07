import { defineConfig } from 'vite';

// Minimal Vite config. The module Web Worker is created in src/main.ts with the
// locked Vite syntax `new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' })`,
// which Vite bundles automatically.
export default defineConfig({
  // Relative asset paths: the same dist/ output must load from the desktop
  // shell's app:// protocol and from a GitHub Pages subpath alike.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
