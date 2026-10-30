import { defineConfig } from 'vitest/config';

// Minimal test configuration. Kept separate from vite.config.ts so the app build
// pipeline is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    // `tests/**/*.test.ts` as well as `.test.tsx`: the pattern used to cover only
    // the component suffix, so `tests/serverNeverImportsBrowserI18n.test.ts` —
    // the guard that stops the browser's i18n reaching the server — had never
    // run once since it was written. A gate nobody executes is not a gate.
    include: [
      'services/**/*.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'i18n/**/*.test.ts',
    ],
    // Pins the interface language for every test. jsdom reports `en-US`, so
    // without this the runtime tests would silently start asserting against a
    // language nobody chose, and would change meaning as strings move into
    // translation files.
    setupFiles: ['./tests/setup/language.ts', './tests/setup/socket.ts'],
  },
});
