import { SavedTravelInspiration } from '../types';

/**
 * How many people saved something from a post.
 *
 * Counted by distinct person, not by item: someone who keeps four places from
 * one post is one reader who found it useful, and counting the items instead
 * would tell an author their post reached four people when it reached one.
 */
export const countSaversForPost = (
  saved: SavedTravelInspiration[],
  postId: string,
): number =>
  new Set(
    saved
      .filter(item => item.sourcePostId === postId && item.savedByUserId)
      .map(item => item.savedByUserId),
  ).size;

/** Saves per post id, for listing several posts at once. */
export const saverCountsByPost = (
  saved: SavedTravelInspiration[],
): Record<string, number> => {
  const byPost = new Map<string, Set<string>>();
  saved.forEach(item => {
    if (!item.sourcePostId || !item.savedByUserId) return;
    const people = byPost.get(item.sourcePostId) ?? new Set<string>();
    people.add(item.savedByUserId);
    byPost.set(item.sourcePostId, people);
  });
  return Object.fromEntries([...byPost].map(([postId, people]) => [postId, people.size]));
};
