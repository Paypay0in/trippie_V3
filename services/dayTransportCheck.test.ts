import { describe, expect, it } from 'vitest';
import { CheckedLeg, checkDayTransport, HEAVY_DAY_MINUTES } from './dayTransportCheck';

const leg = (over: Partial<CheckedLeg> = {}): CheckedLeg => ({
  fromId: 'a', toId: 'b', fromTitle: 'A', toTitle: 'B', journeyMinutes: 20, gapMinutes: 60, ...over,
});

const kinds = (legs: CheckedLeg[]) => checkDayTransport(legs).findings.map(finding => finding.kind);

describe('a day that does not work', () => {
  it('says which leg does not fit, and by how much', () => {
    const verdict = checkDayTransport([leg({ journeyMinutes: 50, gapMinutes: 30, fromTitle: '新世界百貨', toTitle: '海雲台' })]);

    expect(verdict.findings[0].kind).toBe('too_tight');
    expect(verdict.findings[0].blocking).toBe(true);
    expect(verdict.findings[0].message).toContain('差 20 分');
  });

  it('warns on a gap that only just works', () => {
    // 「剛好來得及」 is the one that fails in practice: a bus five minutes late
    // and the booking is gone.
    const verdict = checkDayTransport([leg({ journeyMinutes: 25, gapMinutes: 30 })]);

    expect(verdict.findings[0].kind).toBe('too_tight');
    expect(verdict.findings[0].blocking).toBe(false);
  });

  it('leaves a comfortable gap alone', () => {
    expect(kinds([leg({ journeyMinutes: 20, gapMinutes: 60 })])).toEqual([]);
  });

  it('puts what will not work before what merely costs', () => {
    const verdict = checkDayTransport([
      leg({ fromId: 'c', toId: 'd', journeyMinutes: 50, gapMinutes: 60 }),
      leg({ journeyMinutes: 40, gapMinutes: 20 }),
    ]);

    expect(verdict.findings[0].blocking).toBe(true);
    expect(verdict.findings[0].kind).toBe('too_tight');
  });
});

describe('what the day costs', () => {
  it('names a single long journey', () => {
    expect(kinds([leg({ journeyMinutes: 55, gapMinutes: 120 })])).toContain('long_haul');
  });

  it('says when the day is mostly transport', () => {
    const heavy = Array.from({ length: 5 }, (_unused, index) =>
      leg({ fromId: `f${index}`, toId: `t${index}`, journeyMinutes: 40, gapMinutes: 120 }));

    const verdict = checkDayTransport(heavy);

    expect(verdict.travelMinutes).toBe(200);
    expect(verdict.travelMinutes).toBeGreaterThanOrEqual(HEAVY_DAY_MINUTES);
    expect(kinds(heavy)).toContain('heavy_day');
  });

  it('spots a return to an area already left', () => {
    // A → B → A: the same journey made twice, and usually fixed by swapping
    // two stops rather than dropping one.
    const day = [
      leg({ fromId: '1', toId: '2', fromAreaIndex: 0, toAreaIndex: 1, fromAreaLabel: '廣安里', toAreaLabel: '西面' }),
      leg({ fromId: '2', toId: '3', fromAreaIndex: 1, toAreaIndex: 0, fromAreaLabel: '西面', toAreaLabel: '廣安里' }),
    ];

    expect(kinds(day)).toContain('backtrack');
  });

  it('does not call an ordinary two-area day a backtrack', () => {
    const day = [
      leg({ fromId: '1', toId: '2', fromAreaIndex: 0, toAreaIndex: 0 }),
      leg({ fromId: '2', toId: '3', fromAreaIndex: 0, toAreaIndex: 1 }),
    ];

    expect(kinds(day)).not.toContain('backtrack');
  });
});

describe('what the check cannot see', () => {
  it('says how many legs had no route, and leaves them out of the total', () => {
    const verdict = checkDayTransport([
      leg({ journeyMinutes: 20 }),
      leg({ fromId: 'c', toId: 'd', journeyMinutes: undefined }),
    ]);

    expect(verdict.unknownLegs).toBe(1);
    expect(verdict.travelMinutes).toBe(20);
    expect(kinds([leg({ journeyMinutes: undefined })])).toContain('unknown_leg');
  });

  it('calls a clean day clean', () => {
    const verdict = checkDayTransport([leg(), leg({ fromId: 'c', toId: 'd' })]);

    expect(verdict.smooth).toBe(true);
    expect(verdict.findings).toEqual([]);
  });

  it('is not smooth when there was nothing to check', () => {
    // No legs is not a verdict. A day with one stop cannot be called smooth
    // without saying that nothing was looked at.
    expect(checkDayTransport([]).smooth).toBe(false);
  });
});
