/**
 * @vitest-environment jsdom
 *
 * The invite has to survive registering.
 *
 * The friend arriving has never opened this app. She taps a link in LINE,
 * finds she needs an account, makes one — which means an email, possibly
 * another tab — and comes back. If the token did not outlive that, she lands
 * in an empty app with no idea what went wrong and no second link to try.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearPendingInvite, readPendingInvite } from '../components/JoinTripSheet';

const storage = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

afterEach(() => {
  clearPendingInvite(window.sessionStorage);
});

describe('holding an invite across sign-up', () => {
  it('remembers the token the link arrived with', () => {
    const store = storage();
    expect(readPendingInvite('?join=abc123', store)).toBe('abc123');
    // The address bar is cleaned immediately afterwards, so the second read
    // has nothing but storage to go on — which is the read that matters.
    expect(readPendingInvite('', store)).toBe('abc123');
  });

  it('forgets it once it has been used', () => {
    const store = storage();
    readPendingInvite('?join=abc123', store);
    clearPendingInvite(store);
    expect(readPendingInvite('', store)).toBeNull();
  });

  it('prefers a fresh link over a stale one', () => {
    // Someone re-invited, and the old token is dead. The link in hand wins.
    const store = storage();
    readPendingInvite('?join=old', store);
    expect(readPendingInvite('?join=new', store)).toBe('new');
    expect(readPendingInvite('', store)).toBe('new');
  });

  it('says nothing on an ordinary app open', () => {
    expect(readPendingInvite('', storage())).toBeNull();
    expect(readPendingInvite('?lang=en', storage())).toBeNull();
  });

  it('survives storage being unavailable rather than throwing', () => {
    // Private browsing throws on write. An invite that crashes the app is
    // worse than an invite that simply needs the link opened again.
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    } as unknown as Storage;

    expect(() => readPendingInvite('?join=abc', hostile)).not.toThrow();
    expect(readPendingInvite('?join=abc', hostile)).toBe('abc');
    expect(() => clearPendingInvite(hostile)).not.toThrow();
  });

  it('copes with no storage at all', () => {
    expect(readPendingInvite('?join=abc', undefined)).toBe('abc');
    expect(readPendingInvite('', undefined)).toBeNull();
  });
});
