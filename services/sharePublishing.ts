/**
 * Publishing, unpublishing, and what each one means — for anything shareable.
 *
 * A collection and a trip answer 「can a stranger read this right now」 the same
 * way, and they have to: the moment the two answers can differ, one of them is
 * wrong and nobody finds out until something private is readable. So the rule
 * lives here once and both callers use it, rather than each carrying its own
 * copy of four lines that must never disagree.
 *
 * Four decisions, and they are approved ones:
 *
 * - private by default. Nothing is shared by accident;
 * - publishing stamps a date, and `visibility` alone never grants access —
 *   every read function requires both, so something switched to 公開 and never
 *   published stays unreadable;
 * - 僅連結 mints a token the first time it needs one and keeps it afterwards,
 *   so a link somebody already sent does not silently stop working;
 * - unpublishing stamps `revokedAt` rather than deleting anything. The link
 *   dies, the content stays, and what a recipient already saved is theirs.
 */

import { ShareVisibility } from '../types';

/**
 * The part of a shareable record that publishing touches.
 *
 * Nothing about collections or trips in particular. A type that named either
 * would be a type the other has to be cast into, and a cast is where the two
 * implementations start growing back.
 */
export interface Shareable {
  visibility: ShareVisibility;
  shareToken?: string;
  publishedAt?: string;
  revokedAt?: string;
  updatedAt: string;
}

/** The fields a newly created shareable starts with: private, unpublished. */
export const unsharedFields = (): Pick<
  Shareable, 'visibility'
> & { sharesOwnNotes: boolean; sharesPhotos: boolean; sharesPlaceDetails: boolean } => ({
  /*
    Private, and not because of a default somewhere else. 「All trips and saved
    collections are private by default」 is the first approved rule in the
    ticket, and this is the line that keeps it.
  */
  visibility: 'private',
  sharesOwnNotes: true,
  sharesPhotos: true,
  sharesPlaceDetails: true,
});

/**
 * A token nobody can guess.
 *
 * `crypto.randomUUID` where it exists, which is everywhere this app runs, and
 * a refusal rather than `Math.random` where it does not — a share link whose
 * token can be guessed is worse than no share link.
 */
export const mintShareToken = (): string => {
  const source = globalThis.crypto;
  if (!source?.randomUUID) throw new Error('沒有可用的亂數來源，無法建立分享連結');
  return source.randomUUID().replace(/-/g, '');
};

/**
 * Published, at this visibility.
 *
 * 公開 and 僅連結 both publish; the difference is whether it is listed, which
 * is the database's question and not this one's. Publishing something already
 * published re-stamps nothing: the original date is when people first saw it.
 */
export const publishShareable = <T extends Shareable>(
  record: T,
  visibility: Exclude<ShareVisibility, 'private'>,
  now: () => string = () => new Date().toISOString(),
  token: () => string = mintShareToken,
): T => {
  const at = now();
  const next: T = {
    ...record,
    visibility,
    publishedAt: record.publishedAt ?? at,
    updatedAt: at,
  };
  delete next.revokedAt;
  /*
    The token is kept once minted. A 僅連結 record switched to 公開 and back has
    the same link it always had — somebody has that link in a message, and
    quietly invalidating it is a broken promise rather than a security measure.
  */
  if (visibility === 'link' && !next.shareToken) next.shareToken = token();
  return next;
};

/**
 * Not published any more.
 *
 * `revokedAt` rather than deleting: the content stays, the owner keeps it, and
 * the read function refuses it from the next request onward. What a recipient
 * already saved is theirs and is not touched — 「不應自動抹除別人合法的收藏」.
 */
export const unpublishShareable = <T extends Shareable>(
  record: T,
  now: () => string = () => new Date().toISOString(),
): T => {
  const at = now();
  return { ...record, visibility: 'private', revokedAt: at, updatedAt: at };
};

/** Whether a stranger can reach this right now, for the screen to say so. */
export const isShared = (record: Shareable): boolean =>
  Boolean(record.publishedAt) && !record.revokedAt && record.visibility !== 'private';

/**
 * The address to hand somebody.
 *
 * 公開 needs no token; 僅連結 is nothing without one. Something unpublished has
 * no link at all, which is why this returns undefined rather than a URL that
 * would answer 「not found」.
 *
 * `param` is the query key the recipient arrives with — `c` for a collection,
 * `tr` for a trip — so one link builder serves both without either knowing
 * about the other.
 */
export const shareLink = (
  record: Shareable,
  origin: string,
  param: string,
  id: string,
): string | undefined => {
  if (!isShared(record)) return undefined;
  const base = `${origin}/?${param}=${encodeURIComponent(id)}`;
  if (record.visibility !== 'link') return base;
  return record.shareToken ? `${base}&t=${encodeURIComponent(record.shareToken)}` : undefined;
};

/** The token parameter, shared by every kind of link this app mints. */
export const SHARE_TOKEN_PARAM = 't';

/** What a visitor arrived with, for whichever kind of link this is. */
export const sharedFromUrl = (
  search: string,
  param: string,
): { id: string; token?: string } | undefined => {
  const params = new URLSearchParams(search);
  const id = params.get(param)?.trim();
  if (!id) return undefined;
  const token = params.get(SHARE_TOKEN_PARAM)?.trim();
  return token ? { id, token } : { id };
};
