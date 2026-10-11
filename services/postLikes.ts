/**
 * Posts this traveller has hearted.
 *
 * 「有留言跟愛心數」.
 *
 * The heart in the feed rendered `{isLiked ? 1 : 0}` — a public-looking tally
 * that was only ever your own tap, reset by the next reload and never seen by
 * anybody else. A post somebody actually liked still read 0 to its author, and
 * a 1 beside a heart said 「one person liked this」 when it meant 「you did, for
 * now」.
 *
 * Two separate wrongs, and only one of them can be fixed today. Making the
 * mark survive a reload is local work. Counting everyone's needs a table —
 * post_likes, alongside post_comments, which is the one thing here that is
 * genuinely shared. Until that exists the heart states a fact it can stand
 * behind (「you liked this」) and states no number, because the number it had
 * was not one.
 */

export const POST_LIKES_STORAGE_KEY = 'trippie_post_likes_v1';

export const loadLikedPosts = (): string[] => {
  try {
    const raw = localStorage.getItem(POST_LIKES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
  } catch {
    return [];
  }
};

/** Returns the next list, so a caller can store it in state in one step. */
export const toggleLikedPost = (current: string[], postId: string): string[] => {
  if (!postId) return current;
  const next = current.includes(postId)
    ? current.filter(id => id !== postId)
    : [...current, postId];
  try {
    localStorage.setItem(POST_LIKES_STORAGE_KEY, JSON.stringify(next.slice(-500)));
  } catch {
    // A blocked store costs the mark on reload, which is where it started.
  }
  return next;
};

export const hasLikedPost = (liked: string[], postId: string): boolean =>
  liked.includes(postId);

/**
 * Hearts as counts, from what this device knows.
 *
 * Which is one, at most, per post — this is the reader's own mark and nobody
 * else's. It is shaped as a count because that is what the card asks for and
 * what post_likes will answer properly once it exists; until then the figure
 * is honest about being small rather than invented to look busy.
 */
export const likeCountsFromDevice = (liked: string[]): Record<string, number> =>
  Object.fromEntries(liked.map(postId => [postId, 1]));
