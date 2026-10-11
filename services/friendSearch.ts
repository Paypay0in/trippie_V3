/**
 * Looking somebody up by the address you already know.
 *
 * 「可以互相加好友」, with search by email rather than invite links.
 *
 * The lookup itself is a database function with exact matching, because a
 * partial match is an enumeration tool: 「a@」 would return everyone whose
 * address begins that way and the directory this was meant not to be exists
 * after all. This file is the other half of that decision — the client has to
 * refuse to send anything the server would then have to interpret.
 */

/** Trimmed and lowered, which is how the function compares it. */
export const normalizeEmail = (value: string): string => (value || '').trim().toLowerCase();

/**
 * Is this a whole address, rather than the beginning of one?
 *
 * Deliberately strict about shape and silent about correctness: this decides
 * whether to ask the server, not whether the address exists. 「a@」 and 「ann」
 * are refused here so they are never sent, which is the difference between a
 * lookup and a search.
 */
export const isCompleteEmail = (value: string): boolean => {
  const email = normalizeEmail(value);
  if (email.length < 6 || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  const [local, domain, ...rest] = email.split('@');
  if (rest.length > 0) return false;
  if (!local || !domain) return false;
  // A domain without a dot is not a whole address, and a trailing dot is not a
  // domain at all.
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every(label => label.length > 0);
};

export type FriendSearchState =
  | { kind: 'idle' }
  | { kind: 'incomplete' }
  | { kind: 'self' }
  | { kind: 'searching' }
  | { kind: 'found'; person: { id: string; displayName: string; avatarUrl?: string } }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

/**
 * What to do with what has been typed so far.
 *
 * Typing your own address is its own answer rather than a 「not found」: the
 * account exists and telling somebody 「no such person」 about themselves is
 * the kind of small lie that makes people distrust the rest of the screen.
 */
export const searchIntent = (
  typed: string,
  ownEmail: string | undefined,
): 'idle' | 'incomplete' | 'self' | 'search' => {
  const email = normalizeEmail(typed);
  if (!email) return 'idle';
  if (!isCompleteEmail(email)) return 'incomplete';
  if (ownEmail && normalizeEmail(ownEmail) === email) return 'self';
  return 'search';
};
