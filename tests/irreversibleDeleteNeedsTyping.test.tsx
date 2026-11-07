/**
 * @vitest-environment jsdom
 *
 * 「若刪除將完全無法恢復！確認請輸入刪除」 — Founder, 2026-11-05.
 *
 * `requireTypedText` had existed in ConfirmDialog for a long time with a
 * comment reserving it for actions that destroy something irreplaceable, and
 * with **zero callers**. Every destructive path in the app accepted one tap,
 * including the one whose own description reads 「刪除後無法復原」.
 *
 * Two halves are pinned here, because either half alone can rot:
 *
 *  1. The dialog actually refuses until the exact word is typed — including
 *     when the word arrives on the request rather than as a prop, which is the
 *     only shape the two shared App.tsx render sites can use.
 *  2. The three unrecoverable handlers still carry it. That is read out of the
 *     source, because this gate is invisible from the outside: removing it
 *     throws nothing, logs nothing, and every other test still passes. The
 *     symptom only appears the day somebody deletes something on one tap.
 *
 * Deliberately NOT gated, and asserted as such: deleting a trip draft. The
 * cloud still holds it and the recoverable-trip notice offers it back, so it
 * is not unrecoverable — and a gate on everything is a gate on nothing.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from '../components/ConfirmDialog';

const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');

afterEach(cleanup);

/** The body of one `const handleX = (...) => { ... }` block, by name. */
const handlerBody = (name: string): string => {
  const start = appSource.indexOf(`const ${name} = `);
  expect(start, `${name} not found in App.tsx`).toBeGreaterThan(-1);
  return appSource.slice(start, start + 1400);
};

describe('an unrecoverable delete has to be typed, not tapped', () => {
  it('keeps the action disabled until the exact word is typed', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        request={{
          title: 'Delete this post?',
          confirmLabel: 'Delete',
          requireTypedText: '刪除',
        }}
        onCancel={() => {}}
        onConfirm={onConfirm}
        confirmTestId="confirm"
        inputTestId="typed"
      />,
    );

    const confirm = screen.getByTestId('confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // A near miss is still a miss.
    fireEvent.change(screen.getByTestId('typed'), { target: { value: '刪' } });
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('typed'), { target: { value: '刪除' } });
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('leaves an ordinary confirmation one tap away', () => {
    render(
      <ConfirmDialog
        request={{ title: 'Copy this?', confirmLabel: 'Copy', tone: 'neutral' }}
        onCancel={() => {}}
        onConfirm={() => {}}
        confirmTestId="confirm"
      />,
    );
    expect((screen.getByTestId('confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ['handleDeleteHistory', 'deleting a trip record'],
    ['handleDeleteComment', 'deleting a comment'],
    ['handleDeleteCommunityPost', 'deleting a community post'],
  ])('%s arms the typed gate (%s)', name => {
    expect(handlerBody(name)).toContain('requireTypedText');
  });

  it('does not gate deleting a trip draft, which the cloud can still return', () => {
    expect(handlerBody('handleDeleteDraft')).not.toContain('requireTypedText');
  });
});
