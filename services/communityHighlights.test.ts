import { describe, expect, it } from 'vitest';
import { CommunityPost, SavedTravelInspiration } from '../types';
import { communityHighlights } from './communityHighlights';

const post = (
  id: string,
  country: string,
  city: string,
  publishedAt: string,
  status: CommunityPost['status'] = 'published',
): CommunityPost => ({
  id,
  creatorId: 'u',
  authorName: 'A',
  title: `${city} 的分享`,
  content: '',
  country,
  city,
  status,
  createdAt: publishedAt,
  publishedAt,
});

const save = (id: string, user: string, postId: string): SavedTravelInspiration =>
  ({ id, savedByUserId: user, sourcePostId: postId } as SavedTravelInspiration);

describe('community highlights', () => {
  const posts = [
    post('korea-1', '韓國', '首爾', '2026-09-01T00:00:00.000Z'),
    post('korea-2', '韓國', '釜山', '2026-09-05T00:00:00.000Z'),
    post('japan-1', '日本', '東京', '2026-09-06T00:00:00.000Z'),
  ];

  it('ranks a destination by how many people kept something from each post', () => {
    const saved = [save('1', 'ann', 'korea-1'), save('2', 'ben', 'korea-1'), save('3', 'ann', 'korea-2')];
    const result = communityHighlights({ posts, saved, country: '韓國' });
    expect(result.map(entry => entry.post.id)).toEqual(['korea-1', 'korea-2']);
    expect(result[0].savers).toBe(2);
  });

  it('breaks ties by recency, not by chance', () => {
    // A year-old favourite and this week's find should not rank as equals.
    const result = communityHighlights({ posts, saved: [], country: '韓國' });
    expect(result.map(entry => entry.post.id)).toEqual(['korea-2', 'korea-1']);
  });

  it('leaves out other countries and unpublished posts', () => {
    const withDraft = [...posts, post('korea-3', '韓國', '濟州', '2026-09-07T00:00:00.000Z', 'draft')];
    const ids = communityHighlights({ posts: withDraft, saved: [], country: '韓國' }).map(entry => entry.post.id);
    expect(ids).not.toContain('japan-1');
    expect(ids).not.toContain('korea-3');
  });

  it('shows nothing when the trip has no destination yet', () => {
    expect(communityHighlights({ posts, saved: [] })).toEqual([]);
  });
});
