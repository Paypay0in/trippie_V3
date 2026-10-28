/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import LanguageSetting from '../components/LanguageSetting';
import i18n, { FALLBACK_LANGUAGE } from '../i18n/config';
import {
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  loadLanguagePreference,
} from '../services/languagePreference';

/**
 * 「在「我」的欄位應該要有「設定」可以改」.
 *
 * The setting is only a setting if it does both halves: changes the language
 * now, and is still in force after the app is closed. A control that only does
 * the first reads as working and resets overnight.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await i18n.changeLanguage(FALLBACK_LANGUAGE);
});

describe('language setting', () => {
  it('names every language in its own language', () => {
    // The traveller who needs this screen is the one who cannot read the
    // language the app is currently in.
    render(<LanguageSetting />);

    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('繁體中文')).toBeTruthy();
  });

  it('switches the interface when a language is chosen', () => {
    render(<LanguageSetting />);

    fireEvent.click(screen.getByTestId('language-option-en'));

    expect(i18n.language).toBe('en');
    expect(i18n.t('nav.trips')).toBe('Trips');
  });

  it('remembers the choice for the next launch', () => {
    render(<LanguageSetting />);

    fireEvent.click(screen.getByTestId('language-option-en'));

    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('en');
    expect(loadLanguagePreference()).toBe('en');
  });

  it('hands the decision back to the phone when asked to', () => {
    render(<LanguageSetting />);
    fireEvent.click(screen.getByTestId('language-option-en'));

    fireEvent.click(screen.getByTestId('language-option-device'));

    // Absence, not 'zh-Hant': a stored value would pin this phone to one
    // language and stop following it.
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBeNull();
    expect(loadLanguagePreference()).toBeUndefined();
  });

  it('marks the option that is in force', () => {
    render(<LanguageSetting />);

    // Nobody has chosen, so 「follow my phone」 is what is actually happening.
    expect(screen.getByTestId('language-option-device').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('language-option-zh-Hant'));

    expect(screen.getByTestId('language-option-zh-Hant').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('language-option-device').getAttribute('aria-pressed')).toBe('false');
  });
});
