import { CommunityPost } from '../types';

export const COMMUNITY_POSTS_STORAGE_KEY = 'trippie_community_posts_v1';

const isPost = (value: unknown): value is CommunityPost => {
  if (!value || typeof value !== 'object') return false;
  const post = value as Record<string, unknown>;
  return ['id', 'creatorId', 'authorName', 'title', 'content', 'country', 'city', 'createdAt'].every(key => typeof post[key] === 'string' && Boolean(post[key]))
    && (post.status === 'draft' || post.status === 'published')
    && (post.authorAvatar === undefined || typeof post.authorAvatar === 'string')
    && (post.coverImage === undefined || typeof post.coverImage === 'string');
};

export const normalizeCommunityPost = (value: unknown): CommunityPost | null => isPost(value) ? {
  ...(value as CommunityPost),
  authorAvatar: typeof (value as CommunityPost).authorAvatar === 'string' ? (value as CommunityPost).authorAvatar : undefined,
  coverImage: typeof (value as CommunityPost).coverImage === 'string' ? (value as CommunityPost).coverImage : undefined,
  slices: Array.isArray((value as CommunityPost).slices) ? (value as CommunityPost).slices : undefined,
} : null;

export const loadCommunityPosts = (): CommunityPost[] => {
  try {
    const raw = localStorage.getItem(COMMUNITY_POSTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeCommunityPost).filter((post): post is CommunityPost => Boolean(post)) : [];
  } catch { return []; }
};

export const saveCommunityPosts = (posts: CommunityPost[]) => {
  localStorage.setItem(COMMUNITY_POSTS_STORAGE_KEY, JSON.stringify(posts));
};
