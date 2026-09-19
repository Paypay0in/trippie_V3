import { defineConfig } from 'vitest/config';

// Minimal test configuration. Kept separate from vite.config.ts so the app build
// pipeline is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['services/**/*.test.ts', 'tests/**/*.test.tsx', 'i18n/**/*.test.ts'],
    // Pins the interface language for every test. jsdom reports `en-US`, so
    // without this the runtime tests would silently start asserting against a
    // language nobody chose, and would change meaning as strings move into
    // translation files.
    setupFiles: ['./tests/setup/language.ts', './tests/setup/socket.ts'],
  },
});
