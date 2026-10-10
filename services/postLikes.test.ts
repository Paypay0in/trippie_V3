/**
 * @vitest-environment jsdom
 *
 * 「有留言跟愛心數」.
 *
 * The heart rendered `{isLiked ? 1 : 0}` — a public-looking tally that was only
 * ever your own tap, gone on the next reload. Two wrongs in one control, and
 * only the first is fixable without a table: the mark can survive, the count
 * cannot be invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  POST_LIKES_STORAGE_KEY,
  hasLikedPost,
  loadLikedPosts,
  toggleLikedPost,
} from './postLikes';

beforeEach(() => localStorage.clear());

describe('愛心', () => {
  it('按下去就記住', () => {
    const next = toggleLikedPost([], 'p1');
    expect(hasLikedPost(next, 'p1')).toBe(true);
  });

  it('再按一次就取消', () => {
    expect(toggleLikedPost(toggleLikedPost([], 'p1'), 'p1')).toEqual([]);
  });

  it('重新整理後還在 —— 這是它原本做不到的事', () => {
    toggleLikedPost([], 'p1');
    expect(loadLikedPosts()).toEqual(['p1']);
  });

  it('只影響按下去的那一篇', () => {
    const next = toggleLikedPost(toggleLikedPost([], 'p1'), 'p2');
    expect(next).toEqual(['p1', 'p2']);
    expect(hasLikedPost(toggleLikedPost(next, 'p1'), 'p2')).toBe(true);
  });

  it('空的 id 不會變成一筆', () => {
    expect(toggleLikedPost([], '')).toEqual([]);
  });

  it('存壞掉的資料不會讓整個 feed 爆掉', () => {
    localStorage.setItem(POST_LIKES_STORAGE_KEY, 'not json');
    expect(loadLikedPosts()).toEqual([]);
  });
});
