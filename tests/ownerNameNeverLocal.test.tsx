/**
 * @vitest-environment node
 *
 * 「這個諮 不是我的名字啊 我的用戶名是 Ann」 — 「沒有改變喔」.
 *
 * The database had it right all along: the owner row on that trip reads Ann.
 * The owner seat was being relabelled on arrival from whatever profile the
 * reading device was signed in as, so on the second traveller's phone the
 * person she owed money to was called by her own nickname.
 *
 * Fixing it took two passes because the screen builds the roster in seven
 * places and tells the expense form who the owner is in three more. The first
 * pass changed one of them, and nothing on screen moved.
 *
 * This fails when a call site goes back to naming the owner after the device.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
const LOCAL_NAME = 'authProfile?.displayName || userProfile.name || "我"';

/**
 * Where the local profile is still the right answer.
 *
 * `ownerDisplayName` is itself defined as the local name when the reader IS
 * the owner, and a trip being created or archived here is this account's own.
 */
const ALLOWED = [
  'ownerDisplayName',   // the definition's own owner branch
  'archivedTripId',     // archiving a trip from this device
  'newDraftId',         // a trip this account is creating right now
];

const lineOf = (index: number) => app.slice(0, index).split('\n').length;

describe('who the owner is called', () => {
  it('is never taken from the profile on the device, except where it is the owner', () => {
    const offenders: number[] = [];
    let at = app.indexOf(LOCAL_NAME);
    while (at >= 0) {
      // The surrounding statement decides whether this use is legitimate.
      const context = app.slice(Math.max(0, at - 220), at + 60);
      if (!ALLOWED.some(allowed => context.includes(allowed))) offenders.push(lineOf(at));
      at = app.indexOf(LOCAL_NAME, at + 1);
    }

    expect(offenders).toEqual([]);
  });

  it('is derived once, from the trip', () => {
    expect(app).toContain('const ownerDisplayName =');
    expect(app).toContain('remoteOwnerName');
  });
});
