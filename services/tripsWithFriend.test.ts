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

/**
 * 「Gina 跟我一起去釜山呀」.
 *
 * A seat is tied to an account two ways, and the app already treats both as
 * 「this seat is that person」: `userId`, written when an invite is claimed,
 * and the seat's own `id` where it was created as the friend themselves —
 * which is what `CompanionsModal` reads when it draws 已連結好友.
 */
describe('座位跟帳號的兩種關聯', () => {
  it('counts a seat created as the friend', () => {
    const busan = trip({ id: 'busan', name: '釜山', members: [{ id: GINA }, { userId: 'user-me' }] });

    expect(tripsWithFriend([busan], GINA).map(entry => entry.id)).toEqual(['busan']);
  });

  it('still counts a claimed invite', () => {
    expect(tripsWithFriend([trip()], GINA)).toHaveLength(1);
  });

  /*
    And a seat carrying neither is still not her. Nothing in the data says
    「Gina」 is this account rather than somebody else with that name — which
    is the whole reason this is matched on an id.
  */
  it('does not guess from a bare name', () => {
    const older = trip({ members: [{ userId: 'user-me' }, {}] });

    expect(tripsWithFriend([older], GINA)).toEqual([]);
  });
});

/**
 * 「我是希望進行中的也可以出現」.
 *
 * They always did — the caller hands in the trips still being planned and the
 * ones already taken together, and nothing here asks which is which. The past
 * tense on the label was what made a count of 1 on an upcoming trip read as
 * wrong; the arithmetic was never about whether a trip had happened.
 */
describe('還沒出發的旅程', () => {
  it('counts a trip that has not happened yet', () => {
    const upcoming = trip({ id: 'tokyo', name: '東京 2026 秋', startDate: '2099-10-20', endDate: '2099-10-24' });

    expect(tripsWithFriend([upcoming], GINA).map(entry => entry.id)).toEqual(['tokyo']);
  });

  it('counts both, and puts the nearer one first', () => {
    const past = trip({ id: 'busan', name: '釜山', startDate: '2026-03-20' });
    const upcoming = trip({ id: 'tokyo', name: '東京', startDate: '2099-10-20' });

    expect(tripsWithFriend([past, upcoming], GINA).map(entry => entry.id)).toEqual(['tokyo', 'busan']);
  });
});

/**
 * 「目前我跟他一起有的行程：東京」, and the page said 0.
 *
 * Adding somebody to a trip writes `companions`. `members` is built when the
 * trip is created and when it is archived, and never in between — so for a
 * trip somebody joined afterwards it still describes the day it was made.
 */
describe('兩份名單', () => {
  it('counts somebody added after the trip was created', () => {
    const tokyo = {
      id: 'tokyo',
      name: '東京 2026 秋',
      startDate: '2026-10-20',
      /* As it was on the day it was created: just the owner. */
      members: [{ userId: 'user-me' }],
      /* As it is now. */
      companions: [{ id: GINA }],
    };

    expect(tripsWithFriend([tokyo], GINA).map(entry => entry.id)).toEqual(['tokyo']);
  });

  it('still counts one who was there from the start', () => {
    expect(tripsWithFriend([trip({ companions: [] })], GINA)).toHaveLength(1);
  });

  it('counts a trip once when both lists name her', () => {
    const both = trip({ companions: [{ userId: GINA }] });

    expect(tripsWithFriend([both], GINA)).toHaveLength(1);
  });

  /* And neither list naming her is still not her. */
  it('does not invent one from an empty roster', () => {
    expect(tripsWithFriend([trip({ members: [], companions: [] })], GINA)).toEqual([]);
  });
});

/**
 * 「Tokyo 2026/10/20 – 10/24」 listed twice.
 *
 * Drafts and history hold the same journey, and the archived copy does not
 * always carry the id the draft had — so deduping on the id alone let one
 * trip arrive as two. That is not a list of two trips; it is the same trip
 * seen from two shelves.
 */
describe('同一趟的兩份', () => {
  const draft = {
    id: 'draft-tokyo', name: 'Tokyo', startDate: '2026-10-20', endDate: '2026-10-24',
    members: [{ userId: GINA }],
  };
  const archived = {
    id: 'archived-tokyo', name: 'Tokyo', startDate: '2026-10-20', endDate: '2026-10-24',
    members: [{ userId: GINA }],
  };

  it('shows it once when the two copies have different ids', () => {
    expect(tripsWithFriend([draft, archived], GINA)).toHaveLength(1);
  });

  it('still shows two trips that really are two', () => {
    const busan = { ...archived, id: 'busan', name: '釜山', startDate: '2026-03-20', endDate: '2026-03-24' };

    expect(tripsWithFriend([draft, busan], GINA)).toHaveLength(2);
  });

  /* Same name, different dates, is two journeys to the same place. */
  it('keeps two visits to one city apart', () => {
    const again = { ...draft, id: 'tokyo-2', startDate: '2027-04-01', endDate: '2027-04-05' };

    expect(tripsWithFriend([draft, again], GINA)).toHaveLength(2);
  });
});
