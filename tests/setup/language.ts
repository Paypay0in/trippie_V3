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

initI18n({ language: FALLBACK_LANGUAGE });
