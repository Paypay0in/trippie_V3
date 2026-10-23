/**
 * What a thing is called in the country you are buying it in.
 *
 * 「卸妝濕巾」 and 「クレンジングシート」 are the same box of wipes and share not
 * one character. A shopping list written in Chinese therefore cannot be priced
 * in Japan at all: the search finds nothing, and on the rare page it does find,
 * `matchProduct` correctly judges that the shop is selling something else. Both
 * stages are behaving properly. The row simply never carried the destination's
 * own word for the thing.
 *
 * So the word is supplied here, from a table rather than from a model.
 *
 * A model asked 「how do you say 卸妝濕巾 in Japanese」 answers confidently every
 * time, including when it is wrong, and a wrong answer arrives looking exactly
 * like a right one — which is the whole reason `productMatch.ts` is rules and
 * not a model. A table is finite and will miss words. That is the trade: it
 * misses visibly, and a miss is one line away from being fixed.
 *
 * Only the *noun* is translated — the category word a shop puts in its title.
 * Brands, model numbers and sizes are left exactly as written, because those
 * are the same in every country and are what makes a match certain.
 */

export type NounLanguage = 'zh' | 'ja' | 'ko' | 'en';

export interface ProductNoun {
  /** A stable name for the thing itself, independent of any language. */
  id: string;
  /** Spellings, preferred one first. That first one is what a query asks for. */
  zh: string[];
  ja: string[];
  ko?: string[];
  en?: string[];
}

/**
 * Which language a country's shops write their listings in.
 *
 * Not a general fact about the country — 香港 writes both — but about what its
 * product titles say, which is the only thing being matched here.
 */
export const languageOf = (countryCode: string): NounLanguage => {
  switch (countryCode.toUpperCase()) {
    case 'TW': case 'HK': case 'CN': return 'zh';
    case 'JP': return 'ja';
    case 'KR': return 'ko';
    default: return 'en';
  }
};

/**
 * The shelves a traveller actually buys from: 藥妝, 食品, 日用品.
 *
 * Deliberately category nouns and not products. 「資生堂」 needs no translating
 * and 「SK-II 青春露」 is already found; what is missing is the ordinary word
 * that tells a Japanese shop which shelf to look on.
 */
export const PRODUCT_NOUNS: ProductNoun[] = [
  // 臉部保養
  { id: 'face-mask', zh: ['面膜'], ja: ['フェイスマスク', 'シートマスク', 'パック'], ko: ['마스크팩'], en: ['face mask', 'sheet mask'] },
  { id: 'cleansing-sheet', zh: ['卸妝濕巾', '卸妝棉片'], ja: ['クレンジングシート', 'メイク落としシート'], ko: ['클렌징 티슈'], en: ['cleansing sheet'] },
  { id: 'cleansing-oil', zh: ['卸妝油'], ja: ['クレンジングオイル'], ko: ['클렌징 오일'], en: ['cleansing oil'] },
  { id: 'cleansing-water', zh: ['卸妝水'], ja: ['クレンジングウォーター'], en: ['micellar water'] },
  { id: 'face-wash', zh: ['洗面乳', '洗顏乳', '洗面皂'], ja: ['洗顔フォーム', '洗顔料'], ko: ['클렌징 폼'], en: ['face wash'] },
  { id: 'toner', zh: ['化妝水'], ja: ['化粧水'], ko: ['스킨', '토너'], en: ['toner'] },
  { id: 'emulsion', zh: ['乳液'], ja: ['乳液'], ko: ['로션'], en: ['emulsion'] },
  { id: 'serum', zh: ['精華液', '美容液'], ja: ['美容液'], ko: ['에센스', '세럼'], en: ['serum'] },
  { id: 'face-cream', zh: ['面霜', '乳霜'], ja: ['フェイスクリーム'], ko: ['크림'], en: ['face cream'] },
  { id: 'sunscreen', zh: ['防曬乳', '防曬霜', '防曬乳液'], ja: ['日焼け止め'], ko: ['선크림'], en: ['sunscreen'] },
  { id: 'eye-cream', zh: ['眼霜'], ja: ['アイクリーム'], en: ['eye cream'] },

  // 彩妝
  { id: 'lip-balm', zh: ['護唇膏'], ja: ['リップクリーム'], ko: ['립밤'], en: ['lip balm'] },
  { id: 'lipstick', zh: ['口紅', '唇膏'], ja: ['口紅', 'リップスティック'], ko: ['립스틱'], en: ['lipstick'] },
  { id: 'lip-oil', zh: ['唇油', '潤唇精華油'], ja: ['リップオイル'], en: ['lip oil'] },
  { id: 'blush', zh: ['腮紅'], ja: ['チーク'], ko: ['블러셔'], en: ['blush'] },
  { id: 'foundation', zh: ['粉底液', '粉底'], ja: ['ファンデーション'], ko: ['파운데이션'], en: ['foundation'] },
  { id: 'concealer', zh: ['遮瑕膏', '遮瑕'], ja: ['コンシーラー'], en: ['concealer'] },
  { id: 'makeup-primer', zh: ['妝前乳'], ja: ['化粧下地'], en: ['makeup primer'] },
  { id: 'loose-powder', zh: ['蜜粉', '定妝粉'], ja: ['フェイスパウダー'], en: ['face powder'] },
  { id: 'eyeliner', zh: ['眼線筆', '眼線液'], ja: ['アイライナー'], en: ['eyeliner'] },
  { id: 'mascara', zh: ['睫毛膏'], ja: ['マスカラ'], ko: ['마스카라'], en: ['mascara'] },
  { id: 'eyeshadow', zh: ['眼影'], ja: ['アイシャドウ'], en: ['eyeshadow'] },
  { id: 'eyebrow-pencil', zh: ['眉筆'], ja: ['アイブロウ'], en: ['eyebrow pencil'] },

  // 身體・頭髮
  { id: 'hand-cream', zh: ['護手霜'], ja: ['ハンドクリーム'], ko: ['핸드크림'], en: ['hand cream'] },
  { id: 'body-lotion', zh: ['身體乳', '身體乳液'], ja: ['ボディクリーム', 'ボディローション'], en: ['body lotion'] },
  { id: 'body-wash', zh: ['沐浴乳'], ja: ['ボディソープ'], ko: ['바디워시'], en: ['body wash'] },
  { id: 'shampoo', zh: ['洗髮精', '洗髮乳'], ja: ['シャンプー'], ko: ['샴푸'], en: ['shampoo'] },
  { id: 'conditioner', zh: ['潤髮乳', '護髮素'], ja: ['コンディショナー', 'トリートメント'], ko: ['린스'], en: ['conditioner'] },
  { id: 'hair-oil', zh: ['護髮油'], ja: ['ヘアオイル'], en: ['hair oil'] },
  { id: 'deodorant', zh: ['止汗劑', '體香劑'], ja: ['制汗剤', 'デオドラント'], en: ['deodorant'] },
  { id: 'toothpaste', zh: ['牙膏'], ja: ['歯磨き粉'], ko: ['치약'], en: ['toothpaste'] },
  { id: 'toothbrush', zh: ['牙刷'], ja: ['歯ブラシ'], en: ['toothbrush'] },
  { id: 'mouthwash', zh: ['漱口水'], ja: ['マウスウォッシュ'], en: ['mouthwash'] },
  { id: 'cotton-pad', zh: ['化妝棉'], ja: ['コットン'], en: ['cotton pad'] },
  { id: 'cotton-swab', zh: ['棉花棒'], ja: ['綿棒'], en: ['cotton swab'] },
  { id: 'nail-clipper', zh: ['指甲剪'], ja: ['爪切り'], en: ['nail clipper'] },
  { id: 'razor', zh: ['刮鬍刀'], ja: ['カミソリ', 'シェーバー'], en: ['razor'] },

  // 藥品・保健
  { id: 'eye-drops', zh: ['眼藥水'], ja: ['目薬'], ko: ['안약'], en: ['eye drops'] },
  { id: 'painkiller', zh: ['止痛藥'], ja: ['鎮痛剤', '痛み止め'], en: ['painkiller'] },
  { id: 'cold-medicine', zh: ['感冒藥'], ja: ['風邪薬'], en: ['cold medicine'] },
  { id: 'stomach-medicine', zh: ['腸胃藥', '胃藥'], ja: ['胃腸薬'], en: ['stomach medicine'] },
  { id: 'pain-patch', zh: ['痠痛貼布', '酸痛貼布'], ja: ['湿布'], en: ['pain relief patch'] },
  { id: 'bandage', zh: ['繃帶'], ja: ['絆創膏'], en: ['bandage'] },
  { id: 'hot-eye-mask', zh: ['蒸氣眼罩'], ja: ['ホットアイマスク'], en: ['steam eye mask'] },
  { id: 'face-covering', zh: ['口罩'], ja: ['マスク'], ko: ['마스크'], en: ['face mask'] },
  { id: 'supplement', zh: ['保健食品', '營養補充品'], ja: ['サプリメント'], en: ['supplement'] },
  { id: 'vitamin', zh: ['維他命', '維生素'], ja: ['ビタミン'], en: ['vitamin'] },
  { id: 'collagen', zh: ['膠原蛋白'], ja: ['コラーゲン'], en: ['collagen'] },
  { id: 'insect-repellent', zh: ['防蚊液'], ja: ['虫除け'], en: ['insect repellent'] },
  { id: 'motion-sickness', zh: ['暈車藥'], ja: ['酔い止め'], en: ['motion sickness pill'] },

  // 食品
  { id: 'chocolate', zh: ['巧克力'], ja: ['チョコレート'], ko: ['초콜릿'], en: ['chocolate'] },
  { id: 'biscuit', zh: ['餅乾'], ja: ['ビスケット', 'クッキー'], en: ['biscuit', 'cookie'] },
  { id: 'candy', zh: ['糖果'], ja: ['キャンディ'], en: ['candy'] },
  { id: 'gummy', zh: ['軟糖'], ja: ['グミ'], en: ['gummy'] },
  { id: 'instant-noodle', zh: ['泡麵', '速食麵'], ja: ['カップ麺', 'インスタントラーメン'], ko: ['라면'], en: ['instant noodle'] },
  { id: 'curry', zh: ['咖哩'], ja: ['カレー'], en: ['curry'] },
  { id: 'green-tea', zh: ['綠茶'], ja: ['緑茶'], en: ['green tea'] },
  { id: 'matcha', zh: ['抹茶'], ja: ['抹茶'], en: ['matcha'] },
  { id: 'coffee', zh: ['咖啡'], ja: ['コーヒー'], en: ['coffee'] },
  { id: 'soy-sauce', zh: ['醬油'], ja: ['醤油'], en: ['soy sauce'] },
  { id: 'seasoning', zh: ['調味料'], ja: ['調味料'], en: ['seasoning'] },
  { id: 'rice-topping', zh: ['香鬆'], ja: ['ふりかけ'], en: ['rice seasoning'] },
  { id: 'snack', zh: ['零食'], ja: ['お菓子', 'スナック'], en: ['snack'] },

  // 日用品
  { id: 'laundry-detergent', zh: ['洗衣精', '洗衣粉'], ja: ['洗濯洗剤'], en: ['laundry detergent'] },
  { id: 'fabric-softener', zh: ['柔軟精'], ja: ['柔軟剤'], en: ['fabric softener'] },
  { id: 'wet-wipes', zh: ['濕紙巾'], ja: ['ウェットティッシュ'], en: ['wet wipes'] },
  { id: 'tissue', zh: ['面紙', '衛生紙'], ja: ['ティッシュ'], en: ['tissue'] },
  { id: 'towel', zh: ['毛巾'], ja: ['タオル'], en: ['towel'] },
  { id: 'socks', zh: ['襪子'], ja: ['靴下'], en: ['socks'] },
  { id: 'water-bottle', zh: ['保溫瓶'], ja: ['水筒'], en: ['water bottle'] },
  { id: 'earphones', zh: ['耳機'], ja: ['イヤホン'], en: ['earphones'] },
  { id: 'charger', zh: ['充電器'], ja: ['充電器'], en: ['charger'] },
  { id: 'ballpoint-pen', zh: ['原子筆'], ja: ['ボールペン'], en: ['ballpoint pen'] },
  { id: 'notebook', zh: ['筆記本'], ja: ['ノート'], en: ['notebook'] },
];

const LANGUAGES: NonNullable<NounLanguage>[] = ['zh', 'ja', 'ko', 'en'];

/**
 * Every spelling in the table, longest first.
 *
 * Longest first is what keeps 「マスク」 (口罩) from eating the end of
 * 「ホットアイマスク」, and 「クリーム」 from eating 「ハンドクリーム」. The longer
 * word is the more specific one, every time.
 *
 * Anything under two characters is dropped. A one-character noun — 傘, 飴 —
 * turns up inside unrelated names often enough that having it would cost more
 * than not having it.
 */
const SPELLINGS: { text: string; noun: ProductNoun }[] = PRODUCT_NOUNS
  .flatMap(noun => LANGUAGES.flatMap(language => (noun[language] ?? []).map(text => ({ text, noun }))))
  .filter(entry => entry.text.length >= 2)
  .sort((left, right) => right.text.length - left.text.length);

/** A name split into the things this table recognises and everything else. */
export interface SplitName {
  /** `ProductNoun.id` for each noun found, in the order found. */
  concepts: string[];
  /** What was left after taking those words out. Brands, models, sizes. */
  rest: string;
}

/**
 * Finds the category nouns in a name and sets them apart from the rest.
 *
 * Both halves matter to the caller. The concepts are what let a Chinese name
 * and a Japanese one be compared at all; the rest is what decides whether two
 * products that share a concept are actually the same one.
 */
export const splitNouns = (text: string): SplitName => {
  const concepts: string[] = [];
  let rest = (text || '').normalize('NFKC');

  for (const { text: spelling, noun } of SPELLINGS) {
    if (concepts.includes(noun.id)) continue;
    const at = rest.toLowerCase().indexOf(spelling.toLowerCase());
    if (at === -1) continue;
    concepts.push(noun.id);
    rest = `${rest.slice(0, at)} ${rest.slice(at + spelling.length)}`;
  }

  return { concepts, rest: rest.replace(/\s+/g, ' ').trim() };
};

const BY_ID = new Map(PRODUCT_NOUNS.map(noun => [noun.id, noun]));

/**
 * The same name with its category nouns written the way that country writes
 * them, or `null` when nothing in it was recognised.
 *
 * `null` rather than the name unchanged, so a caller can tell 「this is the
 * Japanese for it」 from 「I had nothing to offer」 and not spend a search on
 * the second. 「Muji 卸妝濕巾 12片裝」 for Japan becomes
 * 「Muji クレンジングシート 12片裝」 — the brand and the size untouched,
 * because those are what make the match certain.
 */
export const localisedName = (name: string, language: NounLanguage): string | null => {
  const { concepts } = splitNouns(name);
  if (concepts.length === 0) return null;

  let written = (name || '').normalize('NFKC');
  let changed = false;

  for (const id of concepts) {
    const noun = BY_ID.get(id);
    const preferred = noun?.[language]?.[0];
    if (!noun || !preferred) continue;

    /*
      A name already written in the destination's language is left exactly as
      it is, even where the table lists another spelling first.

      This was a real regression and a plain one. 「潤唇精華油」 is listed under
      `lip-oil` beside 「唇油」, and asking for the Chinese of a Chinese name
      rewrote the row's own words into the table's shorter ones — 台灣's query
      became 「SHIRO 唇油」 and stopped finding the product it had been finding
      for days. Translating is for crossing a language. Within one, the
      traveller's own words are better than ours: they came off the package.
    */
    const inTarget = (noun[language] ?? []).filter(spelling => spelling.length >= 2);
    if (inTarget.some(spelling => written.toLowerCase().includes(spelling.toLowerCase()))) continue;

    // The spelling actually present, longest first for the same reason as above.
    const present = LANGUAGES
      .flatMap(other => noun[other] ?? [])
      .filter(spelling => spelling.length >= 2)
      .sort((left, right) => right.length - left.length)
      .find(spelling => written.toLowerCase().includes(spelling.toLowerCase()));
    if (!present || present === preferred) continue;

    const at = written.toLowerCase().indexOf(present.toLowerCase());
    written = `${written.slice(0, at)}${preferred}${written.slice(at + present.length)}`;
    changed = true;
  }

  return changed ? written.replace(/\s+/g, ' ').trim() : null;
};
