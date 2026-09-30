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
    parentElement: null as Element | null,
    textContent: description.text || '',
    getAttribute: (name: string) =>
      name === 'data-testid' ? description.testId ?? null : description.className ?? null,
    getBoundingClientRect: () => ({ width: rect.width, right: rect.right }),
  };
  for (const child of children) {
    (child as unknown as { parentElement: Element | null }).parentElement = element as unknown as Element;
  }
  return element as unknown as Element;
};

/** Nothing scrolls, unless a test says otherwise. */
const nothingScrolls = () => false;

const rootOf = (elements: Element[]): ParentNode =>
  ({ querySelectorAll: () => elements } as unknown as ParentNode);

describe('findOverflowing', () => {
  it('names the innermost offender, not the twelve wrappers around it', () => {
    // Every ancestor of an overflowing element overflows too. Reporting all of
    // them buries the one whose styles actually need changing.
    const inner = node({ testId: 'day-tabs' }, { width: 520, right: 520 });
    const outer = node({ tag: 'section' }, { width: 520, right: 520 }, [inner]);

    const findings = findOverflowing(rootOf([outer, inner]), 390, 1, nothingScrolls);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('day-tabs');
    expect(findings[0].overhang).toBe(130);
  });

  it('puts the worst overhang first', () => {
    const small = node({ testId: 'a' }, { width: 400, right: 400 });
    const large = node({ testId: 'b' }, { width: 700, right: 700 });
    const findings = findOverflowing(rootOf([small, large]), 390, 1, nothingScrolls);
    expect(findings.map(f => f.description)).toEqual([
      expect.stringContaining('b'),
      expect.stringContaining('a'),
    ]);
  });

  it('ignores elements that fit, and ones with no size', () => {
    const fits = node({ testId: 'fits' }, { width: 380, right: 390 });
    const hidden = node({ testId: 'hidden' }, { width: 0, right: 900 });
    expect(findOverflowing(rootOf([fits, hidden]), 390, 1, nothingScrolls)).toEqual([]);
  });

  it('prefers a test id, then width classes, then the text', () => {
    const byId = node({ testId: 'stay-banner' }, { width: 500, right: 500 });
    expect(findOverflowing(rootOf([byId]), 390, 1, nothingScrolls)[0].description).toBe('div[data-testid="stay-banner"]');

    const byClass = node(
      { tag: 'ul', className: 'mb-5 flex gap-2 overflow-x-auto text-slate-500', text: '行程' },
      { width: 500, right: 500 },
    );
    const described = findOverflowing(rootOf([byClass]), 390, 1, nothingScrolls)[0].description;
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

describe('a row that scrolls sideways is not overflow', () => {
  it('ignores the children of a horizontal scroller', () => {
    // The day tabs. Six findings came back — Day 5, Day 6, their dates and two
    // dots — all working exactly as designed, while the genuinely broken
    // layout on the same screen was never reported because it did not cross
    // the edge: a button squeezed until its label broke one character a line.
    const tab5 = node({ text: 'Day 5' }, { width: 54, right: 467 });
    const tab6 = node({ text: 'Day 6' }, { width: 54, right: 559 });
    const strip = node({ className: 'flex gap-2 overflow-x-auto' }, { width: 393, right: 393 }, [tab5, tab6]);

    const findings = findOverflowing(
      rootOf([strip, tab5, tab6]),
      393,
      1,
      element => (element.getAttribute('class') || '').includes('overflow-x-auto'),
    );
    expect(findings).toEqual([]);
  });

  it('still reports a scroller that is itself too wide', () => {
    // The container overflowing is a real finding; its contents are simply
    // what it was built to hold.
    const strip = node({ testId: 'wide-strip', className: 'overflow-x-auto' }, { width: 600, right: 600 });
    const findings = findOverflowing(
      rootOf([strip]),
      393,
      1,
      element => (element.getAttribute('class') || '').includes('overflow-x-auto'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('wide-strip');
  });
});
