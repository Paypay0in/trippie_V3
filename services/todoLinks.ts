import { CommunityPost } from '../types';

/**
 * Somewhere to go from a to-do.
 *
 * 「預約橫濱 Snova 室內滑雪場」 is a task nobody can act on from the list it
 * sits in: the name is the answer to "where", and the reader still has to
 * retype it into a search box.
 *
 * Two links, both derived rather than invented. A map search built from the
 * task's own words always resolves to something real, because Google resolves
 * it — unlike a URL a model writes, which looks the same and 404s. And a post
 * is offered only when its title shares an uncommon word with the task, so a
 * reader is never sent to someone's essay about a different place.
 */

export interface TodoLinks {
  /** Google Maps search for the place the task names. */
  mapsUrl: string;
  /** A traveller's post about the same thing, when one clearly matches. */
  relatedPost?: CommunityPost;
}

/** Words too common to mean two texts are about the same thing. */
const STOPWORDS = new Set([
  '預約', '查詢', '確認', '準備', '購買', '申請', '安排', '租借', '服務', '日期',
  '旅行', '旅遊', '行程', '出發', '注意', '推薦', '體驗', '可以', '需要', '一日',
]);

const tokens = (text: string): string[] => {
  const cleaned = (text || '').replace(/[\s,，。、()（）「」【】:：]/g, '');
  const found: string[] = [];
  // Chinese runs of 2+ characters, plus Latin words of 3+ letters.
  for (const match of cleaned.matchAll(/[一-鿿]{2,}|[A-Za-z]{3,}/g)) {
    found.push(match[0]);
  }
  return found;
};

export const mapsSearchUrl = (query: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;

export const todoLinksFor = ({
  taskName,
  destination,
  posts,
}: {
  taskName: string;
  destination?: string;
  posts: CommunityPost[];
}): TodoLinks | null => {
  const name = (taskName || '').trim();
  if (!name) return null;

  const taskWords = tokens(name).filter(word => !STOPWORDS.has(word));

  const relatedPost = posts.find(post => {
    if (post.status !== 'published') return false;
    const postWords = new Set(tokens(`${post.title} ${post.city} ${post.country}`));
    // A shared uncommon word, not a shared country: every Japan post mentions
    // 日本, and matching on that would attach a random essay to every task.
    return taskWords.some(word => word.length >= 2 && postWords.has(word));
  });

  return {
    mapsUrl: mapsSearchUrl([name, destination].filter(Boolean).join(' ')),
    relatedPost,
  };
};
