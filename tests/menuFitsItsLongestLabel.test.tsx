/**
 * The trip menu is sized by its labels, not by a number measured in Chinese.
 *
 * 「就很擠」 — the Founder switched to English and the 更多 menu's rows wrapped:
 * "Destination settings" and "Manage companions" each broke onto two lines
 * inside a `w-48` box that had been exactly right for 目的地設定 and 旅伴管理.
 * A width chosen against one language is a layout bug waiting for the second.
 *
 * jsdom has no layout engine, so this cannot measure pixels. What it can do is
 * assert the decision: the container is content-sized with a floor and a
 * ceiling, and the rows are told not to wrap. A future edit that pins a fixed
 * width back on fails here.
 *
 * The ceiling matters as much as the floor. `w-max` alone would let a long
 * label push the menu off the side of a narrow phone, trading a wrap for a
 * bleed — which is worse, because a wrapped label is still readable.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHELL = readFileSync(join(__dirname, '..', 'components', 'TripWorkspaceShell.tsx'), 'utf8');

/** The dropdown panel, found by the classes that position it. */
const menuPanel = (): string => {
  const line = SHELL.split('\n').find(l => l.includes('absolute bottom-16 right-0'));
  expect(line, 'the trip menu panel moved; this test needs updating with it').toBeTruthy();
  return line as string;
};

describe('the trip menu fits its longest label', () => {
  it('is sized by its content rather than a fixed width', () => {
    const panel = menuPanel();

    expect(panel).toContain('w-max');
    expect(panel, 'a fixed w-48 is what wrapped the English labels').not.toMatch(/\sw-\d+\s/);
  });

  it('cannot shrink to a stub or bleed off a narrow phone', () => {
    const panel = menuPanel();

    expect(panel).toContain('min-w-48');
    expect(panel).toMatch(/max-w-\[min\(/);
    expect(panel, 'the ceiling must be relative to the viewport, not a constant')
      .toContain('100vw');
  });

  it('keeps each row on one line', () => {
    const row = SHELL.split('\n').find(l => l.includes('min-h-11 w-full items-center'));
    expect(row, 'the menu row moved; this test needs updating with it').toBeTruthy();
    expect(row).toContain('whitespace-nowrap');
  });
});
