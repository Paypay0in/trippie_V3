import { describe, expect, it } from 'vitest';
import { SavedTravelInspiration } from '../types';
import { countSaversForPost, saverCountsByPost } from './postSaveCounts';

const save = (id: string, user: string, post: string): SavedTravelInspiration =>
  ({ id, savedByUserId: user, sourcePostId: post, country: '韓國', city: '首爾', placeName: '廣藏市場' } as SavedTravelInspiration);

describe('post save counts', () => {
  it('counts people, not saved items', () => {
    // One reader keeping four places is one reader, not four.
    const saved = [save('1', 'ann', 'p1'), save('2', 'ann', 'p1'), save('3', 'ben', 'p1')];
    expect(countSaversForPost(saved, 'p1')).toBe(2);
  });

  it('is zero for a post nobody saved from', () => {
    expect(countSaversForPost([save('1', 'ann', 'p1')], 'p2')).toBe(0);
    expect(countSaversForPost([], 'p1')).toBe(0);
  });

  it('counts every post in one pass', () => {
    const saved = [save('1', 'ann', 'p1'), save('2', 'ben', 'p1'), save('3', 'ann', 'p2')];
    expect(saverCountsByPost(saved)).toEqual({ p1: 2, p2: 1 });
  });

  it('ignores entries with no source post or no saver', () => {
    const saved = [save('1', 'ann', ''), { ...save('2', '', 'p1') }];
    expect(saverCountsByPost(saved)).toEqual({});
  });
});
