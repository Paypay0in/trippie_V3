/**
 * Reading a destination out of a trip's name.
 *
 * People name a trip 「韓國釜山之旅」 and reasonably expect the app to know
 * where they are going; until now the destination stayed empty until it was
 * typed a second time somewhere else, and the entry-rules screen sat blank.
 *
 * Deliberately a small, explicit table rather than a gazetteer or a model call.
 * A wrong guess here silently drives tax rules and visa lookups for the wrong
 * country, so the rule is: recognise the handful of places this app's users
 * actually go, and say nothing at all about the rest. Suggestions never
 * overwrite a destination someone has already set.
 */

export interface DetectedDestination {
  country: string;
  /** Present only when the name mentions a city this table knows. */
  city?: string;
}

/** Country first, then the aliases that should resolve to it. */
const COUNTRY_ALIASES: Array<[string, string[]]> = [
  ['日本', ['日本', 'japan', 'jp']],
  ['韓國', ['韓國', '韩国', '南韓', 'korea', 'south korea', 'kr']],
  ['泰國', ['泰國', '泰国', 'thailand', 'th']],
  ['越南', ['越南', 'vietnam', 'vn']],
  ['新加坡', ['新加坡', 'singapore', 'sg']],
  ['馬來西亞', ['馬來西亞', '马来西亚', 'malaysia', 'my']],
  ['菲律賓', ['菲律賓', '菲律宾', 'philippines', 'ph']],
  ['印尼', ['印尼', 'indonesia', 'id']],
  ['香港', ['香港', 'hong kong', 'hk']],
  ['澳門', ['澳門', '澳门', 'macau', 'macao']],
  ['中國', ['中國', '中国', 'china']],
  ['美國', ['美國', '美国', 'usa', 'united states']],
  ['加拿大', ['加拿大', 'canada']],
  ['英國', ['英國', '英国', 'uk', 'united kingdom', 'britain']],
  ['法國', ['法國', '法国', 'france']],
  ['德國', ['德國', '德国', 'germany']],
  ['義大利', ['義大利', '意大利', 'italy']],
  ['西班牙', ['西班牙', 'spain']],
  ['澳洲', ['澳洲', '澳大利亞', 'australia']],
  ['紐西蘭', ['紐西蘭', '新西兰', 'new zealand']],
];

/** City first, then its country and the aliases that should resolve to it. */
const CITY_ALIASES: Array<[string, string, string[]]> = [
  ['東京', '日本', ['東京', '东京', 'tokyo']],
  ['大阪', '日本', ['大阪', 'osaka']],
  ['京都', '日本', ['京都', 'kyoto']],
  ['北海道', '日本', ['北海道', '札幌', 'hokkaido', 'sapporo']],
  ['沖繩', '日本', ['沖繩', '冲绳', 'okinawa']],
  ['福岡', '日本', ['福岡', '福冈', 'fukuoka']],
  ['名古屋', '日本', ['名古屋', 'nagoya']],
  ['首爾', '韓國', ['首爾', '首尔', 'seoul']],
  ['釜山', '韓國', ['釜山', 'busan', 'pusan']],
  ['濟州', '韓國', ['濟州', '济州', 'jeju']],
  ['曼谷', '泰國', ['曼谷', 'bangkok']],
  ['清邁', '泰國', ['清邁', '清迈', 'chiang mai']],
  ['峴港', '越南', ['峴港', '岘港', 'da nang', 'danang']],
  ['河內', '越南', ['河內', '河内', 'hanoi']],
  ['巴黎', '法國', ['巴黎', 'paris']],
  ['倫敦', '英國', ['倫敦', '伦敦', 'london']],
  ['羅馬', '義大利', ['羅馬', '罗马', 'rome']],
  ['紐約', '美國', ['紐約', '纽约', 'new york']],
  ['洛杉磯', '美國', ['洛杉磯', '洛杉矶', 'los angeles']],
  ['雪梨', '澳洲', ['雪梨', '悉尼', 'sydney']],
];

const mentions = (haystack: string, alias: string) => haystack.includes(alias);

/**
 * The destination a trip name points at, or null when it points at nothing
 * this table recognises. A city match also yields its country; a name that
 * mentions only a country yields the country alone.
 */
export const detectDestinationFromTripName = (
  name: string,
): DetectedDestination | null => {
  const haystack = (name || '').trim().toLocaleLowerCase();
  if (!haystack) return null;

  for (const [city, country, aliases] of CITY_ALIASES) {
    if (aliases.some(alias => mentions(haystack, alias.toLocaleLowerCase()))) {
      return { country, city };
    }
  }

  for (const [country, aliases] of COUNTRY_ALIASES) {
    if (aliases.some(alias => mentions(haystack, alias.toLocaleLowerCase()))) {
      return { country };
    }
  }

  return null;
};

/** What the destination field should read: the city when known, else the country. */
export const destinationLabel = (detected: DetectedDestination): string =>
  detected.city ?? detected.country;
