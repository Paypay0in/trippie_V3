import { describe, expect, it } from 'vitest';
import { findOverflowing, overflowProbeRequested } from './overflowProbe';

/**
 * The widths are supplied rather than measured: jsdom does no layout, which is
 * the whole reason the probe has to run in a real browser. What is testable is
 * the part that decides which of many overflowing elements is worth naming.
 */
const node = (
  description: { tag?: string; testId?: string; className?: string; text?: string },
  rect: { width: number; right: number },
  children: Element[] = [],
): Element => {
  const element = {
    tagName: (description.tag || 'div').toUpperCase(),
    children,
    textContent: description.text || '',
    getAttribute: (name: string) =>
      name === 'data-testid' ? description.testId ?? null : description.className ?? null,
    getBoundingClientRect: () => ({ width: rect.width, right: rect.right }),
  };
  return element as unknown as Element;
};

const rootOf = (elements: Element[]): ParentNode =>
  ({ querySelectorAll: () => elements } as unknown as ParentNode);

describe('findOverflowing', () => {
  it('names the innermost offender, not the twelve wrappers around it', () => {
    // Every ancestor of an overflowing element overflows too. Reporting all of
    // them buries the one whose styles actually need changing.
    const inner = node({ testId: 'day-tabs' }, { width: 520, right: 520 });
    const outer = node({ tag: 'section' }, { width: 520, right: 520 }, [inner]);

    const findings = findOverflowing(rootOf([outer, inner]), 390);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('day-tabs');
    expect(findings[0].overhang).toBe(130);
  });

  it('puts the worst overhang first', () => {
    const small = node({ testId: 'a' }, { width: 400, right: 400 });
    const large = node({ testId: 'b' }, { width: 700, right: 700 });
    const findings = findOverflowing(rootOf([small, large]), 390);
    expect(findings.map(f => f.description)).toEqual([
      expect.stringContaining('b'),
      expect.stringContaining('a'),
    ]);
  });

  it('ignores elements that fit, and ones with no size', () => {
    const fits = node({ testId: 'fits' }, { width: 380, right: 390 });
    const hidden = node({ testId: 'hidden' }, { width: 0, right: 900 });
    expect(findOverflowing(rootOf([fits, hidden]), 390)).toEqual([]);
  });

  it('prefers a test id, then width classes, then the text', () => {
    const byId = node({ testId: 'stay-banner' }, { width: 500, right: 500 });
    expect(findOverflowing(rootOf([byId]), 390)[0].description).toBe('div[data-testid="stay-banner"]');

    const byClass = node(
      { tag: 'ul', className: 'mb-5 flex gap-2 overflow-x-auto text-slate-500', text: '行程' },
      { width: 500, right: 500 },
    );
    const described = findOverflowing(rootOf([byClass]), 390)[0].description;
    // Only the classes that decide width; a full Tailwind string is forty
    // tokens of colour and shadow.
    expect(described).toContain('flex');
    expect(described).toContain('gap-2');
    expect(described).not.toContain('text-slate-500');
    expect(described).toContain('行程');
  });
});

describe('overflowProbeRequested', () => {
  it('is off unless asked for', () => {
    expect(overflowProbeRequested('')).toBe(false);
    expect(overflowProbeRequested('?join=abc')).toBe(false);
    expect(overflowProbeRequested('?overflow=0')).toBe(false);
    expect(overflowProbeRequested('?overflow=1')).toBe(true);
  });
});
