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

  it('reports a nameless add as missing a place, not as missing a day', () => {
    // It is missing both. The place is the one worth saying: 「沒有指定哪一天」
    // reads as something the traveller could fix by picking a date, and there
    // is nothing here to put on one.
    const result = checkProposedChanges([{ type: 'add' }], TRIP);
    expect(result.warnings).toEqual(['有一筆新增建議沒有地點名稱，已略過。']);
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

describe('an add with no place on it', () => {
  it('is dropped, because a place is the whole content of an add', () => {
    // Observed from a -lite model: no proposedItem at all, the place written
    // into the time field. Accepting it creates a card with no name.
    const result = checkProposedChanges(
      [{ type: 'add', toDate: TRIP[0], toTime: '22:45 N/A (Late Night Snack near Hotel)' }],
      TRIP,
    );

    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual(['有一筆新增建議沒有地點名稱，已略過。']);
  });

  it('still keeps an add that has one', () => {
    const result = checkProposedChanges(
      [{ type: 'add', toDate: TRIP[0], toTime: '11:30', proposedItem: { placeName: '海雲臺海水浴場' } }],
      TRIP,
    );

    expect(result.changes).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});

describe('a place name that is not a name', () => {
  it('drops an add whose place name is a paragraph', () => {
    const result = checkProposedChanges([
      {
        type: 'add',
        toDate: '2026-10-03',
        proposedItem: { placeName: `${'safely cleanly efficiently '.repeat(20)}쿠에른 신세계백화점 센텀시티점` },
      },
    ], ['2026-10-03']);

    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual(['有一筆新增建議的地點名稱不像地名，已略過，請再試一次。']);
  });

  it('keeps an ordinary long-ish name', () => {
    const result = checkProposedChanges([
      { type: 'add', toDate: '2026-10-03', proposedItem: { placeName: '쿠에른 신세계백화점 센텀시티점' } },
    ], ['2026-10-03']);

    expect(result.changes).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('rebuilds an add that named its place only at the top level', () => {
    const result = checkProposedChanges([
      { type: 'add', toDate: '2026-10-03', placeName: 'Millac The Market' },
    ], ['2026-10-03']);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].proposedItem?.placeName).toBe('Millac The Market');
    expect(result.warnings).toEqual([]);
  });
});

/**
 * 「當我輸入航班資訊時 行程表就應該先錨定 1.飛機起飛與抵達時間 2.應該回推兩小時到機場」.
 *
 * The anchors exist and are correct — a 16:35 departure already produces
 * 14:35 抵達機場 — but the planner was free to ignore them, and did: day 1 of
 * the Busan itinerary had them clearing Korean immigration at 14:00, before the
 * plane left Taoyuan. The flights come first; everything else is placed after.
 */
describe('當天的航班是下限', () => {
  const FLOORS = { '2026-10-02': '21:55' };

  it('排在航班之前的建議被改排到航班之後，而不是丟掉', () => {
    const result = checkProposedChanges(
      [add({ toDate: '2026-10-02', toTime: '14:00' })],
      TRIP,
      FLOORS,
    );

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].toTime).toBe('21:55');
  });

  it('說出它改了什麼、為什麼', () => {
    const result = checkProposedChanges([add({ toDate: '2026-10-02', toTime: '14:00' })], TRIP, FLOORS);

    expect(result.warnings[0]).toContain('21:55');
    expect(result.warnings[0]).toContain('航班');
  });

  it('移動既有項目一樣受限', () => {
    const result = checkProposedChanges(
      [{ type: 'move', existingItemId: 'x', placeName: '甘川洞文化村', toDate: '2026-10-02', toTime: '10:00' }],
      TRIP,
      FLOORS,
    );

    expect(result.changes[0].toTime).toBe('21:55');
  });

  it('航班之後的時間原封不動', () => {
    const late = add({ toDate: '2026-10-02', toTime: '22:30' });

    expect(checkProposedChanges([late], TRIP, FLOORS)).toEqual({ changes: [late], warnings: [] });
  });

  it('沒有航班的日子完全不受影響', () => {
    const other = add({ toDate: '2026-10-03', toTime: '09:00' });

    expect(checkProposedChanges([other], TRIP, FLOORS)).toEqual({ changes: [other], warnings: [] });
  });
});
