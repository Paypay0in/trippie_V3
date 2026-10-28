import { describe, expect, it } from 'vitest';

import { outputLanguageRule } from './aiOutputLanguage';

/**
 * 「看使用者輸入什麼語言 就用該語言回」.
 *
 * The rule is one sentence in one place, because it has to appear in every
 * prompt the product sends. Nine prompts each carried their own 「用繁體中文」
 * before this, which is nine chances for one of them to keep answering in
 * Chinese to an English traveller — the recurring defect shape in this
 * codebase, in prose instead of code.
 */

describe('outputLanguageRule', () => {
  it('tells the model to mirror the traveller when they wrote something', () => {
    const rule = outputLanguageRule({ hasUserText: true, interfaceLanguage: 'en' });

    expect(rule).toContain('same language');
  });

  it('names the interface language when the traveller wrote nothing', () => {
    // A travel-rules lookup is a destination and a passport code: no prose to
    // mirror. The language the app is being read in is the only honest guess.
    expect(outputLanguageRule({ hasUserText: false, interfaceLanguage: 'en' })).toContain('English');
    expect(
      outputLanguageRule({ hasUserText: false, interfaceLanguage: 'zh-Hant' }),
    ).toContain('Traditional Chinese');
  });

  it('keeps proper names of official systems untranslated', () => {
    // 「Visit Japan Web」 on a sign at the airport is the string a traveller has
    // to recognise. Translating it helps nobody standing in the queue.
    const rule = outputLanguageRule({ hasUserText: true, interfaceLanguage: 'en' });

    expect(rule).toContain('Visit Japan Web');
  });

  it('is one sentence block, reusable in any prompt', () => {
    const rule = outputLanguageRule({ hasUserText: true, interfaceLanguage: 'en' });

    expect(rule.trim()).toBe(rule.trim());
    expect(rule.length).toBeLessThan(600);
  });

  it('defaults to the shipped language when none is supplied', () => {
    expect(outputLanguageRule({ hasUserText: false })).toContain('Traditional Chinese');
  });
});
