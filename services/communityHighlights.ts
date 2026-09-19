import { CommunityPost, SavedTravelInspiration } from '../types';

/**
 * What other travellers have been recommending for a destination.
 *
 * Counted, not generated: the ranking comes from posts people actually kept
 * something from, so the list can be shown before anyone asks a question and
 * without an AI call that might be wrong about which places exist.
 */

export interface CommunityHighlight {
  post: CommunityPost;
  /** Distinct people who saved something from it. */
  savers: number;
}

const matchesDestination = (
  post: CommunityPost,
  country?: string,
  destination?: string,
): boolean => {
  const place = `${post.country || ''}${post.city || ''}`;
  if (!place) return false;
  const wanted = [country, destination].filter(Boolean) as string[];
  return wanted.some(term => place.includes(term));
};

/** Words too common to mean two texts are about the same thing. */
const STOPWORDS = new Set([
  '想要', '可以', '推薦', '旅行', '旅遊', '行程', '這個', '那個', '一個', '什麼',
  '怎麼', '哪裡', '真的', '很多', '需要', '應該', '因為', '所以', '分享', '經驗',
]);

const topicWords = (text: string): Set<string> => {
  const cleaned = (text || '').replace(/[\s,，。、()（）「」【】:：!！?？]/g, '');
  const words = new Set<string>();
  for (const match of cleaned.matchAll(/[一-鿿]{2,}|[A-Za-z]{3,}/g)) {
    const word = match[0].toLowerCase();
    if (STOPWORDS.has(word)) continue;
    words.add(word);
    // Every 2-character window, so 滑雪場 answers a search for 滑雪.
    if (/^[一-鿿]+$/.test(word)) {
      for (let i = 0; i + 2 <= word.length; i += 1) {
        const piece = word.slice(i, i + 2);
        if (!STOPWORDS.has(piece)) words.add(piece);
      }
    }
  }
  return words;
};

/**
 * How well a post answers what the traveller asked about.
 *
 * Counted in shared uncommon words across the title, the body and the place.
 * Zero means the post is about something else — and something else is what the
 * list used to show: asking about skiing returned whoever had posted about
 * Korea most recently.
 */
const topicScore = (post: CommunityPost, wanted: Set<string>): number => {
  if (wanted.size === 0) return 0;
  const inPost = topicWords(`${post.title} ${post.content} ${post.city}`);
  let shared = 0;
  wanted.forEach(word => {
    if (inPost.has(word)) shared += 1;
  });
  return shared;
};

export const communityHighlights = ({
  posts,
  saved,
  country,
  destination,
  topic,
  limit = 3,
}: {
  posts: CommunityPost[];
  saved: SavedTravelInspiration[];
  country?: string;
  destination?: string;
  /**
   * What the traveller is asking about. When given, only posts that actually
   * concern it are shown: a question about skiing should not be answered with
   * the most-saved post about hotpot merely because both happened in Korea.
   */
  topic?: string;
  limit?: number;
}): CommunityHighlight[] => {
  if (!country && !destination) return [];
  const wanted = topicWords(topic || '');

  const saversByPost = new Map<string, Set<string>>();
  saved.forEach(item => {
    if (!item.sourcePostId || !item.savedByUserId) return;
    const people = saversByPost.get(item.sourcePostId) ?? new Set<string>();
    people.add(item.savedByUserId);
    saversByPost.set(item.sourcePostId, people);
  });

  return posts
    .filter(post => post.status === 'published' && matchesDestination(post, country, destination))
    .map(post => ({ post, savers: saversByPost.get(post.id)?.size ?? 0, relevance: topicScore(post, wanted) }))
    // With a topic, anything that does not concern it is dropped rather than
    // ranked last: a shorter honest list beats three posts about the wrong
    // thing under a heading that claims they are recommendations for it.
    .filter(entry => wanted.size === 0 || entry.relevance > 0)
    // Closest to the question first; then most kept; then the most recently
    // published, because a year-old favourite and this week's find should not
    // rank as equals.
    .sort((a, b) =>
      b.relevance - a.relevance ||
      b.savers - a.savers ||
      (b.post.publishedAt || b.post.createdAt).localeCompare(a.post.publishedAt || a.post.createdAt),
    )
    .slice(0, limit)
    .map(({ post, savers }) => ({ post, savers }));
};
