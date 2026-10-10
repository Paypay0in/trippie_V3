import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The commit this bundle was built from, stamped in so a device can say which
 * build it is running. Render exposes the commit as an env var; git is the
 * fallback locally. Never throws: a missing stamp must not fail a deploy.
 */
/**
 * Which build this is, in a way that changes when the build does.
 *
 * 「我為什麼打開還是依樣」. The id was the commit, and work in progress is not
 * committed — so every rebuild of an unfinished change carried the same id, and
 * 「是不是新版」 had no answer. An evening went to that question.
 *
 * A dirty tree gets the commit plus the minute it was built, so two builds of
 * the same commit are still told apart.
 */
const buildId = () => {
    const fromRender = process.env.RENDER_GIT_COMMIT;
    if (fromRender) return fromRender.slice(0, 7);
    try {
      const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
      if (!dirty) return head;
      const stamp = new Date().toISOString().slice(5, 16).replace('T', ' ');
      return `${head}+${stamp}`;
    } catch {
      return 'dev';
    }
};

/**
 * The id of the build, written where the server can read it.
 *
 * 「我為什麼打開還是依樣」. The stale-build banner compares the bundle's id with
 * the one the server reports, and the server had no way to know: it answered
 * 「dev」, which the comparison treats as 「cannot tell」 and stays silent. So the
 * one mechanism built to answer 「is this phone on the new build」 never spoke.
 */
const writeVersionFile = (id: string) => ({
  name: 'trippie-write-version',
  closeBundle() {
    const dir = path.resolve(__dirname, 'dist');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ commit: id }));
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), writeVersionFile(buildId())],
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
