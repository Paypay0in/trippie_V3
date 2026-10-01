import { execSync } from 'child_process';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The commit this bundle was built from, stamped in so a device can say which
 * build it is running. Render exposes the commit as an env var; git is the
 * fallback locally. Never throws: a missing stamp must not fail a deploy.
 */
const buildId = () => {
    const fromRender = process.env.RENDER_GIT_COMMIT;
    if (fromRender) return fromRender.slice(0, 7);
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'dev';
    }
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        __BUILD_ID__: JSON.stringify(buildId()),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
