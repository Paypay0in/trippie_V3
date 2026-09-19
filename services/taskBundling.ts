import { ShoppingItem } from '../types';

/**
 * Which to-dos are one job.
 *
 * 「查詢滑雪裝備租借」「預約 Snova Yokohama」「確認 Snow Town Yeti 開場日期」
 * are three checklist lines and one errand: whoever makes the first phone call
 * is already the right person for the other two. Sending them separately asks
 * three people to learn the same context.
 *
 * Grouping is computed, not generated. Two tasks join when they share an
 * uncommon word — a place, a venue, an activity. Belonging to the same trip is
 * not a reason: 東京餐廳預約 and 大阪遺失行李處理 have nothing to do with each
 * other, and a bundle that says otherwise wastes the helper's time and the
 * traveller's money.
 *
 * A model may later propose a nicer title, but this file is what runs when the
 * model is unavailable — which it was on the night this was written.
 */

export interface TaskBundleProposal {
  id: string;
  suggestedTitle: string;
  taskIds: string[];
  reason?: string;
}

/** Words shared by tasks that have nothing else in common. */
const STOPWORDS = new Set([
  '預約', '查詢', '確認', '準備', '購買', '申請', '安排', '租借', '服務', '協助',
  '旅行', '旅遊', '行程', '出發', '注意', '推薦', '體驗', '可以', '需要', '時間',
  '資訊', '日期', '全套', '成人',
]);

const tokens = (text: string): Set<string> => {
  const cleaned = (text || '').replace(/[\s,，。、()（）「」【】:：]/g, '');
  const found = new Set<string>();
  for (const match of cleaned.matchAll(/[一-鿿]{2,}|[A-Za-z]{3,}/g)) {
    const word = match[0].toLowerCase();
    if (STOPWORDS.has(word)) continue;
    found.add(word);
    // Every 2-character window, so 滑雪場 meets 滑雪裝備.
    if (/^[一-鿿]+$/.test(word)) {
      for (let i = 0; i + 2 <= word.length; i += 1) {
        const piece = word.slice(i, i + 2);
        if (!STOPWORDS.has(piece)) found.add(piece);
      }
    }
  }
  return found;
};

const shareAWord = (a: Set<string>, b: Set<string>): string | null => {
  for (const word of a) if (b.has(word)) return word;
  return null;
};

/**
 * The shared word, preferring the longest — 滑雪場 says more than 滑雪 about
 * what the helper is being asked to do.
 */
const commonWord = (groups: Set<string>[]): string | null => {
  const [first, ...rest] = groups;
  if (!first) return null;
  const shared = [...first].filter(word => rest.every(other => other.has(word)));
  return shared.sort((a, b) => b.length - a.length)[0] ?? null;
};

export const proposeTaskBundles = (
  tasks: ShoppingItem[],
  destination?: string,
): TaskBundleProposal[] => {
  const entries = tasks.map(task => ({ task, words: tokens(task.name) }));
  // Place names are dropped: everything on a Japan trip says 日本, and bundling
  // on that would make the whole checklist one job.
  const placeWords = tokens(destination || '');
  entries.forEach(entry => placeWords.forEach(word => entry.words.delete(word)));

  const groups: (typeof entries)[] = [];
  entries.forEach(entry => {
    const home = groups.find(group => group.some(member => shareAWord(member.words, entry.words)));
    if (home) home.push(entry);
    else groups.push([entry]);
  });

  return groups
    .filter(group => group.length > 1)
    .map((group, index) => {
      const theme = commonWord(group.map(member => member.words));
      return {
        id: `bundle-${index + 1}`,
        suggestedTitle: theme ? `${theme}協助` : '行前協助',
        taskIds: group.map(member => member.task.id),
        reason: theme ? `這 ${group.length} 項都跟「${theme}」有關，可以交給同一個人處理。` : undefined,
      };
    });
};

/**
 * A proposal is only usable if every task it names still exists.
 *
 * The same check runs over a model's answer, where it matters more: a bundle
 * that references an invented id would publish a request with a blank line in
 * it, and the helper would have no way to know what was meant.
 */
export const keepProposalsWithKnownTasks = (
  proposals: TaskBundleProposal[],
  tasks: ShoppingItem[],
): TaskBundleProposal[] => {
  const known = new Set(tasks.map(task => task.id));
  return proposals
    .map(proposal => ({ ...proposal, taskIds: proposal.taskIds.filter(id => known.has(id)) }))
    .filter(proposal => proposal.taskIds.length > 1);
};
