/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  buildComment,
  canDeleteComment,
  commentCounts,
  commentsForPost,
  loadPostComments,
  savePostComments,
} from './postComments';

const base = { postId: 'post-1', authorId: 'user-a', authorName: 'Ann' };

describe('post comments', () => {
  it('builds a comment from what was typed', () => {
    const comment = buildComment({ ...base, content: ' 這篇很有用 ' });
    expect(comment?.content).toBe('這篇很有用');
    expect(comment?.postId).toBe('post-1');
  });

  it('refuses an empty comment rather than posting a blank line', () => {
    expect(buildComment({ ...base, content: '   ' })).toBeNull();
    expect(buildComment({ ...base, content: '' })).toBeNull();
  });

  it('caps a very long comment instead of storing it whole', () => {
    const comment = buildComment({ ...base, content: 'x'.repeat(900) });
    expect(comment?.content.length).toBe(500);
  });

  it('reads oldest first, and only for the post asked about', () => {
    const comments = [
      { id: 'c2', postId: 'post-1', authorId: 'b', authorName: 'B', content: '第二', createdAt: '2026-09-10T00:00:00.000Z' },
      { id: 'c1', postId: 'post-1', authorId: 'a', authorName: 'A', content: '第一', createdAt: '2026-09-09T00:00:00.000Z' },
      { id: 'c3', postId: 'post-2', authorId: 'c', authorName: 'C', content: '別篇', createdAt: '2026-09-11T00:00:00.000Z' },
    ];
    expect(commentsForPost(comments, 'post-1').map(c => c.content)).toEqual(['第一', '第二']);
  });

  it('lets the writer and the post author delete, and nobody else', () => {
    const comment = { id: 'c1', postId: 'post-1', authorId: 'writer', authorName: 'W', content: 'x', createdAt: '2026-09-09T00:00:00.000Z' };
    expect(canDeleteComment(comment, 'writer', 'post-owner')).toBe(true);
    expect(canDeleteComment(comment, 'post-owner', 'post-owner')).toBe(true);
    expect(canDeleteComment(comment, 'someone-else', 'post-owner')).toBe(false);
  });

  it('ignores malformed stored comments instead of rendering them', () => {
    localStorage.setItem('trippie_post_comments_v1', JSON.stringify([{ id: 'ok', postId: 'p', authorId: 'a', authorName: 'A', content: 'hi', createdAt: 'now' }, { id: 5 }, null]));
    expect(loadPostComments()).toHaveLength(1);

    localStorage.setItem('trippie_post_comments_v1', 'not json');
    expect(loadPostComments()).toEqual([]);
  });

  it('round-trips through storage', () => {
    localStorage.clear();
    const comment = buildComment({ ...base, content: '好文' })!;
    savePostComments([comment]);
    expect(loadPostComments()[0].content).toBe('好文');
  });
});

/**
 * 「有留言跟愛心數」.
 *
 * The profile was drawn without them on the reasoning that neither existed.
 * Half of that was wrong, in the direction that matters: comments are a real
 * feature with a real table, so a post card that stayed silent about them was
 * hiding something its author would want to see.
 */
describe('commentCounts', () => {
  const comment = (postId: string, id: string) => ({
    id, postId, authorId: 'u1', authorName: 'Ann', content: 'hi', createdAt: '2026-10-01',
  });

  it('counts each post\'s own comments', () => {
    expect(commentCounts([comment('p1', 'c1'), comment('p1', 'c2'), comment('p2', 'c3')]))
      .toEqual({ p1: 2, p2: 1 });
  });

  it('a post nobody replied to is simply absent, and reads as zero', () => {
    const counts = commentCounts([comment('p1', 'c1')]);
    expect(counts.p2 ?? 0).toBe(0);
  });

  it('no comments at all is not a crash', () => {
    expect(commentCounts([])).toEqual({});
  });

  it('a comment with no post is not counted against one', () => {
    expect(commentCounts([comment('', 'c1')])).toEqual({});
  });
});
