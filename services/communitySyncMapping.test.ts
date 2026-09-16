import { describe, expect, it } from 'vitest';
import { CommunityPost, PostComment } from '../types';
import {
  CommunityPostRow,
  fromCommentRow,
  fromPostRow,
  isPushablePost,
  toCommentRow,
  toPostRow,
} from './communitySyncMapping';

const post: CommunityPost = {
  id: 'post-1',
  creatorId: '11111111-1111-1111-1111-111111111111',
  authorName: 'Ann',
  title: '首爾這幾個地方我下次還會再去',
  content: '第一次去首爾最意外的是聖水洞。',
  country: '韓國',
  city: '首爾',
  coverImage: 'data:image/jpeg;base64,aaa',
  photos: ['data:image/jpeg;base64,aaa', 'data:image/jpeg;base64,bbb'],
  status: 'published',
  createdAt: '2026-09-09T00:00:00.000Z',
  publishedAt: '2026-09-09T00:00:00.000Z',
};

describe('community post mapping', () => {
  it('survives a round trip without losing a field', () => {
    const restored = fromPostRow(toPostRow(post));
    expect(restored).toEqual({ ...post, authorAvatar: undefined, updatedAt: undefined, slices: [] });
  });

  it('keeps every photo in order', () => {
    expect(fromPostRow(toPostRow(post)).photos).toEqual(post.photos);
  });

  it('drops malformed photos rather than rendering broken images', () => {
    const row = { ...toPostRow(post), photos: ['ok', 5, null, { a: 1 }] } as unknown as CommunityPostRow;
    expect(fromPostRow(row).photos).toEqual(['ok']);
  });

  it('treats an unknown status as not published', () => {
    // Failing closed: a post whose state cannot be read must not be public.
    const row = { ...toPostRow(post), status: 'weird' } as CommunityPostRow;
    expect(fromPostRow(row).status).toBe('draft');
  });

  it('only pushes posts this account actually wrote', () => {
    // Posts written before signing in carry the device id, which is not an
    // account, and the insert would be refused.
    expect(isPushablePost(post, post.creatorId)).toBe(true);
    expect(isPushablePost(post, 'someone-else')).toBe(false);
    expect(isPushablePost({ ...post, creatorId: 'anon-device' }, post.creatorId)).toBe(false);
    expect(isPushablePost(post, undefined)).toBe(false);
  });
});

describe('comment mapping', () => {
  it('round-trips a comment', () => {
    const comment: PostComment = {
      id: 'c1',
      postId: 'post-1',
      authorId: '22222222-2222-2222-2222-222222222222',
      authorName: 'Ben',
      content: '這篇很有用',
      createdAt: '2026-09-10T00:00:00.000Z',
    };
    expect(fromCommentRow(toCommentRow(comment))).toEqual({ ...comment, authorAvatar: undefined });
  });
});
