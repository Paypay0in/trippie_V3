import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DRAFTS_STORAGE_KEY, readDraftStore, TripDraft, writeDraftStore } from './tripPersistence';

/**
 * A trip has one roster.
 *
 * It had two. `companions` was what adding or removing somebody wrote;
 * `members` was built when the trip was created and when it was archived, and
 * at no point in between. So 「目前我跟他一起有的行程：東京」 answered 0 — 諮 was
 * added after the trip existed, and the list being read still described the
 * day it was made.
 *
 * I patched it by reading both. That is the fix I keep having to stop myself
 * making: the second list is still there, still wrong, and still the one the
 * next screen will read. This deletes it. Everything that needs a roster with
 * owners and accounts on it derives one through `buildTripRoster`, which was
 * already the only place that decides who the owner is.
 *
 * @vitest-environment jsdom
 */

const draft = (over: Partial<TripDraft> = {}): TripDraft => ({
  id: 'tokyo',
  name: '東京',
  startDate: '2026-10-20',
  endDate: '2026-10-24',
  expenses: [],
  companions: [{ id: 'gina', name: 'Gina' }],
  shoppingList: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as TripDraft);

beforeEach(() => { localStorage.clear(); });

describe('a stored trip', () => {
  it('keeps one roster through a save and a reload', () => {
    writeDraftStore([draft()], 'tokyo');

    const [reloaded] = readDraftStore().drafts;
    expect(reloaded.companions).toEqual([{ id: 'gina', name: 'Gina' }]);
    expect(reloaded).not.toHaveProperty('members');
  });

  /*
    A trip saved by an older build carries the second list. It is dropped on
    read rather than merged: it is a snapshot of a day that has passed, and
    the live list beside it is the answer.
  */
  it('drops a roster left by an older build', () => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([
      { ...draft(), members: [{ id: 'tokyo:owner', name: '我', type: 'owner' }] },
    ]));

    const [reloaded] = readDraftStore().drafts;
    expect(reloaded).not.toHaveProperty('members');
    expect(reloaded.companions).toEqual([{ id: 'gina', name: 'Gina' }]);
  });
});

/**
 * The guard against growing it back.
 *
 * Deleting a second source of truth only holds until somebody writes
 * `members:` onto a draft again, and that line looks perfectly reasonable on
 * its own — it did when I wrote it.
 */
describe('nothing writes a roster onto a trip', () => {
  it('has no members field on a draft or an archived trip', () => {
    const source = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8').split('\n');

    /*
      Handing an already-derived roster to a hook or a child is not a second
      list; `settlementMembers` is `buildTripRoster`'s own output. Building one
      into an object that gets stored is what this forbids.
    */
    const writes = source.flatMap((line, index) => {
      if (!/^\s*members:\s/.test(line)) return [];
      if (/^\s*members:\s*settlementMembers,?\s*$/.test(line)) return [];
      return [`App.tsx:${index + 1}  ${line.trim()}`];
    });

    expect(writes, 'a trip has one roster: companions. Derive the rest with buildTripRoster').toEqual([]);
  });
});
