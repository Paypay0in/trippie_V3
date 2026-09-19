/**
 * @vitest-environment jsdom
 *
 * Proof that the interface actually follows the device, rendered through the
 * real navigation bar rather than asserted against the translation files —
 * a JSON file containing the word "Trips" proves nothing about what a
 * traveller sees.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n, { FALLBACK_LANGUAGE, resolveLanguage } from '../i18n/config';
import AppBottomNav from '../components/AppBottomNav';

const renderNav = () =>
  render(<AppBottomNav active="trips" onChange={() => {}} onPlus={() => {}} />);

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage(FALLBACK_LANGUAGE);
});

describe('the interface follows the device language', () => {
  it('shows Traditional Chinese to a zh-TW device', async () => {
    await i18n.changeLanguage(resolveLanguage('zh-TW'));
    renderNav();

    expect(screen.getByText('旅行')).toBeTruthy();
    expect(screen.getByText('社群')).toBeTruthy();
    expect(screen.getByLabelText('新增旅程或記錄')).toBeTruthy();
  });

  it('shows English to an en-US device', async () => {
    await i18n.changeLanguage(resolveLanguage('en-US'));
    renderNav();

    expect(screen.getByText('Trips')).toBeTruthy();
    expect(screen.getByText('Community')).toBeTruthy();
    expect(screen.getByLabelText('Add a trip or a record')).toBeTruthy();
    // The Chinese it replaced is gone, not merely joined.
    expect(screen.queryByText('旅行')).toBeNull();
  });

  it('shows Traditional Chinese to a device we have no translation for', async () => {
    // Nothing here ships French, and the fallback is the language the product
    // was written in — so a French device gets a readable screen rather than
    // `nav.trips`.
    await i18n.changeLanguage('fr');
    renderNav();

    expect(screen.getByText('旅行')).toBeTruthy();
  });

  it('never renders a raw key when a string has not been translated yet', async () => {
    // The migration moves strings one screen at a time, so English will be
    // missing keys for a while. Missing must mean "the Chinese it always
    // showed", never "plan.somethingUnfinished" on a real screen.
    await i18n.changeLanguage('en');
    const untranslated = i18n.t('someScreen.notMovedYet' as never, {
      defaultValue: '尚未搬遷的文字',
    });

    expect(untranslated).toBe('尚未搬遷的文字');
    expect(untranslated).not.toContain('someScreen.');
  });
});
