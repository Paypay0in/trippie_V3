/**
 * @vitest-environment jsdom
 *
 * The transport card between two itinerary stops — which is where somebody
 * standing on a street in Busan actually presses 「在地圖開啟」.
 *
 * It already knew it was in Korea: it has been printing 「因法規限制，Google
 * 地圖無法以『開車』查詢」 and telling the traveller to go to Naver themselves.
 * It could say so and not do it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import TransportLeg from '../components/TransportLeg';

vi.mock('../services/routesService', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../services/routesService');
  return {
    ...actual,
    fetchRouteLeg: vi.fn(async () => ({ available: true, durationSeconds: 780, steps: [] })),
  };
});

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const gwangalli = { latitude: 35.1532, longitude: 129.1186, title: 'Gwangalli Beach' };
const helmet = { latitude: 35.1549, longitude: 129.1104, title: 'HELMET' };

const openSheet = async (country?: string, props: Record<string, unknown> = {}) => {
  render(
    <TransportLeg
      origin={gwangalli}
      destination={helmet}
      destinationCountry={country}
      {...props}
    />,
  );
  // The mode chips are buttons too; this one is the summary row that opens
  // the sheet where the map link lives.
  fireEvent.click(await screen.findByLabelText('交通方式說明'));
  await waitFor(() => expect(screen.getByTestId('transport-map-link')).toBeTruthy());
};

describe('a leg inside Korea', () => {
  it('opens NAVER, with both ends of the journey', async () => {
    await openSheet('韓國');
    const href = screen.getByTestId('transport-map-link').getAttribute('href')!;
    expect(href).toContain('https://app.map.naver.com/launchApp/route/public?');
    expect(href).toContain('slat=35.1532');
    expect(href).toContain('dlat=35.1549');
  });

  /** 「在地圖開啟」 on a button that launches NAVER is a small surprise at the
      exact moment somebody is trying to leave. */
  it('says which app it opens', async () => {
    await openSheet('韓國');
    expect(screen.getByText('在 NAVER 地圖開啟')).toBeTruthy();
  });

  it('keeps Google reachable for the traveller who wants it', async () => {
    await openSheet('韓國');
    expect(screen.getByTestId('transport-google-link').getAttribute('href'))
      .toContain('https://www.google.com/maps/dir/?api=1');
  });
});

describe('everywhere else, unchanged', () => {
  it('opens Google in Japan, with the label it always had', async () => {
    await openSheet('Japan');
    expect(screen.getByTestId('transport-map-link').getAttribute('href'))
      .toContain('https://www.google.com/maps/dir/?api=1');
    expect(screen.getByText('在地圖開啟')).toBeTruthy();
    expect(screen.queryByTestId('transport-google-link')).toBeNull();
  });

  it('opens Google when the country is unknown', async () => {
    await openSheet(undefined);
    expect(screen.getByTestId('transport-map-link').getAttribute('href'))
      .toContain('https://www.google.com/maps/dir/?api=1');
  });
});
