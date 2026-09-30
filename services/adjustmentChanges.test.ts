import { describe, expect, it } from 'vitest';
import { checkProposedChanges, ProposedChange } from './adjustmentChanges';

const TRIP = ['2026-10-02', '2026-10-03', '2026-10-04'];

const add = (over: Partial<ProposedChange> = {}): ProposedChange => ({
  type: 'add',
  toDate: '2026-10-03',
  toTime: '14:00',
  proposedItem: { placeName: '松島海上纜車 附近汗蒸幕' },
  ...over,
});

describe('checkProposedChanges', () => {
  it('keeps an add that says which day', () => {
    expect(checkProposedChanges([add()], TRIP)).toEqual({ changes: [add()], warnings: [] });
  });

  it('drops an add with no day, and says which one', () => {
    // This reached the screen as 「加到：未指定日期」 — a suggestion the
    // traveller asked to have scheduled, offered back unscheduled, with
    // nothing to do but accept it and then go looking for it.
    const result = checkProposedChanges([add({ toDate: undefined })], TRIP);
    expect(result.changes).toEqual([]);
    expect(result.warnings[0]).toContain('松島海上纜車 附近汗蒸幕');
    expect(result.warnings[0]).toContain('沒有指定要排在哪一天');
  });

  it('drops a day outside the trip rather than snapping to the nearest', () => {
    // Snapping would be a guess wearing a specific number, on the one field
    // the whole request was about.
    const result = checkProposedChanges([add({ toDate: '2026-11-20' })], TRIP);
    expect(result.changes).toEqual([]);
    expect(result.warnings[0]).toContain('2026-11-20');
  });

  it('drops a date that is not a date', () => {
    expect(checkProposedChanges([add({ toDate: '下週二' })], TRIP).changes).toEqual([]);
  });

  it('leaves move and update alone', () => {
    // They carry an existing item that already has a day, and no toDate there
    // means "keep the one it is on".
    const moves: ProposedChange[] = [
      { type: 'move', existingItemId: 'a', toTime: '10:00' },
      { type: 'update', existingItemId: 'b' },
      { type: 'remove', existingItemId: 'c' },
    ];
    expect(checkProposedChanges(moves, TRIP).changes).toEqual(moves);
  });

  it('names an unnamed place without saying undefined', () => {
    const result = checkProposedChanges([{ type: 'add' }], TRIP);
    expect(result.warnings[0]).toContain('一個新地點');
    expect(result.warnings[0]).not.toContain('undefined');
  });

  it('accepts any day when the trip has no dates to check against', () => {
    // A trip with no start or end still gets suggestions; only the range check
    // is skipped, never the presence of a day.
    expect(checkProposedChanges([add({ toDate: '2027-01-01' })], []).changes).toHaveLength(1);
    expect(checkProposedChanges([add({ toDate: undefined })], []).changes).toEqual([]);
  });

  it('survives a response that is not a list', () => {
    expect(checkProposedChanges(null, TRIP)).toEqual({ changes: [], warnings: [] });
    expect(checkProposedChanges({ changes: [] }, TRIP)).toEqual({ changes: [], warnings: [] });
  });
});
