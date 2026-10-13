import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { viewerIdentityNotice } from './viewerIdentityNotice';

/**
 * 「這還是我的帳 Gina 依然收到」, and 「所以呢？」.
 *
 * Her device answers every ownership question as the trip owner, because
 * `resolveViewer` falls back to the owner when it cannot match the signed-in
 * user to a seat. Nothing anywhere said so — it was noticed only because a
 * duplicate prompt happened to show her somebody else's receipts.
 *
 * Which of the two causes it is cannot be decided from the code: her seat may
 * have no `user_id` on the server, or she may not be signed in at all. The
 * device knows, so the device says — and the two need different actions,
 * which is why this names them apart instead of saying 「無法確認身分」 twice.
 */

const OWNER = 'seat-north';

const owner = { id: OWNER, type: 'owner', userId: 'auth-north', name: 'North' };
const ginaUnlinked = { id: 'seat-gina', type: 'companion', name: 'Gina' };
const ginaLinked = { ...ginaUnlinked, userId: 'auth-gina' };

const shared = [owner, ginaUnlinked] as never;

describe('what this device can say about who is holding it', () => {
  it('names the signed-out case and sends them to sign in', () => {
    const notice = viewerIdentityNotice({
      roster: shared,
      authUserId: undefined,
      tripOwnerMemberId: OWNER,
    });

    expect(notice?.problem).toBe('signed-out');
    expect(notice?.message).toContain('還沒登入');
    // The consequence, not just the state: it is what makes the notice worth
    // reading rather than dismissing.
    expect(notice?.message).toContain('當成旅程建立者');
    expect(notice?.action).toContain('登入');
  });

  it('names the unclaimed seat and sends them to the roster', () => {
    const notice = viewerIdentityNotice({
      roster: shared,
      authUserId: 'auth-gina',
      tripOwnerMemberId: OWNER,
    });

    expect(notice?.problem).toBe('seat-unlinked');
    expect(notice?.message).toContain('還沒跟這趟旅程裡的任何一位旅伴連起來');
    expect(notice?.action).toContain('旅伴名單');
  });

  it('says nothing to someone it can identify', () => {
    expect(viewerIdentityNotice({
      roster: [owner, ginaLinked] as never,
      authUserId: 'auth-gina',
      tripOwnerMemberId: OWNER,
    })).toBeNull();

    expect(viewerIdentityNotice({
      roster: shared,
      authUserId: 'auth-north',
      tripOwnerMemberId: OWNER,
    })).toBeNull();
  });

  /**
   * And nothing at all on a solo trip, even signed out. With nobody else on
   * the roster the owner fallback is simply correct — every expense really is
   * theirs, and a warning there is the app apologising for being right.
   */
  it('says nothing on a trip with nobody else in it', () => {
    expect(viewerIdentityNotice({
      roster: [owner] as never,
      authUserId: undefined,
      tripOwnerMemberId: OWNER,
    })).toBeNull();
  });
});

describe('and where it says it', () => {
  const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

  /**
   * Above every section of the trip, not inside the expense form. The
   * consequence is not limited to one screen: whose expense this is, who may
   * edit it, and who the settlement says owes whom all read the same guessed
   * answer.
   */
  it('sits in the workspace shell rather than one screen', () => {
    const shell = APP.indexOf('<TripWorkspaceShell');
    const notice = APP.indexOf('data-testid="viewer-identity-notice"');
    const firstSection = APP.indexOf('{workspaceSection === "overview" && currentPhase === "pre" && (');

    expect(notice).toBeGreaterThan(shell);
    expect(notice).toBeLessThan(firstSection);
  });

  /** The two doors the rest of the app already uses, not new ones. */
  it('reuses the roster modal and the sign-in event', () => {
    expect(APP).toContain("if (identityNotice.problem === 'seat-unlinked') setIsCompanionsOpen(true);");
    expect(APP).toContain('window.dispatchEvent(new Event(OPEN_SIGN_IN_EVENT));');
  });
});
