/**
 * The shops a traveller would actually walk into, per market.
 *
 * 「應該之後怎麼樣來做這個搜索引擎好」. What this does today is: search the
 * whole web, guess which result is a shop, guess which number on it is the
 * price. Every defect fixed on 2026-10-23 and 24 came from one of those two
 * guesses, and the answer each time was another rule — tagCategory, ?maker=,
 * 1ページ目, の通販, よりどり, 並び順. Six rules in two days, each one correct,
 * each one another chance to refuse a real product page by accident.
 *
 * No price comparison site works this way. They know their shops.
 *
 * So the search stays open — a shop nobody listed is still allowed to answer,
 * which matters for 無印's own storefront and for every market this app has
 * not thought about — but the pages that get opened are the ones from shops
 * we recognise. That is the whole of the change: five page-opens per country
 * is a budget, and it was being spent on department-store brand indexes while
 * 松本清 sat further down the list.
 *
 * Hosts only, and only the ones a traveller to that country would name.
 */

export interface TrustedShops {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Hosts, as a pattern, so 「shop.muji.tw」 and 「muji.tw」 both count. */
  hosts: RegExp;
}

export const TRUSTED_SHOPS: TrustedShops[] = [
  {
    code: 'JP',
    hosts: /(^|\.)rakuten\.co\.jp$|(^|\.)shopping\.yahoo\.co\.jp$|matsukiyo|welcia|tsuruha|sundrug|cocokarafine|kusuri-aoki|askul\.co\.jp|lohaco|amazon\.co\.jp|donki|cosme\.net|cosme\.com|muji\.com|shiseido\.co\.jp|kao\.com|lion\.co\.jp|dhc\.co\.jp|fancl\.co\.jp|orbis\.co\.jp|yodobashi|bic-?camera|loft\.co\.jp|tokyu-hands|hands\.net|seria|daiso/i,
  },
  {
    code: 'TW',
    hosts: /momoshop|(^|\.)pchome\.com\.tw$|24h\.pchome|shopee\.tw|watsons\.com\.tw|cosmed\.com\.tw|poya|tw\.buy\.yahoo|tw\.mall\.yahoo|shop\.muji\.tw|carrefour\.com\.tw|rt-?mart|books\.com\.tw|eslite|tw\.shop\.line|dhc\.com\.tw|shiseido\.com\.tw|urcosme/i,
  },
  {
    code: 'KR',
    hosts: /coupang|oliveyoung|gmarket|11st|ssg\.com|lotteon|musinsa/i,
  },
  {
    code: 'HK',
    hosts: /hktvmall|watsons\.com\.hk|mannings|sasa\.com|parknshop/i,
  },
  {
    code: 'US',
    hosts: /amazon\.com$|walmart|target\.com|sephora|ulta|cvs\.com|walgreens|costco\.com/i,
  },
];

const BY_CODE = new Map(TRUSTED_SHOPS.map(entry => [entry.code, entry.hosts]));

/**
 * Whether this is a shop that market's travellers would name.
 *
 * False is not a verdict against the page. It only means nothing is known
 * about it, and a page nothing is known about is opened after the ones that
 * are — never instead of them, and never not at all.
 */
export const isTrustedShop = (host: string, countryCode: string): boolean => {
  const hosts = BY_CODE.get(countryCode.toUpperCase());
  return hosts ? hosts.test(host) : false;
};
