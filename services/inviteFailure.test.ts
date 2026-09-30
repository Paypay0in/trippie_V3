/**
 * What a refused invite tells the traveller.
 *
 * Both functions refuse for reasons that are ordinary and fixable, and every
 * one of them reached the screen as 「產生邀請連結失敗」. These pin the
 * mapping, and the fallback: an unrecognised reason must still be readable,
 * because the cases nobody anticipated are the ones worth seeing.
 */
import { describe, expect, it } from 'vitest';
import { claimFailureMessage, inviteFailureMessage } from './inviteFailure';

describe('inviteFailureMessage', () => {
  it('names the unsynced companion, which is the fixable case', () => {
    expect(inviteFailureMessage('member does not belong to this trip')).toContain('先儲存這趟旅程');
  });

  it('separates "not the owner" from it, because the fix is different', () => {
    const message = inviteFailureMessage('not the trip owner');
    expect(message).toContain('確認登入的帳號');
    expect(message).not.toContain('這位旅伴');
  });

  it('shows an unrecognised reason instead of hiding it', () => {
    expect(inviteFailureMessage('permission denied for table trip_invites'))
      .toBe('產生邀請連結失敗：permission denied for table trip_invites');
  });

  it('still says something when there is no reason at all', () => {
    expect(inviteFailureMessage(undefined)).toBe('產生邀請連結失敗');
    expect(inviteFailureMessage('')).toBe('產生邀請連結失敗');
  });
});

describe('claimFailureMessage', () => {
  it('tells a used link apart from a broken one', () => {
    expect(claimFailureMessage('invite not found or expired')).toContain('重新產生');
  });

  it('asks for a login when that is all that is missing', () => {
    expect(claimFailureMessage('must be signed in to join')).toContain('登入');
  });

  it('shows an unrecognised reason', () => {
    expect(claimFailureMessage('network error')).toBe('加入失敗：network error');
  });
});
