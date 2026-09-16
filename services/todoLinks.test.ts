import { describe, expect, it } from 'vitest';
import { CommunityPost } from '../types';
import { mapsSearchUrl, todoLinksFor } from './todoLinks';

const post = (id: string, title: string, country: string, city: string): CommunityPost => ({
  id,
  creatorId: 'u',
  authorName: 'A',
  title,
  content: '',
  country,
  city,
  status: 'published',
  createdAt: '2026-09-01T00:00:00.000Z',
  publishedAt: '2026-09-01T00:00:00.000Z',
});

const posts = [
  post('p1', '橫濱 Snova 滑雪場初體驗', '日本', '橫濱'),
  post('p2', '首爾廣藏市場吃什麼', '韓國', '首爾'),
];

describe('todo links', () => {
  it('builds a map search from the task and the destination', () => {
    const links = todoLinksFor({ taskName: '預約橫濱 Snova 室內滑雪場', destination: '日本', posts: [] });
    expect(links?.mapsUrl).toContain('google.com/maps/search/');
    expect(decodeURIComponent(links!.mapsUrl)).toContain('預約橫濱 Snova 室內滑雪場 日本');
  });

  it('attaches a post that shares an uncommon word with the task', () => {
    const links = todoLinksFor({ taskName: '預約橫濱 Snova 室內滑雪場', destination: '日本', posts });
    expect(links?.relatedPost?.id).toBe('p1');
  });

  it('does not attach a post merely because the country matches', () => {
    // Every Japan post mentions 日本; matching on that would staple a random
    // essay to every task.
    const links = todoLinksFor({ taskName: '確認回程班機時間', destination: '日本', posts });
    expect(links?.relatedPost).toBeUndefined();
  });

  it('ignores words that appear in every task', () => {
    const links = todoLinksFor({
      taskName: '預約行程',
      destination: '韓國',
      posts: [post('p3', '預約行程的心得', '韓國', '首爾')],
    });
    expect(links?.relatedPost).toBeUndefined();
  });

  it('has nothing to offer for an empty task', () => {
    expect(todoLinksFor({ taskName: '   ', posts })).toBeNull();
  });

  it('encodes a query safely', () => {
    expect(mapsSearchUrl('雪具 & 裝備')).toContain('%26');
  });
});
