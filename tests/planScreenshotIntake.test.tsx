/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlanScreenshotIntake from '../components/PlanScreenshotIntake';
import type { ParsedRental } from '../services/rentalIntake';
import type { ItinerarySlice } from '../services/itineraryImageSlices';

/**
 * 「新增一個上傳截圖的入口」, exercised by pressing it.
 *
 * The routing is covered where it lives, in `screenshotIntake.test.ts`. What
 * this file is for is the part that string assertions on a component have
 * repeatedly failed to catch tonight: whether the thing on screen actually
 * does what the handler behind it promises. A card was edited twice this week
 * that nothing rendered.
 */

const file = () => new File(['x'], 'shot.jpg', { type: 'image/jpeg' });

/** FileReader is jsdom's, and it does reach onload; the data is unused here. */
const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

afterEach(() => {
  // Explicit because globals are off in this config: without it the second
  // render finds two of every button and every query becomes ambiguous.
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (props: Partial<React.ComponentProps<typeof PlanScreenshotIntake>> = {}) => {
  const onAddRental = vi.fn<(rental: ParsedRental) => void>();
  const onSavePlaces = vi.fn<(slices: ItinerarySlice[]) => Promise<number>>(async () => 2);
  const onAddStayItems = vi.fn();
  const onAddFlightAnchors = vi.fn();
  render(
    <PlanScreenshotIntake
      destination="沖繩"
      destinationCountry="日本"
      onAddRental={onAddRental}
      onSavePlaces={onSavePlaces}
      onAddStayItems={onAddStayItems}
      onAddFlightAnchors={onAddFlightAnchors}
      {...props}
    />,
  );
  return { onAddRental, onSavePlaces, onAddStayItems, onAddFlightAnchors };
};

const upload = () => fireEvent.change(screen.getByTestId('plan-screenshot-file'), {
  target: { files: [file()] },
});

describe('the screenshot entry', () => {
  it('offers one upload for everything the trip needs', () => {
    mount();
    expect(screen.getByTestId('plan-screenshot-upload')).toBeTruthy();
    // 靈感、租車、票券 — the traveller is told what may be thrown at it,
    // because an upload button that does not say what it takes gets used
    // for one thing only.
    const hint = screen.getByText(/機票、訂房、租車訂單、旅行靈感截圖都可以/);
    expect(hint).toBeTruthy();
  });

  it('puts a hire on the trip', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'rental' })
        : ok({ company: 'OTS レンタカー', pickUpDate: '2026-11-02', dropOffDate: '2026-11-04' }),
    )));

    const { onAddRental } = mount();
    upload();

    await waitFor(() => expect(onAddRental).toHaveBeenCalledTimes(1));
    expect(onAddRental.mock.calls[0]?.[0].company).toBe('OTS レンタカー');
    await screen.findByText(/已加到租車資訊/);
  });

  it('saves places from an inspiration screenshot', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'inspiration' })
        : ok({ slices: [{ type: 'food', title: '暖暮拉麵' }, { type: 'place', title: '美麗海水族館' }] }),
    )));

    const { onSavePlaces } = mount();
    upload();

    await waitFor(() => expect(onSavePlaces).toHaveBeenCalledTimes(1));
    expect(onSavePlaces.mock.calls[0]?.[0]).toHaveLength(2);
    // The count the caller reports, not the count that was read: those differ
    // when a place cannot be resolved, and the traveller is told the真實 one.
    await screen.findByText(/已存 2 個到收藏/);
  });

  /**
   * 「這個不能直接讓用戶在這個介面上傳」.
   *
   * These two used to be classified and then refused, with the traveller sent
   * to another screen — on a card whose own message says it cannot plan
   * without them. Two things on one screen arguing with each other.
   */
  it('files a hotel booking from here', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'stay' })
        : ok({
            hotelName: '博多站前飯店',
            address: '福岡市博多區',
            checkInDate: '2026-11-05',
            checkOutDate: '2026-11-10',
          }),
    )));

    const { onAddStayItems } = mount();
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    // The booking's own cards, through the conversion 住宿資訊 uses — what
    // lands has to be the same record however it arrived.
    expect(onAddStayItems.mock.calls[0]?.[0].length).toBeGreaterThan(0);
    await screen.findByText(/博多站前飯店/);
  });

  /**
   * Linked to the place it is, before it lands.
   *
   * I first shipped this without the lookup and said what lands is the same
   * record however it arrived. It was not: a hotel with an address and no
   * `placeId` is invisible downstream — no photo, no map, and no travel time
   * into or out of the place they sleep.
   */
  it('links the hotel to its place, as 住宿資訊 does', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind' ? ok({ kind: 'stay' })
        : url === '/api/places/resolve'
          ? ok({ placeId: 'place-hakata', latitude: 33.5898, longitude: 130.4207, name: '博多站前飯店' })
          : ok({ hotelName: '博多站前飯店', address: '福岡市博多區', checkInDate: '2026-11-05', checkOutDate: '2026-11-10' }),
    )));

    const { onAddStayItems } = mount();
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    const items = onAddStayItems.mock.calls[0]?.[0] as Array<{ placeId?: string }>;
    expect(items.some(item => item.placeId === 'place-hakata')).toBe(true);
  });

  /** A lookup that finds nothing must never hold the booking back. */
  it('still files the hotel when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/screenshots/kind') return Promise.resolve(ok({ kind: 'stay' }));
      if (url === '/api/places/resolve') return Promise.reject(new Error('offline'));
      return Promise.resolve(ok({ hotelName: '博多站前飯店', address: '福岡市博多區', checkInDate: '2026-11-05', checkOutDate: '2026-11-10' }));
    }));

    const { onAddStayItems } = mount();
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    expect(onAddStayItems.mock.calls[0]?.[0].length).toBeGreaterThan(0);
  });

  it('files both legs of a flight from here', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({
            OUTBOUND: {
              departureAirport: '桃園國際機場',
              departureDate: '2026-11-05',
              departureTime: '14:20',
              arrivalAirport: '福岡機場',
              arrivalDate: '2026-11-05',
              arrivalTime: '18:40',
            },
            RETURN: {
              departureAirport: '福岡機場',
              departureDate: '2026-11-10',
              departureTime: '09:15',
            },
          }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    await waitFor(() => expect(onAddFlightAnchors).toHaveBeenCalledTimes(1));
    const anchors = onAddFlightAnchors.mock.calls[0]?.[0] as Array<{ direction: string }>;
    expect(anchors).toHaveLength(2);
    // The direction comes from the envelope key, not the body: a leg that
    // disagreed with its own slot would file two outbounds.
    expect(anchors.map(anchor => anchor.direction)).toEqual(['OUTBOUND', 'RETURN']);
    await screen.findByText(/讀到 2 段航班/);
  });

  /**
   * A leg with no time anchors nothing, and everything downstream is built
   * from the date and the hour. Refused rather than filed with a blank.
   */
  it('refuses a flight it could not fully read', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({ OUTBOUND: { departureAirport: '桃園國際機場', departureDate: '2026-11-05' } }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    await screen.findByText(/讀不出完整的日期與時間/);
    expect(onAddFlightAnchors).not.toHaveBeenCalled();
  });

  it('shows the server message when reading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: '辨識服務忙碌中，請稍後再試。' }),
    } as unknown as Response)));

    mount();
    upload();

    await screen.findByText('辨識服務忙碌中，請稍後再試。');
  });

  /** A failed upload has to be retryable with the same picture. */
  it('lets the same file be picked again after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: '辨識服務忙碌中，請稍後再試。' }),
    } as unknown as Response)));

    mount();
    upload();
    await screen.findByTestId('plan-screenshot-error');

    const input = screen.getByTestId('plan-screenshot-file') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
