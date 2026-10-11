import { describe, expect, it } from 'vitest';
import { localToday, phaseForDate } from './tripPhaseByDate';

describe('phaseForDate', () => {
  it('is 行前 before departure', () => {
    expect(phaseForDate('2026-09-10', '2026-09-20', '2026-09-25')).toBe('pre');
  });

  it('is 旅行中 on the first and last day, not just between them', () => {
    expect(phaseForDate('2026-09-20', '2026-09-20', '2026-09-25')).toBe('during');
    expect(phaseForDate('2026-09-25', '2026-09-20', '2026-09-25')).toBe('during');
  });

  it('is 返程 once the trip is over', () => {
    expect(phaseForDate('2026-09-26', '2026-09-20', '2026-09-25')).toBe('post');
  });

  it('says nothing when the trip has no dates', () => {
    // Callers then keep whatever they worked out from the ledger.
    expect(phaseForDate('2026-09-26', '', '')).toBeNull();
  });

  it('copes with only one date known', () => {
    expect(phaseForDate('2026-09-26', '2026-09-20')).toBe('during');
    expect(phaseForDate('2026-09-10', '2026-09-20')).toBe('pre');
  });

  it('reads today in the local day, not UTC', () => {
    expect(localToday(new Date('2026-09-15T23:30:00'))).toBe('2026-09-15');
  });
});

/**
 * 「目前旅程都已經完成了」.
 *
 * 釜山 ran 2026/10/02–10/07. On 10/10 the workspace still said RETURN 返程中
 * while the home screen called the same trip 已結束的旅程 — one trip saying two
 * things on two screens, which is worse than either being wrong, because then
 * neither can be trusted.
 *
 * 'post' is 回國機場消費: the journey home and the spending on it. It is a day,
 * not a state a trip stays in forever.
 */
describe('a trip that is over', () => {
  it('is 返程中 on the day after it ends, when you are travelling home', () => {
    expect(phaseForDate('2026-10-08', '2026-10-02', '2026-10-07')).toBe('post');
  });

  it('is finished two days later, not still coming home', () => {
    expect(phaseForDate('2026-10-09', '2026-10-02', '2026-10-07')).toBe('summary');
  });

  /** The exact report: 釜山, three days after it ended. */
  it('does not say 返程中 three days after the trip ended', () => {
    expect(phaseForDate('2026-10-10', '2026-10-02', '2026-10-07')).toBe('summary');
  });

  it('is still the trip on its last day', () => {
    expect(phaseForDate('2026-10-07', '2026-10-02', '2026-10-07')).toBe('during');
  });

  /** Month and year ends are where off-by-one date maths shows up. */
  it('crosses the end of a month correctly', () => {
    expect(phaseForDate('2026-11-01', '2026-10-25', '2026-10-31')).toBe('post');
    expect(phaseForDate('2026-11-02', '2026-10-25', '2026-10-31')).toBe('summary');
  });

  it('crosses the end of a year correctly', () => {
    expect(phaseForDate('2027-01-01', '2026-12-20', '2026-12-31')).toBe('post');
    expect(phaseForDate('2027-01-02', '2026-12-20', '2026-12-31')).toBe('summary');
  });

  it('is finished long afterwards, not permanently returning', () => {
    expect(phaseForDate('2027-06-01', '2026-10-02', '2026-10-07')).toBe('summary');
  });
});
