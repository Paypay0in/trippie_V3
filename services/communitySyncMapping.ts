import { CommunityPost, PostComment, PostSlice } from '../types';

/**
 * Translation between community objects and their rows.
 *
 * Kept apart from the network calls so the risky half — field names, defaults,
 * what a row written by an older client turns into — is plain data and can be
 * tested without a database.
 */

export interface CommunityPostRow {
  id: string;
  creator_id: string;
  author_name: string;
  author_avatar: string | null;
  title: string;
  content: string;
  country: string;
  city: string;
  cover_image: string | null;
  photos: unknown;
  status: string;
  slices: unknown;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
}

export interface PostCommentRow {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

export const toPostRow = (post: CommunityPost): CommunityPostRow => ({
  id: post.id,
  creator_id: post.creatorId,
  author_name: post.authorName || '旅人',
  author_avatar: post.authorAvatar ?? null,
  title: post.title ?? '',
  content: post.content ?? '',
  country: post.country ?? '',
  city: post.city ?? '',
  cover_image: post.coverImage ?? null,
  photos: post.photos ?? [],
  status: post.status === 'published' ? 'published' : 'draft',
  slices: post.slices ?? [],
  created_at: post.createdAt,
  updated_at: post.updatedAt ?? null,
  published_at: post.publishedAt ?? null,
});

export const fromPostRow = (row: CommunityPostRow): CommunityPost => ({
  id: row.id,
  creatorId: row.creator_id,
  authorName: row.author_name || '旅人',
  authorAvatar: row.author_avatar ?? undefined,
  title: row.title ?? '',
  content: row.content ?? '',
  country: row.country ?? '',
  city: row.city ?? '',
  coverImage: row.cover_image ?? undefined,
  // Anything that is not a list of strings is dropped rather than rendered:
  // a malformed entry would become a broken image in the middle of a post.
  photos: Array.isArray(row.photos)
    ? (row.photos as unknown[]).filter((photo): photo is string => typeof photo === 'string')
    : [],
  status: row.status === 'published' ? 'published' : 'draft',
  slices: Array.isArray(row.slices) ? (row.slices as PostSlice[]) : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  publishedAt: row.published_at ?? undefined,
});

export const toCommentRow = (comment: PostComment): PostCommentRow => ({
  id: comment.id,
  post_id: comment.postId,
  author_id: comment.authorId,
  author_name: comment.authorName || '旅人',
  author_avatar: comment.authorAvatar ?? null,
  content: comment.content,
  created_at: comment.createdAt,
});

export const fromCommentRow = (row: PostCommentRow): PostComment => ({
  id: row.id,
  postId: row.post_id,
  authorId: row.author_id,
  authorName: row.author_name || '旅人',
  authorAvatar: row.author_avatar ?? undefined,
  content: row.content ?? '',
  createdAt: row.created_at,
});

/**
 * Whether a post can go to the server at all.
 *
 * Posts written before signing in carry the anonymous device id as their
 * author, which is not an account: the row's creator_id references auth.users
 * and the insert would be refused. Pushing only what this account actually
 * wrote keeps that failure out of the sync loop.
 */
export const isPushablePost = (post: CommunityPost, authUserId?: string): boolean =>
  Boolean(authUserId) && post.creatorId === authUserId;
