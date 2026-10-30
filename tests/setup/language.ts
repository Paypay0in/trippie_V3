/**
 * Every test runs in Traditional Chinese.
 *
 * jsdom reports `en-US`, so tests that assert on 「規劃」 or 「行程時間軸」 would
 * start failing the moment those strings moved into a translation file —
 * failing because of the environment, not because of the behaviour. Pinning the
 * language here keeps each test about the thing it is testing.
 *
 * A test that is specifically about language should call `i18n.changeLanguage`
 * itself and restore it afterwards.
 */
import { initI18n, FALLBACK_LANGUAGE } from '../../i18n/config';
import { loadPendingLocales } from '../../i18n/pendingBundles';

initI18n({ language: FALLBACK_LANGUAGE });

/**
 * Keys that are in `locales/pending/` but not merged yet still resolve.
 *
 * A migration in flight means a function resolves a key the real bundle does
 * not hold yet, so a runtime test asserting on the sentence it used to return
 * fails on the staging directory rather than on the behaviour. Non-destructive
 * and self-clearing: a key the real bundle already has wins, and once the
 * Builder merges a batch and deletes its two files there is nothing to add.
 */
loadPendingLocales();
