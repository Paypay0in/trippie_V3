/**
 * The two places a shopping list compares, and what each one is called.
 *
 * 「這個商品到底在日本買比較划算，還是回台灣買？」 — until now the answer was
 * wired to one pair. 台灣 was a literal inside the search query and 日本 was
 * the other literal, which is why a Taiwanese user flying to Korea got a
 * Japanese price lookup for a Korean trip.
 *
 * One row per country, holding everything that differs between them: the
 * money it prices in, the words its shops write 「price」 in, the country code
 * the search engine wants, and the hosts that belong to it.
 *
 * The host list is how a quote is placed, and it replaces a hardcoded rule
 * that dropped every mainland Chinese shop. That rule was right about the
 * symptom — 淘寶's ¥14 was printed as TWD 14 — and wrong about the reason: a
 * price is irrelevant because it is from a country this trip does not touch,
 * not because of where that country is. A traveller comparing 中國 with 加拿大
 * needs 淘寶 and would have been refused it.
 */

export interface ComparisonCountry {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  /** 「日本」 — the country as this app says it. */
  displayName: string;
  /** What its shops price in. */
  currency: string;
  /** That money as people say it: 「台幣」, 「日圓」. For 「約台幣 643」. */
  moneyName: string;
  /** What to add to a product name to find a price there. */
  priceWords: string;
  /** Hosts that are unmistakably that country's shops. */
  hosts: RegExp;
  /**
   * Whether the price reader can actually place a quote from here.
   *
   * A country with no host rules can still be chosen as a place to compare
   * against; it will simply find nothing, and the screen says 未查到可比較價格
   * rather than inventing one. Offered rather than hidden, because the pair a
   * traveller wants is not ours to refuse.
   */
  readable: boolean;
}

const country = (
  code: string,
  displayName: string,
  currency: string,
  moneyName: string,
  priceWords: string,
  hosts: RegExp,
  readable = true,
): ComparisonCountry => ({ code, displayName, currency, moneyName, priceWords, hosts, readable });

/**
 * Hosts are listed for the shops travellers from here actually use, and a
 * country's own top-level domain is always one of them.
 *
 * Every row is DATA, so each one carries a marker rather than moving into the
 * locale bundles. `priceWords` is appended to a live search query in
 * `priceFromSearch.queryFor` — 「価格 通販」 is what makes a Japanese shop page
 * come back, and an English translation finds nothing. `displayName` and
 * `moneyName` are passed as interpolation values into keys the shopping panel
 * has already migrated (`shopping.comparingWith`, `shopping.countryPrice`,
 * `shopping.setUrl`), so the sentence around them is localised while the
 * country keeps the one spelling the rest of the repo matches on; see
 * `countryIdentity.ts`. This module is also imported directly by `server.ts`,
 * so `i18n/config` must never reach it.
 */
export const COMPARISON_COUNTRIES: ComparisonCountry[] = [
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('TW', '台灣', 'TWD', '台幣', '價格 購買', /(^|\.)tw$|shopee\.tw|momoshop|pchome|cosmed|watsons\.com\.tw|books\.com\.tw|tw\.(bid|buy|mall)\.yahoo|ruten\.com/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('JP', '日本', 'JPY', '日圓', '価格 通販', /(^|\.)jp$|amazon\.co\.jp|rakuten|matsukiyo|welcia|donki|cosme\.net/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('KR', '韓國', 'KRW', '韓元', '가격 구매', /(^|\.)kr$|coupang|gmarket|oliveyoung|11st/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('HK', '香港', 'HKD', '港幣', '價錢 購買', /(^|\.)hk$|hktvmall|shampoosecret/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('CN', '中國', 'CNY', '人民幣', '价格 购买', /(^|\.)cn$|taobao|tmall|jd\.com|1688|pinduoduo|xiaohongshu|dangdang|vip\.com|suning/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('SG', '新加坡', 'SGD', '新幣', 'price buy', /(^|\.)sg$|lazada\.sg|shopee\.sg/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('US', '美國', 'USD', '美元', 'price buy', /(^|\.)us$|amazon\.com|walmart|target\.com|sephora\.com/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('GB', '英國', 'GBP', '英鎊', 'price buy', /(^|\.)uk$|amazon\.co\.uk|boots\.com|superdrug/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('AU', '澳洲', 'AUD', '澳幣', 'price buy', /(^|\.)au$|amazon\.com\.au|chemistwarehouse/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('CA', '加拿大', 'CAD', '加幣', 'price buy', /(^|\.)ca$|amazon\.ca|shoppersdrugmart/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('TH', '泰國', 'THB', '泰銖', 'ราคา ซื้อ', /(^|\.)th$|lazada\.co\.th|shopee\.co\.th/i),
  // i18n-data: priceWords is a live search query, displayName/moneyName are interpolated into already-translated keys
  country('MY', '馬來西亞', 'MYR', '馬幣', 'harga beli', /(^|\.)my$|shopee\.com\.my|lazada\.com\.my/i),
];

const BY_CODE = new Map(COMPARISON_COUNTRIES.map(entry => [entry.code, entry]));

export const comparisonCountry = (code?: string): ComparisonCountry | undefined =>
  (code ? BY_CODE.get(code.trim().toUpperCase()) : undefined);

/**
 * Which of the countries in play a host belongs to.
 *
 * Only the two being compared are considered. A quote from a third country is
 * not a worse answer to this question — it is an answer to a different one,
 * and printed beside the other two it reads as a local price.
 */
export const hostCountry = (host: string, inPlay: ComparisonCountry[]): ComparisonCountry | undefined =>
  inPlay.find(entry => entry.hosts.test(host));

/**
 * Whether any country at all claims this host.
 *
 * Separate from `hostCountry` because the two mean different things: a host
 * nobody claims may still be placed by an unmistakable currency mark, while
 * one claimed by a country that is not in play has been identified and
 * excluded, and no mark should override that.
 */
export const hostIsClaimed = (host: string): boolean =>
  COMPARISON_COUNTRIES.some(entry => entry.hosts.test(host));
