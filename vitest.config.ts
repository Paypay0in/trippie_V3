import { defineConfig } from 'vitest/config';

// Minimal test configuration. Kept separate from vite.config.ts so the app build
// pipeline is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['services/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
