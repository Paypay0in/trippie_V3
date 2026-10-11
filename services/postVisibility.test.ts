import { describe, expect, it } from 'vitest';
import { CommunityPost } from '../types';
import { canViewPost, friendIdsFor, visiblePosts, visibilityOf } from './postVisibility';

/**
 * 「我希望可以互相加好友 可以看對方公開 或是設定好友可以看的旅行貼文」.
 *
 * This is the one part of the feature where being wrong is not a layout
 * complaint. A post marked 好友可見 appearing in a stranger's feed is a promise
 * broken in the direction that cannot be taken back — and broken quietly,
 * because everything looks right to the person who wrote it.
 *
 * So each test states the failure it prevents, not the pass it observes.
 */
const ANN = 'user-ann';
const GINA = 'user-gina';
const STRANGER = 'user-stranger';

const post = (over: Partial<CommunityPost> = {}): CommunityPost =>
  ({
    id: 'p1',
    creatorId: ANN,
    authorName: 'Ann',
    title: '首爾這幾個地方',
    content: '',
    country: '韓國',
    city: '首爾',
    status: 'published',
    createdAt: '2026-10-01',
    ...over,
  }) as CommunityPost;

describe('公開的貼文', () => {
  it('誰都看得到，包含沒登入的人', () => {
    expect(canViewPost(post(), {})).toBe(true);
    expect(canViewPost(post(), { userId: STRANGER })).toBe(true);
  });

  it('沒寫 visibility 的舊貼文算公開 —— 不能事後把人家的讀者縮掉', () => {
    expect(visibilityOf(post({ visibility: undefined }))).toBe('public');
    expect(canViewPost(post({ visibility: undefined }), { userId: STRANGER })).toBe(true);
  });
});

describe('好友可見的貼文', () => {
  const friendsOnly = post({ visibility: 'friends' });

  it('朋友看得到', () => {
    expect(canViewPost(friendsOnly, { userId: GINA, friendIds: [ANN] })).toBe(true);
  });

  /** The failure this whole file exists to prevent. */
  it('陌生人看不到', () => {
    expect(canViewPost(friendsOnly, { userId: STRANGER, friendIds: [] })).toBe(false);
  });

  it('沒登入的人看不到', () => {
    expect(canViewPost(friendsOnly, {})).toBe(false);
  });

  it('「朋友的朋友」不算朋友', () => {
    // Gina is friends with Ann; a stranger friends with Gina is not.
    expect(canViewPost(friendsOnly, { userId: STRANGER, friendIds: [GINA] })).toBe(false);
  });

  it('作者自己當然看得到', () => {
    expect(canViewPost(friendsOnly, { userId: ANN })).toBe(true);
  });
});

describe('僅自己可見（草稿）', () => {
  const mine = post({ status: 'draft' });

  it('作者看得到', () => {
    expect(canViewPost(mine, { userId: ANN })).toBe(true);
  });

  /**
   * 僅自己可見 means what it says. A draft is not a quieter kind of 好友可見,
   * and a friend must not see one even when the two settings sit side by side
   * in the same menu.
   */
  it('朋友也看不到 —— 僅自己就是僅自己', () => {
    expect(canViewPost(mine, { userId: GINA, friendIds: [ANN] })).toBe(false);
  });

  it('陌生人看不到', () => {
    expect(canViewPost(mine, { userId: STRANGER })).toBe(false);
  });
});

describe('一整份動態', () => {
  it('只留下這個人看得到的', () => {
    const feed = [
      post({ id: 'open', visibility: 'public' }),
      post({ id: 'friends', visibility: 'friends' }),
      post({ id: 'mine', status: 'draft' }),
      post({ id: 'theirs', creatorId: STRANGER, visibility: 'friends' }),
    ];

    expect(visiblePosts(feed, { userId: GINA, friendIds: [ANN] }).map(p => p.id))
      .toEqual(['open', 'friends']);
  });

  it('作者自己看得到自己的全部', () => {
    const feed = [
      post({ id: 'open' }),
      post({ id: 'friends', visibility: 'friends' }),
      post({ id: 'mine', status: 'draft' }),
    ];

    expect(visiblePosts(feed, { userId: ANN }).map(p => p.id))
      .toEqual(['open', 'friends', 'mine']);
  });
});

/**
 * A friendship is stored once, with a direction. Reading only one column is
 * the mistake that makes friendship appear to work or not depending on who
 * pressed the button.
 */
describe('誰是我的朋友', () => {
  it('我發出的、對方接受了的，算', () => {
    expect(friendIdsFor([{ requesterId: ANN, addresseeId: GINA, status: 'accepted' }], ANN))
      .toEqual([GINA]);
  });

  it('對方發出的、我接受了的，也算', () => {
    expect(friendIdsFor([{ requesterId: GINA, addresseeId: ANN, status: 'accepted' }], ANN))
      .toEqual([GINA]);
  });

  it('還沒被接受的不算', () => {
    expect(friendIdsFor([{ requesterId: ANN, addresseeId: GINA, status: 'pending' }], ANN))
      .toEqual([]);
  });

  it('跟我無關的那一列不算', () => {
    expect(friendIdsFor([{ requesterId: GINA, addresseeId: STRANGER, status: 'accepted' }], ANN))
      .toEqual([]);
  });

  it('沒登入就沒有朋友', () => {
    expect(friendIdsFor([{ requesterId: ANN, addresseeId: GINA, status: 'accepted' }], undefined))
      .toEqual([]);
  });
});
