/**
 * Whether two spellings mean the same country.
 *
 * 「那這個問題點也可以限制在用戶成立旅冊」. The backfill asked Google where each
 * saved place was and wrote back what it answered — 「Japan」 — beside records
 * that had been saying 「日本」 all along. The home screen then showed 「日本 5
 * 則」 and 「Japan・Taito City 1 則」 as two different places to have been.
 *
 * Which spelling is *correct* is not a question with an answer: 日本 and Japan
 * are both right, and the traveller's own trip already uses one of them. So
 * nothing is translated. Records are compared on identity and displayed in
 * whatever the trip already said.
 *
 * Deliberately a hand-written table, not a library. It covers the countries
 * this app is actually used in, and a country missing from it simply compares
 * by its own text — which is exactly the behaviour before this existed, so a
 * gap here can only fail to merge, never merge two countries wrongly.
 */

const SYNONYMS: string[][] = [
  ['jp', 'japan', '日本', '日本国', 'にほん', 'にっぽん'],
  ['kr', 'korea', 'south korea', 'republic of korea', '韓國', '韓国', '南韓', '대한민국', '한국'],
  ['tw', 'taiwan', '台灣', '臺灣', '台湾', 'chinese taipei'],
  ['hk', 'hong kong', '香港'],
  ['mo', 'macau', 'macao', '澳門', '澳门'],
  ['sg', 'singapore', '新加坡'],
  ['th', 'thailand', '泰國', '泰国'],
  ['vn', 'vietnam', 'viet nam', '越南'],
  ['my', 'malaysia', '馬來西亞', '马来西亚'],
  ['ph', 'philippines', '菲律賓', '菲律宾'],
  ['id', 'indonesia', '印尼', '印度尼西亞'],
  ['cn', 'china', '中國', '中国'],
  ['us', 'usa', 'united states', 'united states of america', '美國', '美国'],
  ['gb', 'uk', 'united kingdom', '英國', '英国'],
  ['au', 'australia', '澳洲', '澳大利亞'],
  ['fr', 'france', '法國', '法国'],
  ['it', 'italy', '義大利', '意大利'],
  ['es', 'spain', '西班牙'],
  ['de', 'germany', '德國', '德国'],
];

const KEYS = new Map<string, string>();
SYNONYMS.forEach(group => group.forEach(name => KEYS.set(name, group[0])));

/**
 * One key per country, whatever it was written as.
 *
 * An unknown country keys on its own normalised text, so two records spelling
 * it identically still group together.
 */
export const countryKey = (country?: string): string => {
  const text = (country || '').trim().toLowerCase();
  if (!text) return '';
  return KEYS.get(text) || text;
};

/**
 * What to show the reader, in the language the app speaks.
 *
 * 「語言一下 Japan 一下日本 這樣不 ok」 — and both were honestly produced: Google
 * answers 「日本」 under zh-TW, while the hand-written airport directory stores
 * 「Japan」 because its airport names are English. Two sources, two languages,
 * the same screen.
 *
 * Normalising on the way *in* would mean rewriting records and picking a
 * winner between two correct answers. Normalising on the way *out* costs
 * nothing and fixes every source at once, including whatever a traveller
 * typed themselves.
 *
 * A country the table does not hold is shown exactly as it was stored — the
 * app has no better name for it than the one it was given.
 */
const DISPLAY_NAMES: Record<string, string> = {
  jp: '日本',
  kr: '韓國',
  tw: '台灣',
  hk: '香港',
  mo: '澳門',
  sg: '新加坡',
  th: '泰國',
  vn: '越南',
  my: '馬來西亞',
  ph: '菲律賓',
  id: '印尼',
  cn: '中國',
  us: '美國',
  gb: '英國',
  au: '澳洲',
  fr: '法國',
  it: '義大利',
  es: '西班牙',
  de: '德國',
};

export const countryDisplayName = (country?: string): string => {
  const text = (country || '').trim();
  if (!text) return '';
  return DISPLAY_NAMES[countryKey(text)] || text;
};

export const sameCountry = (left?: string, right?: string): boolean => {
  const a = countryKey(left);
  const b = countryKey(right);
  return Boolean(a) && a === b;
};

/**
 * The spelling to keep when a lookup answers in another language.
 *
 * The one already on the record wins whenever both mean the same country —
 * it is what the rest of the traveller's trip is written in. A genuinely
 * different country means the record was wrong, and the lookup is the better
 * evidence.
 */
export const preferredCountryName = (existing?: string, found?: string): string | undefined => {
  if (!found?.trim()) return existing;
  if (!existing?.trim()) return found;
  return sameCountry(existing, found) ? existing : found;
};
