/**
 * @vitest-environment node
 *
 * A Japanese interface was answered in Chinese, in production.
 *
 * Three things were each separately enough to cause it, which is why this
 * guards all three rather than the one that was noticed first:
 *
 *   1. `LANGUAGE_NAMES` in services/aiOutputLanguage.ts had no `ja`, so the
 *      lookup fell through to Traditional Chinese. TypeScript had been
 *      reporting it for as long as Japanese existed — it was one of the fifty
 *      errors `npm run lint` was red with.
 *   2. server.ts never passed a language at all. The parameter was optional
 *      with a Chinese default, so every one of the eight call sites omitted it
 *      and every traveller got Chinese regardless of what they were reading.
 *   3. Two prompts carried their own 「所有文字一律繁體中文」, which overrides
 *      anything the shared rule says even once the first two are fixed.
 *
 * The shape is the recurring one: a rule honoured in one place and silently
 * dropped in another. So these assertions are about where the rule lives, not
 * about one string.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { outputLanguageRule } from '../services/aiOutputLanguage';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '../i18n/languages';
import { API_LANGUAGE_HEADER, installApiLanguageHeader } from '../services/apiLanguageHeader';

const server = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

describe('the AI answers in the language the app is being read in', () => {
  it('names every shipped language, so none falls through to Chinese', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const rule = outputLanguageRule({ hasUserText: false, interfaceLanguage: language });
      expect(rule).not.toContain('undefined');
      if (language !== 'zh-Hant') {
        expect(rule).not.toContain('Traditional Chinese');
      }
    }
  });

  it('tells a Japanese reader to be answered in Japanese', () => {
    expect(outputLanguageRule({ hasUserText: false, interfaceLanguage: 'ja' })).toContain('Japanese');
  });

  it('passes a language at every prompt site, with none left to a default', () => {
    const sites = server.match(/factsPreamble\(/g) ?? [];
    expect(sites.length).toBeGreaterThan(0);

    // Every call must carry interfaceLanguage. `factsPreamble()` with no
    // argument is exactly how this shipped broken.
    expect(server).not.toMatch(/factsPreamble\(\)/);
    const withLanguage = server.match(/factsPreamble\(\{[^}]*interfaceLanguage:/g) ?? [];
    expect(withLanguage.length).toBe(sites.length);
  });

  it('keeps no prompt-local order to answer in Chinese', () => {
    expect(server).not.toContain('一律使用繁體中文');
    expect(server).not.toContain('一律繁體中文');
  });
});

describe('the interface language reaches the server', () => {
  it('attaches the header to same-origin API calls only', async () => {
    const seen: Array<{ url: string; language: string | null }> = [];
    const target = {
      fetch: (async (input: any, init: any) => {
        const url = typeof input === 'string' ? input : input.url;
        seen.push({
          url,
          language: new Headers(init?.headers ?? {}).get(API_LANGUAGE_HEADER),
        });
        return new Response('{}');
      }) as unknown as typeof fetch,
    };

    installApiLanguageHeader(() => 'ja', target);

    await target.fetch('/api/itinerary-proposals', { method: 'POST' });
    await target.fetch('https://places.googleapis.com/v1/places:search', { method: 'POST' });

    expect(seen[0].language).toBe('ja');
    // A header invented by this product means nothing to Google, and the
    // traveller's interface language is not something to hand third parties.
    expect(seen[1].language).toBeNull();
  });

  it('reads the language at call time, so switching takes effect without a reload', async () => {
    const seen: Array<string | null> = [];
    let current: 'en' | 'ja' = 'en';
    const target = {
      fetch: (async (_input: any, init: any) => {
        seen.push(new Headers(init?.headers ?? {}).get(API_LANGUAGE_HEADER));
        return new Response('{}');
      }) as unknown as typeof fetch,
    };

    installApiLanguageHeader(() => current, target);

    await target.fetch('/api/preparation-suggestions', { method: 'POST' });
    current = 'ja';
    await target.fetch('/api/preparation-suggestions', { method: 'POST' });

    expect(seen).toEqual(['en', 'ja']);
  });

  it('falls back to the shipped language when an older client sends nothing', () => {
    expect(resolveLanguage(undefined)).toBe('zh-Hant');
  });

  it('resolves the header with the same function the browser uses', () => {
    // One matcher, one home. A second one on the server is how `ja` ends up
    // supported in the browser and unknown to the prompt.
    expect(server).toContain('resolveLanguage');
    expect(server).toContain('API_LANGUAGE_HEADER');
  });
});
