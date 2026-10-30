/**
 * The staging keys, for tests that run while a batch is still in flight.
 *
 * A translator moves strings into `locales/pending/<batch>.<lang>.json` and the
 * Builder merges them into the real bundles later, so between those two moments
 * a migrated function resolves its key against a bundle that does not have it
 * yet and returns the key. A test asserting on that is asserting on nothing.
 *
 * Only the tests use this. The app reads the real bundles, which is the point
 * of the staging directory: nothing ships until the Builder has merged it.
 *
 * The files are globbed rather than imported by name, so once a batch is merged
 * and its two staging files are deleted this simply finds fewer of them and
 * stays correct with no edit.
 */
import i18n from './config';

const PENDING = import.meta.glob('./locales/pending/*.json', { eager: true });

const LANGUAGES = ['zh-Hant', 'en'] as const;

export const loadPendingLocales = (): void => {
  LANGUAGES.forEach(language => {
    Object.entries(PENDING)
      .filter(([path]) => path.endsWith(`.${language}.json`))
      .forEach(([, module]) => {
        const bundle = (module as { default?: unknown }).default ?? module;
        // Deep, and non-destructive: a key the real bundle already has wins,
        // so this can never mask a merge the Builder has already done.
        i18n.addResourceBundle(language, 'translation', bundle, true, false);
      });
  });
};
