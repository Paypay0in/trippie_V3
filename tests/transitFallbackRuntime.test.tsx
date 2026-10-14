/**
 * @vitest-environment jsdom
 *
 * 「我點擊了查看地圖 … 就會有大眾運輸的資訊」.
 *
 * He is right, and that is the whole point: Google Maps carries Japan's
 * timetables under agreements the Routes API does not, so the answer this card
 * cannot compute sits behind a link this card already knew how to build. It
 * named the alternative in a sentence and made the traveller go and find it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransportLeg from '../components/TransportLeg';

const NARITA = { latitude: 35.772, longitude: 140.3929, title: '成田' };
const ASAKUSA = { latitude: 35.7142, longitude: 139.7967, title: '朋友家' };

beforeEach(() => {
  // The measured Japanese answer: 200, and no route of this mode.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ mode: 'TRANSIT', available: false }),
  })) as never);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/*
  Japan opens on 開車, because that is the mode the provider can answer. The
  link below is what 大眾運輸 gives instead of a dead end.
*/
const askForTransit = () => fireEvent.click(screen.getByRole('button', { name: /大眾運輸/ }));

describe('a Japanese transit leg', () => {
  it('offers the map that does have the timetable', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="日本" />);
    askForTransit();

    const link = await screen.findByTestId('transit-unsupported-hint');

    expect(link.getAttribute('href')).toContain('google.com/maps/dir/');
    // The mode that failed is the mode it opens on.
    expect(link.getAttribute('href')).toContain('travelmode=transit');
    expect(link.getAttribute('href')).toContain('35.772,140.3929');
  });

  it('is a link, not a sentence telling somebody to go and look', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="日本" />);
    askForTransit();

    const link = await screen.findByTestId('transit-unsupported-hint');

    expect(link.tagName).toBe('A');
    expect(link.textContent).toContain('Google 地圖');
  });
});

describe('where transit does work', () => {
  it('offers no such link', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="台灣" />);
    askForTransit();

    await waitFor(() => expect(screen.getByTestId('transport-leg')).toBeTruthy());

    expect(screen.queryByTestId('transit-unsupported-hint')).toBeNull();
  });
});
