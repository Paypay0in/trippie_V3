/**
 * What a brand is called in the country you are buying it in.
 *
 * The diagnostic put this beyond argument. 「安耐曬 防曬乳」 with the brand
 * 「ANESSA」 opened four Japanese pages and matched none, and the pages were
 * all selling it: they write 「資生堂 アネッサ」. 「曼秀雷敦 護唇膏」 found
 * 「メンソレータム メルティクリームリップ」 and refused it. In both cases the
 * one word that should have been the anchor — the brand, which is the same
 * company everywhere — was the word that did not match.
 *
 * Same shape as `productNouns` and for the same reason: a table, not a model.
 * A brand name has exactly one correct rendering per market and a model will
 * invent a plausible one. Where the table is silent nothing changes, which is
 * the ordinary case — SK-II, DHC, CANMAKE and most of a drugstore shelf write
 * themselves identically in all three markets, and those rows are not here.
 *
 * Only brands whose markets genuinely disagree.
 */

export interface BrandName {
  /** Latin, as the company writes it. The key a row most often carries. */
  en: string;
  /** 日本語, usually katakana. */
  ja?: string;
  /** 中文, as Taiwanese shops write it. */
  zh?: string;
}

export const BRAND_NAMES: BrandName[] = [
  // 藥妝・保養
  { en: 'ANESSA', ja: 'アネッサ', zh: '安耐曬' },
  { en: 'Shiseido', ja: '資生堂', zh: '資生堂' },
  { en: 'Mentholatum', ja: 'メンソレータム', zh: '曼秀雷敦' },
  { en: 'Rohto', ja: 'ロート製薬', zh: '樂敦' },
  { en: 'Kao', ja: '花王', zh: '花王' },
  { en: 'Biore', ja: 'ビオレ', zh: '蜜妮' },
  { en: 'MegRhythm', ja: 'めぐりズム', zh: '美舒律' },
  { en: 'Kose', ja: 'コーセー', zh: '高絲' },
  { en: 'Sekkisei', ja: '雪肌精', zh: '雪肌精' },
  { en: 'Hada Labo', ja: '肌研', zh: '肌研' },
  { en: 'Melano CC', ja: 'メラノCC', zh: '樂敦' },
  { en: 'Muji', ja: '無印良品', zh: '無印良品' },
  { en: 'Lion', ja: 'ライオン', zh: '獅王' },
  { en: 'Unicharm', ja: 'ユニ・チャーム', zh: '嬌聯' },
  { en: 'Kobayashi', ja: '小林製薬', zh: '小林製藥' },
  { en: 'Hisamitsu', ja: '久光製薬', zh: '久光製藥' },
  { en: 'Taisho', ja: '大正製薬', zh: '大正製藥' },
  { en: 'Eisai', ja: 'エーザイ', zh: '衛采' },
  { en: 'Santen', ja: '参天製薬', zh: '參天' },
  { en: 'Pigeon', ja: 'ピジョン', zh: '貝親' },
  { en: 'Curel', ja: 'キュレル', zh: '珂潤' },
  { en: 'Hatomugi', ja: 'ハトムギ', zh: '薏仁' },
  { en: 'Lululun', ja: 'ルルルン', zh: '露露倫' },
  { en: 'Kracie', ja: 'クラシエ', zh: '嘉娜寶' },
  { en: 'Kanebo', ja: 'カネボウ', zh: '佳麗寶' },
  { en: 'Fancl', ja: 'ファンケル', zh: '芳珂' },
  { en: 'Orbis', ja: 'オルビス', zh: '奧蜜思' },
  { en: 'Haba', ja: 'ハーバー', zh: '無添加' },
  { en: 'Attenir', ja: 'アテニア', zh: '艾天然' },
  { en: 'Elixir', ja: 'エリクシール', zh: '怡麗絲爾' },
  { en: 'Hakubi', ja: '白elixir', zh: '白肌' },

  // 彩妝
  { en: 'Canmake', ja: 'キャンメイク', zh: 'CANMAKE' },
  { en: 'Cezanne', ja: 'セザンヌ', zh: '倩麗' },
  { en: 'Excel', ja: 'エクセル', zh: 'excel' },
  { en: 'Integrate', ja: 'インテグレート', zh: '心機彩粧' },
  { en: 'Majolica Majorca', ja: 'マジョリカ マジョルカ', zh: '戀愛魔鏡' },
  { en: 'Kate', ja: 'ケイト', zh: 'KATE' },
  { en: 'Opera', ja: 'オペラ', zh: 'OPERA' },
  { en: 'Visee', ja: 'ヴィセ', zh: 'Visée' },
  { en: 'Heroine Make', ja: 'ヒロインメイク', zh: '花漾美姬' },
  { en: 'Dejavu', ja: 'デジャヴュ', zh: '戀愛魔睫' },
  { en: 'Shiro', ja: 'シロ', zh: 'SHIRO' },

  // 食品・日用
  { en: 'Meiji', ja: '明治', zh: '明治' },
  { en: 'Morinaga', ja: '森永', zh: '森永' },
  { en: 'Glico', ja: 'グリコ', zh: '格力高' },
  { en: 'Calbee', ja: 'カルビー', zh: '卡樂比' },
  { en: 'Royce', ja: 'ロイズ', zh: 'ROYCE' },
  { en: 'Shiroi Koibito', ja: '白い恋人', zh: '白色戀人' },
  { en: 'Tokyo Banana', ja: '東京ばな奈', zh: '東京芭娜娜' },
  { en: 'Nissin', ja: '日清', zh: '日清' },
  { en: 'House', ja: 'ハウス食品', zh: '好侍' },
  { en: 'Kikkoman', ja: 'キッコーマン', zh: '龜甲萬' },
  { en: 'Ajinomoto', ja: '味の素', zh: '味之素' },

  // 精品・其他
  { en: 'Chanel', ja: 'シャネル', zh: '香奈兒' },
  { en: 'Dior', ja: 'ディオール', zh: '迪奧' },
  { en: 'Jo Malone', ja: 'ジョー マローン', zh: '祖瑪瓏' },
  { en: 'Estee Lauder', ja: 'エスティ ローダー', zh: '雅詩蘭黛' },
  { en: 'Lancome', ja: 'ランコム', zh: '蘭蔻' },
  { en: 'Uniqlo', ja: 'ユニクロ', zh: 'UNIQLO' },
  { en: 'Nintendo', ja: '任天堂', zh: '任天堂' },
];

type BrandLanguage = 'en' | 'ja' | 'zh';

/** Which rendering a market writes, for the languages this table holds. */
const marketLanguage = (countryCode: string): BrandLanguage => {
  switch (countryCode.toUpperCase()) {
    case 'JP': return 'ja';
    case 'TW': case 'HK': case 'CN': return 'zh';
    default: return 'en';
  }
};

const normalise = (text: string): string =>
  (text || '').normalize('NFKC').toLowerCase().replace(/[\s・·.\-]/g, '');

/** Every spelling of one brand, in every market this table knows. */
const spellingsOf = (entry: BrandName): string[] =>
  [entry.en, entry.ja, entry.zh].filter((name): name is string => Boolean(name));

const ENTRIES = BRAND_NAMES.map(entry => ({
  entry,
  keys: spellingsOf(entry).map(normalise),
}));

/** The table row a written brand belongs to, whichever market wrote it. */
export const brandEntry = (brand?: string): BrandName | undefined => {
  const key = normalise(brand ?? '');
  if (!key) return undefined;
  return ENTRIES.find(row => row.keys.includes(key))?.entry;
};

/**
 * The brand as that country's shops write it, or undefined when the table has
 * nothing to add.
 *
 * Undefined rather than the brand unchanged, so a caller can tell 「this is
 * the Japanese for it」 from 「I had nothing to offer」 — the same distinction
 * `localisedName` draws, for the same reason.
 */
export const localisedBrand = (brand: string, countryCode: string): string | undefined => {
  const entry = brandEntry(brand);
  const written = entry?.[marketLanguage(countryCode)];
  if (!written) return undefined;
  return normalise(written) === normalise(brand) ? undefined : written;
};

/**
 * Whether two written brands are the same company.
 *
 * 「ANESSA」 and 「アネッサ」 share no character and are one brand. Without this
 * the match treats the strongest signal it has — the brand, which is the same
 * company in every market — as evidence against.
 */
export const sameBrand = (left: string, right: string): boolean => {
  const a = normalise(left);
  const b = normalise(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const row = ENTRIES.find(entry => entry.keys.includes(a));
  return row ? row.keys.includes(b) : false;
};

/** Whether a page's name mentions this brand under any of its spellings. */
export const mentionsBrand = (text: string, brand: string): boolean => {
  const page = normalise(text);
  if (!page) return false;
  const entry = brandEntry(brand);
  const spellings = entry ? spellingsOf(entry) : [brand];
  return spellings.some(spelling => {
    const key = normalise(spelling);
    return key.length >= 2 && page.includes(key);
  });
};
