/**
 * 「然後點擊這個對象，應該要可以看到他跟我一起的旅行」.
 *
 * A friend row said a name and offered to remove them, which is the one
 * question nobody opens that screen to answer.
 */
import { describe, expect, it } from 'vitest';
import { sharedTripDates, tripsWithFriend } from './tripsWithFriend';

const GINA = 'user-gina';

const trip = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: '東京 2026 秋',
  startDate: '2026-10-20',
  endDate: '2026-10-24',
  members: [{ userId: 'user-me' }, { userId: GINA }],
  ...over,
});

describe('一起去過的旅行', () => {
  it('finds the trips her id is on', () => {
    expect(tripsWithFriend([trip()], GINA).map(entry => entry.label)).toEqual(['東京 2026 秋']);
  });

  /*
    Matched on the id, never on the name. 「Gina」 on a roster is a seat that
    may or may not have been claimed, and claiming it is exactly what writes
    the id — pairing by name would show a trip she was invited to and never
    joined.
  */
  it('does not count a seat nobody claimed', () => {
    const invited = trip({ members: [{ userId: 'user-me' }, { name: 'Gina' }] });

    expect(tripsWithFriend([invited], GINA)).toEqual([]);
  });

  it('leaves out the trips taken without her', () => {
    const alone = trip({ id: 't2', name: '首爾', members: [{ userId: 'user-me' }] });

    expect(tripsWithFriend([trip(), alone], GINA).map(entry => entry.id)).toEqual(['t1']);
  });

  /* Drafts and history can hold the same trip; it is one trip either way. */
  it('counts a trip once when it is in both lists', () => {
    expect(tripsWithFriend([trip(), trip()], GINA)).toHaveLength(1);
  });

  /* The trip somebody is asking about is usually the last one. */
  it('puts the most recent first', () => {
    const older = trip({ id: 't0', name: '釜山', startDate: '2026-03-20', endDate: '2026-03-24' });

    expect(tripsWithFriend([older, trip()], GINA).map(entry => entry.id)).toEqual(['t1', 't0']);
  });

  it('names a trip that was never named', () => {
    const unnamed = trip({ name: '  ', destination: '京都' });

    expect(tripsWithFriend([unnamed], GINA)[0].label).toBe('京都');
  });

  it('asks nothing of an id that is not there', () => {
    expect(tripsWithFriend([trip()], '')).toEqual([]);
  });
});

describe('旅行的日期', () => {
  /* The year once: both ends of a trip are nearly always in the same one. */
  it('writes the year once', () => {
    expect(sharedTripDates({ id: 't', label: 'x', startDate: '2026-10-20', endDate: '2026-10-24' }))
      .toBe('2026/10/20 – 10/24');
  });

  it('writes both years when a trip crosses one', () => {
    expect(sharedTripDates({ id: 't', label: 'x', startDate: '2026-12-29', endDate: '2027-01-03' }))
      .toBe('2026/12/29 – 2027/01/03');
  });

  it('writes one date for a day trip', () => {
    expect(sharedTripDates({ id: 't', label: 'x', startDate: '2026-10-20', endDate: '2026-10-20' }))
      .toBe('2026/10/20');
  });

  it('says nothing when there are no dates', () => {
    expect(sharedTripDates({ id: 't', label: 'x' })).toBe('');
  });
});
