/**
 * @vitest-environment jsdom
 *
 * Each language row says its name twice: once in the language you are reading,
 * once in its own.
 *
 * 「翻英文」 — the Founder circled 繁體中文 sitting in an otherwise English
 * settings screen. He is right that it reads as untranslated: every other row
 * was English and that one was not.
 *
 * But replacing the endonym with "Traditional Chinese" would close the exit for
 * the reader this screen exists for. Somebody who taps the wrong row, or lands
 * on a device whose language they do not read, cannot find their way back
 * through a list written entirely in a language they cannot parse — 繁體中文 is
 * the one string on the screen they would recognise.
 *
 * So both, and this test holds both: the translated name leads, the endonym
 * follows. Removing either one fails here.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import LanguageSetting from '../components/LanguageSetting';
import i18n from '../i18n/config';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const chineseRow = () => screen.getByTestId('language-option-zh-Hant');

describe('language rows name themselves both ways', () => {
  it('leads with the name in the language being read', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSetting />);

    expect(within(chineseRow()).getByText('Traditional Chinese')).toBeTruthy();
  });

  it('keeps the endonym, which is the only row a stranded reader recognises', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSetting />);

    expect(within(chineseRow()).getByText('繁體中文')).toBeTruthy();
  });

  it('does not say English twice when English is read in English', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSetting />);

    const row = screen.getByTestId('language-option-en');
    expect(row.textContent).toBe('English');
  });

  it('turns the names around when the screen is Chinese', async () => {
    await i18n.changeLanguage('zh-Hant');
    render(<LanguageSetting />);

    // 繁體中文 read in Chinese is its own name, so it appears once, not twice.
    expect(chineseRow().textContent).toBe('繁體中文');
    expect(within(screen.getByTestId('language-option-en')).getByText('英文')).toBeTruthy();
    expect(within(screen.getByTestId('language-option-en')).getByText('English')).toBeTruthy();
  });
});
