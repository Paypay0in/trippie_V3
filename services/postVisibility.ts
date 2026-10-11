import { CommunityPost } from '../types';

/**
 * Who a post is for, and who may read it.
 *
 * 「可以看對方公開 或是設定好友可以看的旅行貼文」.
 *
 * A post has had two states, draft and published, shown as 僅自己可見 and 公開.
 * That is a switch; what is wanted is three positions — mine, my friends',
 * everyone's.
 *
 * The rule lives here, alone and tested, because it is the one piece of this
 * feature where being wrong is not a layout complaint. A post marked 好友可見
 * that appears in a stranger's feed is a promise broken in the direction that
 * cannot be taken back, and it would be broken quietly: everything would look
 * exactly right to the person who wrote it.
 *
 * So it is written to be read, not to be clever. Each branch says who it is
 * about and why, and the tests state the failure rather than the pass.
 */

export type PostVisibility = 'public' | 'friends';

/** A post's audience, treating anything unrecognised as the narrower choice. */
export const visibilityOf = (post: Pick<CommunityPost, 'visibility'>): PostVisibility =>
  post.visibility === 'friends' ? 'friends' : 'public';

export interface Viewer {
  /** The signed-in account, or undefined for a reader who is not signed in. */
  userId?: string;
  /** Accounts this viewer is mutually friends with. */
  friendIds?: string[];
}

/**
 * May this reader see this post?
 *
 * Four questions in order, and the order matters:
 *
 *   Is it even published? A draft is 僅自己可見 and belongs to nobody else,
 *   including friends — that is what the author chose it to mean.
 *
 *   Is it the author's own? Yours is always yours, published or not. Without
 *   this a draft would vanish from the screen of the person writing it.
 *
 *   Is it public? Then anyone, signed in or not.
 *
 *   Otherwise it is 好友可見, and the reader has to actually be a friend. A
 *   reader who is not signed in has no friends by definition and is refused
 *   here rather than earlier, so that the refusal has one home.
 */
export const canViewPost = (post: CommunityPost, viewer: Viewer = {}): boolean => {
  const isAuthor = Boolean(viewer.userId) && post.creatorId === viewer.userId;
  if (isAuthor) return true;

  if (post.status !== 'published') return false;
  if (visibilityOf(post) === 'public') return true;

  if (!viewer.userId) return false;
  return (viewer.friendIds || []).includes(post.creatorId);
};

/** The feed for one reader, in whatever order it arrived. */
export const visiblePosts = (posts: CommunityPost[], viewer: Viewer = {}): CommunityPost[] =>
  posts.filter(post => canViewPost(post, viewer));

/**
 * The two accepted sides of a friendship, as ids this viewer can check against.
 *
 * A friendship is stored once with a direction — who asked — so 「my friends」
 * is both the people who accepted me and the people I accepted. Reading only
 * one column is the mistake that makes friendship appear to work and then not
 * work depending on who pressed the button.
 */
export interface FriendshipRow {
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted';
}

export const friendIdsFor = (rows: FriendshipRow[], userId: string | undefined): string[] => {
  if (!userId) return [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'accepted') continue;
    if (row.requesterId === userId) ids.add(row.addresseeId);
    else if (row.addresseeId === userId) ids.add(row.requesterId);
  }
  return Array.from(ids);
};
