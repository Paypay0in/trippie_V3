import { describe, expect, it } from 'vitest';
import { findBelowFold, foldProbeRequested } from './foldProbe';

/**
 * 「這頁我的理想是 手機不上下滾動 就能完全看到目前這張圖上的所有資訊」.
 *
 * jsdom does no layout, which is the whole reason the probe has to run on the
 * phone. What is testable is the part that decides which blocks are worth
 * naming once the measurements exist.
 */
const block = (testId: string, bottom: number): Element => ({
  tagName: 'SECTION',
  getAttribute: (name: string) => (name === 'data-testid' ? testId : null),
  querySelector: () => null,
  textContent: '',
  __bottom: bottom,
} as unknown as Element);

const bottomOf = (element: Element) => (element as unknown as { __bottom: number }).__bottom;

describe('findBelowFold', () => {
  it('names only what falls below the fold', () => {
    const findings = findBelowFold(
      [block('hero', 400), block('tiles', 600), block('notes', 900)],
      742,
      bottomOf,
    );
    expect(findings.map(f => f.description)).toEqual(['[notes]']);
    expect(findings[0].overhang).toBe(158);
  });

  it('says nothing when the whole page fits', () => {
    expect(findBelowFold([block('hero', 400), block('notes', 700)], 742, bottomOf)).toEqual([]);
  });

  /**
   * Downwards the useful answer is the first block that did not make it, not
   * the last — that is the one whose height has to change for the rest to fit.
   */
  it('puts the first one to miss the fold first', () => {
    const findings = findBelowFold(
      [block('deep', 1200), block('notes', 800)],
      742,
      bottomOf,
    );
    expect(findings.map(f => f.description)).toEqual(['[notes]', '[deep]']);
  });

  it('a block landing exactly on the fold still fits', () => {
    expect(findBelowFold([block('notes', 742)], 742, bottomOf)).toEqual([]);
  });
});

describe('foldProbeRequested', () => {
  it('is off unless asked for', () => {
    expect(foldProbeRequested('')).toBe(false);
    expect(foldProbeRequested('?sync=1')).toBe(false);
  });

  it('is on with ?fold=1', () => {
    expect(foldProbeRequested('?fold=1')).toBe(true);
    expect(foldProbeRequested('?sync=1&fold=1')).toBe(true);
  });
});
