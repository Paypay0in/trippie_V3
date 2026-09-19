/**
 * Prices asserted in prose, where the price hierarchy could not see them.
 *
 * The canon is enforced on the `budget` field: no verified figure, no number,
 * the card says 價格需確認. Nothing enforced it on the sentences around the
 * card. So a screen appeared with two plans both saying 價格需確認 and an
 * opening line reading 「2000台幣預算⋯明顯不足，建議預算提高至約 4500 台幣」.
 *
 * A traveller does not distinguish a number in a field from a number in a
 * sentence. They budget against whichever they read, and 4,500 was a figure
 * the model produced from memory — which is exactly what the hierarchy exists
 * to keep off the screen. The canon also says where this has to be stopped:
 * on the server, not in the prompt.
 *
 * Sentences go, not just the digits. 「建議預算提高至約 ___ 台幣」 with a hole
 * in it is worse than silence: it still tells the reader their budget is
 * wrong, and now it looks broken as well.
 */

/** A currency named next to a number, in the forms these three languages use. */
const CURRENCY_WORDS = [
  '台幣', '新台幣', '日圓', '日元', '美金', '美元', '韓元', '韓圜', '歐元', '人民幣', '港幣',
  'NTD', 'TWD', 'JPY', 'USD', 'KRW', 'EUR', 'CNY', 'HKD',
];

const AMOUNT = String.raw`\d[\d,.]*\s*[萬万千]?`;
const SYMBOL_FIRST = String.raw`(?:NT\$|US\$|HK\$|[$¥￥€₩])\s*${AMOUNT}`;
const WORD_AFTER = String.raw`${AMOUNT}\s*(?:${CURRENCY_WORDS.join('|')})`;
const WORD_BEFORE = String.raw`(?:${CURRENCY_WORDS.join('|')})\s*${AMOUNT}`;
// 「兩天一夜」 is not money and 「2000 元」 is, so a bare number is never enough:
// a currency has to be named or symbolised beside it.
const UNIT_AFTER = String.raw`${AMOUNT}\s*[元円塊]`;

const PRICE_CLAIM = new RegExp(
  `(?:${SYMBOL_FIRST}|${WORD_AFTER}|${WORD_BEFORE}|${UNIT_AFTER})`,
  'i',
);

export const statesAPrice = (text: string): boolean => PRICE_CLAIM.test(text);

/**
 * Splits on sentence endings, keeping them attached.
 *
 * Chinese text often runs several sentences together with no space, so the
 * terminator is the only boundary available. A list separated by 、 is one
 * sentence and must not be broken apart.
 */
const sentences = (text: string): string[] =>
  text.split(/(?<=[。！？!?\n])/).filter(part => part.length > 0);

/**
 * The text with any sentence asserting a price removed.
 *
 * Call only when the price is unverified. When research did find a figure,
 * the prose is free to discuss it — that is the whole point of having looked.
 */
export const stripPriceClaims = (text?: string): string | undefined => {
  if (!text) return text;
  const kept = sentences(text).filter(sentence => !statesAPrice(sentence));
  const result = kept.join('').trim();
  return result || undefined;
};
