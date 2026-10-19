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
  ownerId: 'user-me',
  companions: [{ userId: GINA }],
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
    const invited = trip({ companions: [{ name: 'Gina' }] });

    expect(tripsWithFriend([invited], GINA)).toEqual([]);
  });

  it('leaves out the trips taken without her', () => {
    const alone = trip({ id: 't2', name: '首爾', companions: [] });

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
    const busan = trip({ id: 'busan', name: '釜山', companions: [{ id: GINA }] });

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
    const older = trip({ companions: [{}] });

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
 * Adding somebody to a trip writes `companions`. There used to be a second
 * roster, `members`, built when the trip was created and when it was archived
 * and never in between — so for a trip somebody joined afterwards it still
 * described the day it was made. Reading both was the patch. Deleting the
 * stale one is the repair, and these hold the repair.
 */
describe('一份名單', () => {
  it('counts somebody added after the trip was created', () => {
    const tokyo = {
      id: 'tokyo',
      name: '東京 2026 秋',
      startDate: '2026-10-20',
      ownerId: 'user-me',
      companions: [{ id: GINA }],
    };

    expect(tripsWithFriend([tokyo], GINA).map(entry => entry.id)).toEqual(['tokyo']);
  });

  /* The owner holds a seat, and is never in `companions`. */
  it('finds a trip the friend owns', () => {
    const hers = { id: 'hers', name: '她的釜山', ownerId: GINA, companions: [{ userId: 'user-me' }] };

    expect(tripsWithFriend([hers], GINA).map(entry => entry.id)).toEqual(['hers']);
  });

  it('does not invent one from an empty roster', () => {
    expect(tripsWithFriend([trip({ companions: [] })], GINA)).toEqual([]);
  });
});

/**
 * 「Tokyo 2026/10/20 – 10/24」 listed twice, and 「有一趟旅程是釜山」.
 *
 * I deduped on the name and the dates to settle that, and it was the wrong
 * repair: the second row was not a duplicate, it was 釜山 under the wrong
 * name — and the rule would have hidden the one row that proves it.
 *
 * A list may repeat itself. A list that quietly drops a row cannot be argued
 * with.
 */
describe('去重只看 id', () => {
  const draft = {
    id: 'draft-tokyo', name: 'Tokyo', startDate: '2026-10-20', endDate: '2026-10-24',
    companions: [{ userId: GINA }],
  };

  it('keeps two rows that share a name and dates but not an id', () => {
    const other = { ...draft, id: 'another' };

    expect(tripsWithFriend([draft, other], GINA)).toHaveLength(2);
  });

  it('still shows one row for one trip listed twice', () => {
    expect(tripsWithFriend([draft, draft], GINA)).toHaveLength(1);
  });
});
