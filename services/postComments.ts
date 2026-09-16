import { PostComment } from '../types';

/**
 * Comments on a community post.
 *
 * Kept apart from the posts themselves so a comment never rewrites the post it
 * belongs to: two people typing at once would otherwise have one of them save
 * a whole post object over the other's.
 *
 * Local to this device for now, like the posts. Real conversation between
 * travellers needs the posts in shared storage first — the same step the trip
 * ledger took tonight — and this shape is what will move there.
 */

export const POST_COMMENTS_STORAGE_KEY = 'trippie_post_comments_v1';

const MAX_LENGTH = 500;

export const buildComment = ({
  postId,
  authorId,
  authorName,
  authorAvatar,
  content,
  now = new Date().toISOString(),
}: {
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  now?: string;
}): PostComment | null => {
  const text = (content || '').trim().slice(0, MAX_LENGTH);
  if (!text || !postId || !authorId) return null;
  return {
    id: `comment_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    postId,
    authorId,
    authorName: authorName || '旅人',
    authorAvatar,
    content: text,
    createdAt: now,
  };
};

/** Oldest first: a conversation reads in the order it happened. */
export const commentsForPost = (comments: PostComment[], postId: string): PostComment[] =>
  comments
    .filter(comment => comment.postId === postId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/**
 * Who may delete a comment: whoever wrote it, and the author of the post.
 * A post's author has to be able to clear something abusive off their own
 * writing without waiting for anyone.
 */
export const canDeleteComment = (
  comment: PostComment,
  viewerId: string,
  postCreatorId: string,
): boolean => viewerId === comment.authorId || viewerId === postCreatorId;

export const loadPostComments = (): PostComment[] => {
  try {
    const raw = localStorage.getItem(POST_COMMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PostComment =>
      Boolean(item) &&
      typeof item.id === 'string' &&
      typeof item.postId === 'string' &&
      typeof item.authorId === 'string' &&
      typeof item.content === 'string' &&
      typeof item.createdAt === 'string',
    );
  } catch {
    return [];
  }
};

export const savePostComments = (comments: PostComment[]) => {
  try {
    localStorage.setItem(POST_COMMENTS_STORAGE_KEY, JSON.stringify(comments));
  } catch {
    // Losing a comment to a full store must not take the post down with it.
  }
};
