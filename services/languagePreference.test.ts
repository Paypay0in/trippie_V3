/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  clearLanguagePreference,
  loadLanguagePreference,
  resolveStartingLanguage,
  saveLanguagePreference,
} from './languagePreference';

/**
 * 「介面的語言隨著手機語言調整，但在「我」的欄位應該要有「設定」可以改」.
 *
 * Two sources, and a stated order between them: the device decides until the
 * traveller says otherwise, and after that their choice decides — on this
 * phone, across restarts, until they change it back.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('loadLanguagePreference', () => {
  it('has no preference until one is chosen', () => {
    expect(loadLanguagePreference()).toBeUndefined();
  });

  it('remembers a chosen language across a reload', () => {
    saveLanguagePreference('en');

    expect(loadLanguagePreference()).toBe('en');
  });

  it('ignores a stored value the app does not ship', () => {
    // Someone editing localStorage by hand, or a language that was dropped in
    // a later release. Falling back to the device beats booting into a
    // language whose bundle does not exist.
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'ko');

    expect(loadLanguagePreference()).toBeUndefined();
  });

  it('normalises a stored regional tag onto a language we ship', () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-TW');

    expect(loadLanguagePreference()).toBe('zh-Hant');
  });

  it('survives storage being unreadable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    expect(loadLanguagePreference()).toBeUndefined();

    getItem.mockRestore();
  });
});

describe('clearLanguagePreference', () => {
  it('hands the decision back to the device', () => {
    saveLanguagePreference('en');
    clearLanguagePreference();

    expect(loadLanguagePreference()).toBeUndefined();
  });
});

describe('resolveStartingLanguage', () => {
  it('follows the device when nobody has chosen', () => {
    expect(resolveStartingLanguage({ device: 'en-GB' })).toBe('en');
    expect(resolveStartingLanguage({ device: 'zh-TW' })).toBe('zh-Hant');
  });

  it('lets a chosen language win over the device', () => {
    saveLanguagePreference('zh-Hant');

    expect(resolveStartingLanguage({ device: 'en-US' })).toBe('zh-Hant');
  });

  /*
    Choosing English has to survive startup, and only a non-default choice can
    prove it. Every other assertion here stores 'zh-Hant', which is also the
    fallback — so they would all still pass if the stored preference were read
    and then thrown away. 「你要讓我可以在手機裡面按英文」 is exactly this case:
    somebody taps English on a Chinese phone, closes the app, and opens it
    again. Device deliberately absent, because the device is held behind
    FOLLOW_DEVICE_LANGUAGE while the migration finishes and the choice must
    win without its help.
  */
  it('opens in English after someone chose English, with no device to help', () => {
    saveLanguagePreference('en');

    expect(resolveStartingLanguage({})).toBe('en');
    expect(resolveStartingLanguage({ device: 'zh-TW' })).toBe('en');
  });

  it('lets a preview URL win over both', () => {
    // `?lang=` is for reviewing translation work, so it must beat a stored
    // preference as well as the device — otherwise the one person checking the
    // English build is the one person who cannot see it.
    saveLanguagePreference('zh-Hant');

    expect(resolveStartingLanguage({ device: 'zh-TW', preview: 'en' })).toBe('en');
  });

  it('falls back to the shipped default when the device says nothing', () => {
    expect(resolveStartingLanguage({})).toBe('zh-Hant');
  });
});
