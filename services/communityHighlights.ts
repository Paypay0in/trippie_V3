import { CommunityPost, SavedTravelInspiration } from '../types';

/**
 * What other travellers have been recommending for a destination.
 *
 * Counted, not generated: the ranking comes from posts people actually kept
 * something from, so the list can be shown before anyone asks a question and
 * without an AI call that might be wrong about which places exist.
 */

export interface CommunityHighlight {
  post: CommunityPost;
  /** Distinct people who saved something from it. */
  savers: number;
}

const matchesDestination = (
  post: CommunityPost,
  country?: string,
  destination?: string,
): boolean => {
  const place = `${post.country || ''}${post.city || ''}`;
  if (!place) return false;
  const wanted = [country, destination].filter(Boolean) as string[];
  return wanted.some(term => place.includes(term));
};

export const communityHighlights = ({
  posts,
  saved,
  country,
  destination,
  limit = 3,
}: {
  posts: CommunityPost[];
  saved: SavedTravelInspiration[];
  country?: string;
  destination?: string;
  limit?: number;
}): CommunityHighlight[] => {
  if (!country && !destination) return [];

  const saversByPost = new Map<string, Set<string>>();
  saved.forEach(item => {
    if (!item.sourcePostId || !item.savedByUserId) return;
    const people = saversByPost.get(item.sourcePostId) ?? new Set<string>();
    people.add(item.savedByUserId);
    saversByPost.set(item.sourcePostId, people);
  });

  return posts
    .filter(post => post.status === 'published' && matchesDestination(post, country, destination))
    .map(post => ({ post, savers: saversByPost.get(post.id)?.size ?? 0 }))
    // Most kept first; ties fall back to the most recently published, because
    // a year-old favourite and this week's find should not rank as equals.
    .sort((a, b) =>
      b.savers - a.savers ||
      (b.post.publishedAt || b.post.createdAt).localeCompare(a.post.publishedAt || a.post.createdAt),
    )
    .slice(0, limit);
};
