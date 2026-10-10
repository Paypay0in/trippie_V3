/**
 * The photo across the top of a profile.
 *
 * 「100%還原」 — the design opens the account page on a cover photo with 更換封面
 * on it. The `profiles` table has display_name, avatar_url and bio, and no
 * column for this one, so it cannot be saved to the account today: the same
 * blocker as the shared 「not duplicates」 list, waiting on the same kind of
 * migration.
 *
 * Kept on the device meanwhile, keyed by account so two people signing into
 * the same phone do not inherit each other's. The honest cost is that it does
 * not follow you to another device — which is worth saying out loud, and worth
 * less than not having the screen.
 */

export const PROFILE_COVER_STORAGE_KEY = 'trippie_profile_cover_v1';

type CoverStore = Record<string, string>;

const read = (): CoverStore => {
  try {
    const raw = localStorage.getItem(PROFILE_COVER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: CoverStore = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([userId, url]) => {
      if (typeof url === 'string' && url) next[userId] = url;
    });
    return next;
  } catch {
    return {};
  }
};

export const loadProfileCover = (userId: string | undefined): string | undefined => {
  if (!userId) return undefined;
  return read()[userId];
};

export const saveProfileCover = (userId: string | undefined, dataUrl: string): void => {
  if (!userId || !dataUrl) return;
  try {
    localStorage.setItem(PROFILE_COVER_STORAGE_KEY, JSON.stringify({ ...read(), [userId]: dataUrl }));
  } catch {
    /*
      A downscaled cover is still tens of kilobytes and localStorage is a few
      megabytes, so this is the quota talking. Losing the new cover is the
      right failure: the old one is still there and nothing else was touched.
    */
  }
};

export const clearProfileCover = (userId: string | undefined): void => {
  if (!userId) return;
  const current = read();
  if (!(userId in current)) return;
  delete current[userId];
  try {
    localStorage.setItem(PROFILE_COVER_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Nothing to do; the cover simply stays until the store is writable again.
  }
};
