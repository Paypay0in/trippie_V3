/**
 * A city's name in the language the app speaks.
 *
 * 「語言一下 Japan 一下日本 這樣不 ok」, and the cities are worse than the
 * countries: asked in zh-TW, Google answers 「日本」 for the country and then
 * 「Tokyo」, 「Sapporo」, 「Taito City」 for everything inside it. The country was
 * fixed by `countryDisplayName`; this is the same job one level down.
 *
 * A table, and openly a partial one. Cities are not a closed set, so this
 * covers the ones this app actually sees and leaves everything else exactly as
 * it was given. The asymmetry is deliberate and the same as the country
 * table's: a missing entry can only fail to translate, never mistranslate.
 *
 * Grouping does not depend on it — `countryKey` and the stored city decide
 * that — so adding a city here changes what is read, never what is counted.
 */

const DISPLAY_NAMES: Record<string, string> = {
  // Japan
  tokyo: '東京',
  osaka: '大阪',
  kyoto: '京都',
  sapporo: '札幌',
  nagoya: '名古屋',
  fukuoka: '福岡',
  okinawa: '沖繩',
  naha: '那霸',
  hokkaido: '北海道',
  yokohama: '橫濱',
  kobe: '神戶',
  hiroshima: '廣島',
  nara: '奈良',
  hakone: '箱根',
  kanazawa: '金澤',

  /*
    Korea, in both scripts.

    Asked in zh-TW, the same route answered 「Busan」 for one place and 「부산시」
    for another — so a table holding only the romanisation leaves half of them
    reading in Korean. The suffix 시 is 「city」 and is stripped like the others.
  */
  // Korea
  seoul: '首爾',
  서울: '首爾',
  서울특별시: '首爾',
  부산: '釜山',
  부산시: '釜山',
  부산광역시: '釜山',
  제주: '濟州',
  인천: '仁川',
  대구: '大邱',
  'busan metropolitan city': '釜山',
  busan: '釜山',
  jeju: '濟州',
  incheon: '仁川',
  daegu: '大邱',
  gyeonggi: '京畿道',

  // Elsewhere this app is used
  taipei: '台北',
  'new taipei': '新北',
  taichung: '台中',
  kaohsiung: '高雄',
  tainan: '台南',
  'hong kong': '香港',
  macau: '澳門',
  singapore: '新加坡',
  bangkok: '曼谷',
  paris: '巴黎',
  london: '倫敦',
};

export const cityDisplayName = (city?: string): string => {
  const text = (city || '').trim();
  if (!text) return '';
  /*
    「Taito City」, 「Chuo Ward」 — Google's English for a ward. The suffix is
    dropped before the lookup so a ward that slips through still reads as the
    place rather than as an administrative label, and so 「Osaka」 and
    「Osaka City」 cannot become two different cities on the same screen.
  */
  const bare = text
    .replace(/\s+(City|Ward|Prefecture|-shi|-ku)$/i, '')
    // 「부산시」 and 「부산」 are one city; 「서울특별시」 is Seoul with its status.
    .replace(/(특별시|광역시|시)$/u, '')
    .trim();
  return DISPLAY_NAMES[bare.toLowerCase()] || bare;
};
