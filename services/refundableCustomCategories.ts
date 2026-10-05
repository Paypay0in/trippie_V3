/**
 * Which of the traveller's own categories hold goods.
 *
 * 「這個符合退稅資格但沒有顯示」 — 藥局：唇膏與唇炎膏, filed under 保養美妝品, a
 * category the traveller made themselves.
 *
 * The refund rules know the built-in buckets: 購物, 伴手禮, 美妝保養 and the rest
 * hold bought objects, and Korea refunds goods. A category somebody invented is
 * opaque to that list — 保養美妝品 holds lipstick, 溫泉 and 按摩 do not hold
 * anything at all — so every custom category fell silently outside the refund
 * card, and a 569 元 purchase that qualified said nothing.
 *
 * Guessing either way is wrong. Treating every custom category as goods would
 * promise a refund on a massage; treating none as goods is what just happened.
 * So it is asked once, on the first bill filed under that category, and
 * remembered — the answer is a property of the category, not of the bill.
 */

export const REFUNDABLE_CUSTOM_CATEGORIES_STORAGE_KEY = 'trippie_refundable_custom_categories_v1';

/** What the traveller has said about their own categories, by name. */
export type CustomCategoryRefundability = Record<string, boolean>;

export const isCustomCategoryRefundable = (
  decided: CustomCategoryRefundability,
  name?: string,
): boolean => Boolean(name) && decided[name as string] === true;

/**
 * True when this category has never been answered for.
 *
 * Distinct from 「not refundable」: one is a decision and the other is a
 * question nobody has been asked yet, and only the second is worth interrupting
 * somebody about.
 */
export const customCategoryUndecided = (
  decided: CustomCategoryRefundability,
  name?: string,
): boolean => Boolean(name) && !(name as string in decided);

export const decideCustomCategory = (
  decided: CustomCategoryRefundability,
  name: string,
  refundable: boolean,
): CustomCategoryRefundability => (name.trim() ? { ...decided, [name]: refundable } : decided);

export const forgetCustomCategory = (
  decided: CustomCategoryRefundability,
  name: string,
): CustomCategoryRefundability => {
  if (!(name in decided)) return decided;
  const next = { ...decided };
  delete next[name];
  return next;
};

export const loadRefundableCustomCategories = (): CustomCategoryRefundability => {
  try {
    const raw = localStorage.getItem(REFUNDABLE_CUSTOM_CATEGORIES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    // Only real answers are kept. Anything else feeds a refund estimate, and a
    // malformed entry would read as a decision nobody made.
    const clean: CustomCategoryRefundability = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([name, value]) => {
      if (name.trim() && typeof value === 'boolean') clean[name] = value;
    });
    return clean;
  } catch {
    return {};
  }
};

export const saveRefundableCustomCategories = (value: CustomCategoryRefundability): void => {
  try {
    localStorage.setItem(REFUNDABLE_CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A full or blocked store is not worth failing a save over.
  }
};
