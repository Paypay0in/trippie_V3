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
