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

  /*
    「日本的鐵路法規若不能顯示 我希望 app 是要告訴用戶原因 不要只寫查不到」 —
    「查不到」 reads as 「there is no train」, in the densest rail network on earth.
  */
  it('says why, not just that it failed', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="日本" />);
    askForTransit();

    await screen.findByTestId('transit-unsupported-hint');

    expect(screen.getByTestId('transport-leg').textContent).toContain('不是沒有車');
    expect(screen.getByTestId('transport-leg').textContent).not.toContain('查不到班次');
  });

  it('names the country from the trip rather than hardcoding one', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="Japan" />);
    askForTransit();

    await screen.findByTestId('transit-unsupported-hint');

    // 「Japan」 on the record, 「日本」 on the screen.
    expect(screen.getByTestId('transport-leg').textContent).toContain('日本電車班次');
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

/**
 * 「如果不能顯示路線 但可不可以給大眾運輸大概的時間」.
 *
 * The reason is right and is still not something a day can be planned around.
 * Narita → 淺草 is 57 km of straight line, which the same arithmetic the
 * planner schedules by turns into a number.
 */
describe('a rough time where no timetable exists', () => {
  it('gives a number as well as the reason', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="日本" />);
    askForTransit();

    const estimate = await screen.findByTestId('transit-rough-estimate');

    expect(estimate.textContent).toMatch(/粗估大約 \d+ 分鐘/);
    // The reason it could not be looked up is still on screen, above it.
    expect(screen.getByTestId('transport-leg').textContent).toContain('日本電車班次');
  });

  /* An estimate presented as a lookup is the one thing worse than no estimate. */
  it('says it is an estimate, not a timetable', async () => {
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="日本" />);
    askForTransit();

    const estimate = await screen.findByTestId('transit-rough-estimate');

    expect(estimate.textContent).toContain('粗估');
  });

  /* Two cards at the same airport have nothing to estimate. */
  it('offers nothing for two points at the same spot', async () => {
    render(<TransportLeg origin={NARITA} destination={{ ...NARITA, title: '成田 2' }} destinationCountry="日本" />);
    askForTransit();

    await waitFor(() => expect(screen.getByTestId('transport-leg')).toBeTruthy());

    expect(screen.queryByTestId('transit-rough-estimate')).toBeNull();
  });

  /* Where a real route came back, the estimate must not appear beside it. */
  it('stays away when the route service answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ mode: 'TRANSIT', available: true, durationSeconds: 3600, steps: [] }),
    })) as never);
    render(<TransportLeg origin={NARITA} destination={ASAKUSA} destinationCountry="台灣" />);
    askForTransit();

    await waitFor(() => expect(screen.getByTestId('transport-leg').textContent).toContain('60 分'));

    expect(screen.queryByTestId('transit-rough-estimate')).toBeNull();
  });
});
