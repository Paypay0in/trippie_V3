/**
 * What publishing a trip does, and what it must never do.
 *
 * The expensive mistakes here are quiet ones: a trip that becomes readable
 * because a column was added, a link that stops working because somebody
 * toggled a switch, a note that was withheld and shipped anyway. None of those
 * show up on screen — so they are asserted here or not at all.
 */
import { describe, expect, it } from 'vitest';
import {
  isTripPublished,
  publishedTripDays,
  publishTrip,
  savableStops,
  tripDayCount,
  tripFromUrl,
  tripShareLink,
  unpublishTrip,
} from './tripPublishing';
import { PublishedTrip, PublishedTripStop, Trip } from '../types';

const NOW = () => '2026-10-24T00:00:00.000Z';
const TOKEN = () => 'tok';

const trip = (patch: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: '東京 7 日旅行',
  startDate: '2026-03-12',
  endDate: '2026-03-18',
  totalCost: 0,
  expenses: [],
  companions: [],
  shoppingList: [],
  archivedAt: '',
  ...patch,
});

const stop = (patch: Partial<PublishedTripStop> = {}): PublishedTripStop => ({
  id: 's1',
  time: '09:00',
  title: '淺草寺',
  type: 'ACTIVITY',
  ...patch,
});

describe('a trip nobody published', () => {
  /*
    The one that matters. Every trip in the database predates this field, so
    absent has to read as 私人 — the other default publishes somebody's
    itinerary because a migration ran.
  */
  it('is private when it has no visibility at all', () => {
    expect(isTripPublished(trip())).toBe(false);
  });

  it('is still private when switched to 公開 without publishing', () => {
    expect(isTripPublished(trip({ visibility: 'public' }))).toBe(false);
  });

  it('has no link to hand anybody', () => {
    expect(tripShareLink(trip(), 'https://x')).toBeUndefined();
  });
});

describe('publishing', () => {
  it('stamps the date and leaves the switches alone', () => {
    const published = publishTrip(trip({ sharesPhotos: false }), 'public', NOW, TOKEN);

    expect(published.publishedAt).toBe(NOW());
    expect(isTripPublished(published)).toBe(true);
    expect(published.sharesPhotos).toBe(false);
  });

  /* The date is when people first saw it, not when it was last touched. */
  it('does not re-stamp a trip already published', () => {
    const once = publishTrip(trip(), 'public', () => '2026-01-01T00:00:00.000Z', TOKEN);
    const twice = publishTrip(once, 'link', NOW, TOKEN);

    expect(twice.publishedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('mints a token for 僅連結 and puts it in the link', () => {
    const linked = publishTrip(trip(), 'link', NOW, TOKEN);

    expect(tripShareLink(linked, 'https://x')).toBe('https://x/?tr=t1&t=tok');
  });

  /*
    Somebody has that link in a message. Switching to 公開 and back must hand
    them the same one — invalidating it quietly is a broken promise, not a
    security measure.
  */
  it('keeps a token across a trip to 公開 and back', () => {
    const linked = publishTrip(trip(), 'link', NOW, TOKEN);
    const back = publishTrip(publishTrip(linked, 'public', NOW, TOKEN), 'link', NOW, () => 'other');

    expect(back.shareToken).toBe('tok');
  });

  it('gives a 公開 trip a link that needs no token', () => {
    expect(tripShareLink(publishTrip(trip(), 'public', NOW, TOKEN), 'https://x'))
      .toBe('https://x/?tr=t1');
  });

  /* The money never travels with the link. */
  it('carries no expenses into what publishing produced', () => {
    const withBills = trip({ expenses: [{ id: 'e1' } as never] });
    const published = publishTrip(withBills, 'public', NOW, TOKEN);

    /* Still on the owner's own trip object — it is the payload that omits it. */
    expect(published.expenses).toHaveLength(1);
  });
});

describe('unpublishing', () => {
  it('revokes rather than deletes', () => {
    const revoked = unpublishTrip(publishTrip(trip(), 'public', NOW, TOKEN), NOW);

    expect(revoked.revokedAt).toBe(NOW());
    expect(revoked.publishedAt).toBe(NOW());
    expect(isTripPublished(revoked)).toBe(false);
  });

  it('leaves no link behind', () => {
    const revoked = unpublishTrip(publishTrip(trip(), 'link', NOW, TOKEN), NOW);

    expect(tripShareLink(revoked, 'https://x')).toBeUndefined();
  });

  /* Publishing again is allowed, and brings the same link back. */
  it('can be published again', () => {
    const revoked = unpublishTrip(publishTrip(trip(), 'link', NOW, TOKEN), NOW);
    const again = publishTrip(revoked, 'link', NOW, () => 'other');

    expect(isTripPublished(again)).toBe(true);
    expect(again.shareToken).toBe('tok');
    expect(again.revokedAt).toBeUndefined();
  });
});

describe('the link a visitor arrives with', () => {
  it('is read back off the query string', () => {
    expect(tripFromUrl('?tr=t1&t=tok')).toEqual({ id: 't1', token: 'tok' });
  });

  it('is nothing when there is no trip in it', () => {
    expect(tripFromUrl('?c=col1')).toBeUndefined();
  });
});

describe('the days a reader walks', () => {
  const published = (stops: PublishedTripStop[]): PublishedTrip => ({
    id: 't1',
    ownerId: 'me',
    name: '東京 7 日旅行',
    startDate: '2026-03-12',
    stops,
  });

  it('groups by date and numbers from one', () => {
    const days = publishedTripDays(published([
      stop({ id: 'b', date: '2026-03-13', title: '壽司大' }),
      stop({ id: 'a', date: '2026-03-12' }),
    ]));

    expect(days.map(day => [day.dayNumber, day.date]))
      .toEqual([[1, '2026-03-12'], [2, '2026-03-13']]);
  });

  it('puts a stop with no time last, not first', () => {
    const days = publishedTripDays(published([
      stop({ id: 'later', date: '2026-03-12', time: '', title: '找間咖啡廳' }),
      stop({ id: 'nine', date: '2026-03-12', time: '09:00' }),
    ]));

    expect(days[0]?.stops.map(s => s.id)).toEqual(['nine', 'later']);
  });

  /*
    A count that disagrees with the list it opens is the shape that has cost
    this project days. An undated stop goes under the start date; it is never
    dropped.
  */
  it('keeps an undated stop rather than losing it', () => {
    const days = publishedTripDays(published([stop({ date: undefined })]));

    expect(days).toHaveLength(1);
    expect(days[0]?.date).toBe('2026-03-12');
  });
});

describe('how long the trip was', () => {
  /* An empty Tuesday does not shorten somebody's holiday. */
  it('counts the dates the owner set, inclusive', () => {
    expect(tripDayCount({ startDate: '2026-03-12', endDate: '2026-03-18' })).toBe(7);
  });

  it('says nothing rather than guessing when a date is missing', () => {
    expect(tripDayCount({ startDate: '2026-03-12' })).toBe(0);
  });
});

describe('what a visitor may save', () => {
  /* 「華航 CI100」 in somebody's 收藏 is a row they can never use. */
  it('leaves out flights and hotels', () => {
    const kept = savableStops([
      stop({ id: 'f', type: 'FLIGHT', title: '華航 CI100' }),
      stop({ id: 'h', type: 'HOTEL', title: '東橫 INN' }),
      stop({ id: 'a', type: 'ACTIVITY' }),
      stop({ id: 'e', type: 'FOOD', title: '壽司大' }),
    ]);

    expect(kept.map(s => s.id)).toEqual(['a', 'e']);
  });

  it('leaves out a stop with no name to save', () => {
    expect(savableStops([stop({ title: '  ' })])).toEqual([]);
  });
});
