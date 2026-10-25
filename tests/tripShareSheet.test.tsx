/**
 * @vitest-environment jsdom
 *
 * ⑥ 分享設定 and ⑦ 預覽公開版本 for a trip.
 *
 * The preview is the thing worth testing hardest. It is not a mock-up of what
 * publishing would do — it is the visitor's own screen over the payload these
 * switches produce — so a withheld note must be absent from it, not merely
 * hidden, and nothing about the money may reach it at all.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import TripShareSheet, { previewPayload } from '../components/TripShareSheet';
import { ItineraryItem } from '../types';
import { TripShareFields } from '../services/tripPublishing';

const trip = (patch: Partial<TripShareFields> = {}): TripShareFields => ({
  id: 't1', name: '東京 7 日旅行', ownerId: 'me',
  startDate: '2026-03-12', endDate: '2026-03-18', ...patch,
});

const item = (patch: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: 'i1', type: 'ACTIVITY', title: '淺草寺', location: '台東區',
  notes: '牛角蛋糕的必勝', time: '09:00', date: '2026-03-12', isCompleted: false,
  address: '東京都台東区浅草2-3-1', latitude: 35.71, longitude: 139.79,
  photos: ['data:image/png;base64,x'], ...patch,
} as ItineraryItem);

const sheet = (props: Partial<React.ComponentProps<typeof TripShareSheet>> = {}) => {
  const handlers = { onClose: vi.fn(), onPublish: vi.fn(), onUnpublish: vi.fn() };
  render(
    <TripShareSheet
      trip={trip()}
      itinerary={[item()]}
      origin="https://trippie"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('分享設定', () => {
  /*
    Nothing is published by opening this. A tap on 公開 must not put somebody's
    itinerary on the internet while they are still reading the options.
  */
  it('publishes nothing until 發佈 is pressed', async () => {
    const handlers = sheet();

    await userEvent.click(screen.getByTestId('trip-share-visibility-public'));

    expect(handlers.onPublish).not.toHaveBeenCalled();
  });

  it('publishes at the chosen visibility with the switches', async () => {
    const handlers = sheet();

    await userEvent.click(screen.getByTestId('trip-share-visibility-public'));
    await userEvent.click(screen.getByTestId('trip-share-photos'));
    await userEvent.click(screen.getByTestId('trip-share-publish'));

    const published = handlers.onPublish.mock.calls[0]?.[0];
    expect(published.visibility).toBe('public');
    expect(published.sharesPhotos).toBe(false);
    expect(published.publishedAt).toBeTruthy();
  });

  /*
    No link before 發佈, and that is the honest shape rather than an omission.
    Access needs `publishedAt` as well as a visibility — a URL offered for
    copying while the trip answers nothing is a link somebody sends and then
    has to apologise for.
  */
  it('offers no link until it has actually been published', async () => {
    sheet();

    await userEvent.click(screen.getByTestId('trip-share-visibility-link'));

    expect(screen.queryByTestId('trip-share-link')).toBeNull();
  });

  it('shows the 僅連結 link once it is published', async () => {
    sheet({
      trip: trip({
        visibility: 'link',
        publishedAt: '2026-03-01T00:00:00.000Z',
        shareToken: 'tok',
      }),
    });

    expect(screen.getByTestId('trip-share-link').textContent).toContain('?tr=t1&t=tok');
  });

  /* Offering 取消公開 on something never published suggests something is out there. */
  it('offers no 取消公開 on a trip that was never published', () => {
    sheet();

    expect(screen.queryByTestId('trip-share-unpublish')).toBeNull();
  });

  it('revokes a published one without deleting it', async () => {
    const handlers = sheet({
      trip: trip({ visibility: 'public', publishedAt: '2026-03-01T00:00:00.000Z' }),
    });

    await userEvent.click(screen.getByTestId('trip-share-visibility-private'));
    await userEvent.click(screen.getByTestId('trip-share-unpublish'));

    const revoked = handlers.onUnpublish.mock.calls[0]?.[0];
    expect(revoked.revokedAt).toBeTruthy();
    expect(revoked.publishedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  /* Somebody agreeing to 公開 is entitled to know what is not in the bargain. */
  it('says in writing that the money is never shared', () => {
    sheet();

    expect(screen.getByTestId('trip-share-never-shared').textContent).toContain('分帳');
  });
});

describe('預覽公開版本', () => {
  it('opens the visitor’s own screen', async () => {
    sheet();

    await userEvent.click(screen.getByTestId('trip-share-preview-open'));

    expect(screen.getByTestId('public-trip')).toBeTruthy();
    expect(screen.getByText('淺草寺')).toBeTruthy();
  });

  it('drops a withheld note from the preview, not just from view', async () => {
    sheet();

    await userEvent.click(screen.getByTestId('trip-share-notes'));
    await userEvent.click(screen.getByTestId('trip-share-preview-open'));

    expect(screen.queryByText('牛角蛋糕的必勝')).toBeNull();
  });
});

/**
 * The payload itself, against the shape `read_public_trip` produces.
 *
 * Asserted separately because this is the half that has to keep matching a
 * function written in SQL. The day they disagree is the day 預覽 starts lying.
 */
describe('what the switches produce', () => {
  const all = { notes: true, photos: true, placeDetails: true };

  it('carries everything when nothing is withheld', () => {
    const [stop] = previewPayload(trip(), [item()], all).stops;

    expect(stop.notes).toBe('牛角蛋糕的必勝');
    expect(stop.address).toBe('東京都台東区浅草2-3-1');
    expect(stop.photos).toHaveLength(1);
  });

  /* Absent, not blank: a withheld field must not sit in the payload at all. */
  it('omits a withheld note entirely', () => {
    const [stop] = previewPayload(trip(), [item()], { ...all, notes: false }).stops;

    expect('notes' in stop).toBe(false);
  });

  it('omits the address and coordinates when 地點詳細資訊 is off', () => {
    const [stop] = previewPayload(trip(), [item()], { ...all, placeDetails: false }).stops;

    expect('address' in stop).toBe(false);
    expect('latitude' in stop).toBe(false);
    /* The name and the day stay, exactly as the sheet promises. */
    expect(stop.title).toBe('淺草寺');
    expect(stop.date).toBe('2026-03-12');
  });

  it('omits photographs when 照片 is off', () => {
    const [stop] = previewPayload(trip(), [item()], { ...all, photos: false }).stops;

    expect('photos' in stop).toBe(false);
  });
});
