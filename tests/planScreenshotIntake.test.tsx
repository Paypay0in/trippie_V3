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
  render(
    <PlanScreenshotIntake
      destination="沖繩"
      destinationCountry="日本"
      onAddRental={onAddRental}
      onSavePlaces={onSavePlaces}
      {...props}
    />,
  );
  return { onAddRental, onSavePlaces };
};

const upload = () => fireEvent.change(screen.getByTestId('plan-screenshot-file'), {
  target: { files: [file()] },
});

describe('the screenshot entry', () => {
  it('offers one upload for all three kinds the Founder named', () => {
    mount();
    expect(screen.getByTestId('plan-screenshot-upload')).toBeTruthy();
    // 靈感、租車、票券 — the traveller is told what may be thrown at it,
    // because an upload button that does not say what it takes gets used
    // for one thing only.
    const hint = screen.getByText(/旅行靈感、租車訂單、訂好的票券截圖都可以/);
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
   * A room and a flight are sent to their own cards rather than half-filed.
   *
   * Those cards work out the nights, and the two legs the first night is
   * timed from. A booking dropped in here without that lands on the trip with
   * nothing hanging off it, and the gap shows up later as a night nobody has
   * a room for.
   */
  it('points a booking at the card that knows what to do with it', async () => {
    const fetched = vi.fn(() => Promise.resolve(ok({ kind: 'stay' })));
    vi.stubGlobal('fetch', fetched);
    const { onAddRental, onSavePlaces } = mount();
    upload();

    await screen.findByText(/住宿資訊/);
    expect(onAddRental).not.toHaveBeenCalled();
    expect(onSavePlaces).not.toHaveBeenCalled();
    // Classified and then left alone: parsing a booking only to refuse it
    // spends a model call on an answer nobody reads, and makes the traveller
    // wait out the parse before being told to use another card.
    expect(fetched).toHaveBeenCalledTimes(1);
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
