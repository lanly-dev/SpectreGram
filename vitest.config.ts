import { defineConfig } from 'vitest/config';

// Vitest is locked to cover cutoff.ts only (no DOM needed). Synthetic magnitude
// grids exercise the cutoff detector and verdict generator in pure Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
