import { Category } from '../types';
import { CustomCategoryRefundability, isCustomCategoryRefundable } from './refundableCustomCategories';

/**
 * The categories a tax refund can apply to.
 *
 * 「還是有好幾筆沒有出現在這上面」. 給écho的杯子, 涼草幸運草 and the rest were
 * missing from the refund card entirely, and the reason was the filter: it
 * counted 購物 and nothing else. The app offers six buckets a bought thing can
 * land in — 伴手禮、美妝保養、3C家電、服飾鞋包、飾品配件 — and a traveller files a
 * cup as a souvenir, not as 「shopping」.
 *
 * Korea refunds goods. Which drawer the app put them in is the app's business,
 * not the counter's, so every bucket that holds a bought object counts.
 *
 * 其他 is deliberately out. It is where a tip, a fee or a service ends up as
 * often as a thing, and a refund prompt on those is a wrong answer rather than
 * a missing one — the traveller can move a purchase into a real category, and
 * now has 不可退稅 for the reverse.
 */
export const REFUNDABLE_CATEGORIES: ReadonlySet<Category> = new Set([
  Category.SHOPPING,
  Category.SOUVENIR,
  Category.COSMETICS,
  Category.ELECTRONICS,
  Category.FASHION,
  Category.ACCESSORIES,
  // Goods bought for somebody else are still goods, and the receipt is still
  // in the hand of whoever carries it to the counter.
  Category.HELP_BUY,
]);

/**
 * Whether a category holds the kind of thing a counter refunds.
 *
 * The built-in buckets are known. A category the traveller invented is not —
 * 保養美妝品 holds lipstick and 溫泉 holds nothing at all — so it counts only
 * once they have said so. 「這個符合退稅資格但沒有顯示」 was every custom category
 * falling silently outside the refund card.
 */
export const isRefundableCategory = (
  category?: Category,
  customDecisions: CustomCategoryRefundability = {},
): boolean => {
  if (!category) return false;
  if (REFUNDABLE_CATEGORIES.has(category)) return true;
  return isCustomCategoryRefundable(customDecisions, String(category));
};
