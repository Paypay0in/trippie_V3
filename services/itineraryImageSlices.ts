import { ItineraryItem, PostSliceType } from '../types';

/**
 * Travel plans arriving as a screenshot.
 *
 * 「這邊加一個可以上傳截圖的區塊。讓他讀取截圖中的旅行資訊，切片之後讓用戶可以加入
 * 行程」. Trips are planned in other people's apps — an Instagram save, a blog
 * post, a friend's list in a chat — and the work of getting them into Trippie
 * is retyping, which is the reason it does not happen.
 *
 * A screenshot is cut into the same slices the community posts already use, so
 * a saved Instagram carousel and a saved post produce the same kind of thing:
 * a named place with the practical notes that came with it.
 *
 * What a screenshot cannot give is identity. A picture of the words 「甘川洞
 * 文化村」 is not a Google place, so nothing here invents a placeId, an address
 * or coordinates — the itinerary resolves those the same way it does for any
 * typed-in place, or leaves the card unlinked and says so.
 */

export const SLICE_TYPES: PostSliceType[] = ['place', 'food', 'hotel', 'activity', 'transport', 'tip'];

export interface ItinerarySliceNote {
  text: string;
}

export interface ItinerarySlice {
  /** Stable within one parse, so selection survives a re-render. */
  id: string;
  type: PostSliceType;
  /** What to show on the card. */
  title: string;
  /** The place as it was written, when the screenshot named one. */
  placeName?: string;
  summary?: string;
  /** Only when the screenshot actually states one. */
  suggestedStartTime?: string;
  durationMinutes?: number;
  notes: ItinerarySliceNote[];
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/*
  「解析結果應該條列重點」.

  Asked for notes, the model returned an essay: 單골손님 came back as four hundred
  characters of 「推薦…值得…深受好評…推薦」, the same sentence rephrased until it ran
  out of room. Nobody reads that standing outside a restaurant, and it is not
  what a screenshot of a recommendation contains.

  The prompt now asks for short bullets, but a prompt is a request. These are the
  limits, applied to whatever comes back.
*/
/** A summary says what the place is. One line, not an introduction. */
const MAX_SUMMARY_CHARS = 40;
/** One point per note. */
const MAX_NOTE_CHARS = 40;
/** Past this the list stops being scannable, which was the whole point. */
const MAX_NOTES = 6;

/** Marketing with no content behind it. A note made only of these says nothing. */
const EMPTY_PRAISE = /^[\s。，、！!,.]*((很|超|超級|非常|真的|蠻|滿|挺|頗|極|相當|十分|值得)*(推薦|好吃|美味|好玩|不錯|讚|棒|優秀|必去|必吃|好評)|深受(食客|遊客|大家)?好評|口碑(很)?好|人氣(很)?高|CP值(很)?高)[\s。，、！!,.]*$/;

/*
  Simplified and traditional are the same word.

  His screenshots come from mainland and Taiwanese accounts in the same upload,
  so one place gets 「推荐菜品：五花肉」 and 「强推五花肉」 — which every rule below
  read as two unrelated sentences because the characters differ. Only the
  characters that actually turn up in travel notes are mapped; this is a lookup
  for comparison, never for display.
*/
const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  荐: '薦', 营: '營', 业: '業', 时: '時', 间: '間', 预: '預', 约: '約', 议: '議',
  钟: '鐘', 价: '價', 费: '費', 买: '買', 卖: '賣', 点: '點', 热: '熱', 门: '門',
  餐: '餐', 厅: '廳', 馆: '館', 临: '臨', 边: '邊', 这: '這', 个: '個', 们: '們',
  后: '後', 发: '發', 现: '現', 欢: '歡', 迎: '迎', 还: '還', 过: '過', 内: '內',
  车: '車', 铁: '鐵', 机: '機', 场: '場', 市: '市', 园: '園', 园区: '園區',
  观: '觀', 风: '風', 气: '氣', 鲜: '鮮', 面: '麵', 鱼: '魚', 鸡: '雞', 猪: '豬',
  虾: '蝦', 汤: '湯', 饭: '飯', 号: '號', 队: '隊', 带: '帶', 钱: '錢', 币: '幣',
  证: '證', 医: '醫', 药: '藥', 产: '產', 质: '質', 丽: '麗', 丰: '豐', 举: '舉',
  双: '雙', 东: '東', 两: '兩', 为: '為', 处: '處', 务: '務', 单: '單', 卫: '衛',
  厕: '廁', 开: '開', 关: '關', 够: '夠', 术: '術', 艺: '藝', 听: '聽', 读: '讀',
  试: '試', 验: '驗', 杂: '雜', 货: '貨', 热门: '熱門', 强: '強', 书: '書',
  学: '學', 国: '國', 园林: '園林', 丛: '叢', 乐: '樂', 习: '習', 乡: '鄉',
  专: '專', 业界: '業界', 临时: '臨時', 众: '眾', 优: '優', 传: '傳', 体: '體',
  俩: '倆', 储: '儲', 儿: '兒', 党: '黨', 兴: '興', 军: '軍', 农: '農', 冲: '沖',
  决: '決', 况: '況', 减: '減', 凤: '鳳', 划: '劃', 则: '則', 刚: '剛', 创: '創',
  别: '別', 动: '動', 务实: '務實', 劳: '勞', 势: '勢', 区: '區', 医院: '醫院',
  历: '歷', 压: '壓', 厂: '廠', 县: '縣', 参: '參', 双人: '雙人', 变: '變',
  叶: '葉', 吗: '嗎', 吨: '噸', 听说: '聽說', 启: '啟', 响: '響', 园艺: '園藝',
};

/** One text, in one script, for comparison only. */
const unifyScript = (value: string): string =>
  Array.from(value).map(char => SIMPLIFIED_TO_TRADITIONAL[char] || char).join('');

/** Collapses whitespace and script so two notes differing only in those count as one. */
export const noteKey = (value: string): string =>
  unifyScript(value.replace(/[\s。，、,.!！：:（）()「」\-–—~～]/g, '')).toLocaleLowerCase();

/**
 * How short a note may be and still absorb a longer one that contains it.
 *
 * 「資訊會重複紀錄」. One parse returned 「營業時間：12:00 - 23:00（15:00 - 17:00 为
 * 休息准备时间）」 and then 「營業時間 12:00-23:00」 — the same fact, written twice,
 * so exact-match dedupe kept both and the list read as if the shop had two
 * opening hours.
 *
 * Containment catches that; the floor stops it from going too far. Without one,
 * a two-character note would swallow every note it appeared inside.
 */
const MIN_CONTAINED_CHARS = 6;

/**
 * Whether a note already on the list says what a new one is about to say.
 *
 * True for the same text written differently, and for a shorter note wholly
 * contained in a longer one — 「營業時間 12:00-23:00」 inside a line that already
 * gave the hours and the break.
 */
/**
 * Whether every character of the shorter appears, in order, inside the longer.
 *
 * 「15:00-17:00 为休息时间」 sits inside 「營業時間：12:00-23:00（15:00-17:00 为休息
 * 准备时间）」 with 「准备」 wedged into the middle, so plain containment could not
 * see it and the shop appeared to have two different closing arrangements. A
 * rewording that inserts a word is still the same sentence.
 */
const isSubsequence = (short: string, long: string): boolean => {
  let index = 0;
  for (const char of long) {
    if (char === short[index]) index += 1;
    if (index === short.length) return true;
  }
  return index === short.length;
};

export const noteIsCovered = (existing: string, candidate: string): boolean => {
  const have = noteKey(existing);
  const incoming = noteKey(candidate);
  if (!incoming) return true;
  if (have === incoming) return true;
  if (incoming.length < MIN_CONTAINED_CHARS || incoming.length >= have.length) return false;
  return have.includes(incoming) || isSubsequence(incoming, have);
};

/*
  A place with nothing to say about it gets described three times.

  「這三句語意相同，不能這樣列，要換成一句」. Peak square came back as 「海邊景觀咖啡
  店」, 「海邊咖啡店」 and 「有看海景觀位」 — one fact, three sentences. None contains
  another as a string, so containment could not see it, and the prompt already
  forbids it: a model with little to report pads, and padding is what a limit in
  code is for.

  What these three have in common is that none of them tells the reader to do
  anything. A note that carries an instruction, an hour, a price or a quantity
  is a fact worth keeping even when it overlaps another; a note that only says
  what the place is, is a second description, and a place needs one.
*/

/** Marks a note as something to act on rather than a description of the place. */
const ACTIONABLE = /[0-9０-９]|必點|必吃|必去|推薦|強推|建議|記得|預約|排隊|排號|公休|營業|休息|注意|禁止|限|不可|要|需|可以|免費|分鐘|小時|元|價|票|訂|帶|穿/;

/**
 * Which of the two things a note is.
 *
 * Only notes of the same kind can restate each other. 「必點海鮮麵」 and 「海鮮麵
 * 餐廳」 share every topic word and are not the same sentence: one says what to
 * order, the other says what the place is. Two recommendations of the same
 * dish, on the other hand, are one recommendation written twice.
 */
const noteKind = (text: string): 'action' | 'description' =>
  (ACTIONABLE.test(noteKey(text)) ? 'action' : 'description');

/** Distinct CJK characters, which is as close to "what it is about" as this gets. */
const topicChars = (text: string): Set<string> =>
  new Set(Array.from(noteKey(text)).filter(char => /[一-鿿]/.test(char)));

/** Two shared topic characters, below which the overlap is a coincidence. */
const MIN_SHARED_TOPIC_CHARS = 2;

/**
 * How much a note may add and still count as a restatement.
 *
 * 「有看海景觀位」 adds 有/看/位 to 「海邊景觀咖啡店」 — three characters that carry
 * no fact the reader did not have. 「章魚蝦仁五花肉三拼加方便麵」 adds eleven to
 * 「辣炒章魚餐廳」, and those eleven are what to order. Overlap alone cannot tell
 * those apart; how much is new can.
 */
const MAX_NEW_TOPIC_CHARS = 3;

/**
 * Characters that are enthusiasm rather than information.
 *
 * 「巨巨好吃的烤肉，强推五花肉」 adds six characters to 「推荐菜品：五花肉」 and five of
 * them are the writer being pleased. Counting those as new content is how one
 * recommendation of 五花肉 stayed on the list as two.
 */
const PRAISE_CHARS = new Set(Array.from('好吃讚棒巨超級强強推必愛美味香爆紅人氣讚嘆值得真的很非常超讚不錯優秀'));

/** Digits, which are the one thing two notes must never be assumed to share. */
const digitsOf = (text: string): string => (noteKey(text).match(/[0-9０-９]+/g) || []).join(',');

/**
 * Whether a note says what another note already said.
 *
 * Only ever true between notes of the same kind: 「必點海鮮麵」 and 「海鮮麵餐廳」
 * share every word and are not the same sentence — one is what to order, the
 * other is what the place is. Two recommendations of 五花肉 are.
 *
 * Enthusiasm does not count as new content, and different numbers always do:
 * two notes carrying different figures are two facts however alike they read.
 */
export const noteRestatesDescription = (existing: string, candidate: string): boolean => {
  if (noteKind(existing) !== noteKind(candidate)) return false;

  const haveDigits = digitsOf(existing);
  const incomingDigits = digitsOf(candidate);
  if (haveDigits && incomingDigits && haveDigits !== incomingDigits) return false;

  const have = topicChars(existing);
  let shared = 0;
  let added = 0;
  topicChars(candidate).forEach(char => {
    if (have.has(char)) shared += 1;
    else if (!PRAISE_CHARS.has(char)) added += 1;
  });
  return shared >= MIN_SHARED_TOPIC_CHARS && added <= MAX_NEW_TOPIC_CHARS;
};

/**
 * Drops notes that only restate a longer one.
 *
 * Longest first, so the fuller sentence is the one kept: it is the one that
 * carries the detail the shorter version left out.
 */
export const dedupeNoteTexts = (texts: string[]): string[] => {
  /*
    Order is the model's, and it is kept: it leads with what it thinks matters.

    So the same fact written twice resolves to whichever came first, not
    whichever is longer — between 「晚上七點後要排隊」 and 「晚上七點後要排隊。」 the
    trailing character is not information.
  */
  const seen = new Set<string>();
  const unique = texts
    .map(text => text.trim())
    .filter(text => {
      const key = noteKey(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // A note wholly inside another is the shorter telling of it, and goes.
  const distinct = unique.filter(text => !unique.some(other =>
    other !== text && noteIsCovered(other, text) && noteKey(other) !== noteKey(text)));

  /*
    Then at most one description of what the place is.

    Resolved against what has already been kept, in order, so the first
    description survives and the restatements fall away — rather than two
    descriptions each removing the other and the place losing both.
  */
  const kept: string[] = [];
  distinct.forEach(text => {
    if (kept.some(saved => noteRestatesDescription(saved, text))) return;
    kept.push(text);
  });
  return kept;
};

/**
 * A note the traveller can act on, cut to one point.
 *
 * Long prose is truncated at the first sentence break rather than mid-word: a
 * model that ignored the length limit usually packed several points into one
 * string, and the first is the one it led with.
 */
const toNote = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_NOTE_CHARS) return trimmed;
  const firstSentence = trimmed.split(/[。！？\n]/)[0].trim();
  const kept = firstSentence.length > 0 && firstSentence.length <= MAX_NOTE_CHARS
    ? firstSentence
    : trimmed.slice(0, MAX_NOTE_CHARS);
  return `${kept}…`;
};

const toSummary = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (EMPTY_PRAISE.test(trimmed)) return undefined;
  if (trimmed.length <= MAX_SUMMARY_CHARS) return trimmed;
  const firstSentence = trimmed.split(/[。！？\n]/)[0].trim();
  return firstSentence.length > 0 && firstSentence.length <= MAX_SUMMARY_CHARS
    ? firstSentence
    : `${trimmed.slice(0, MAX_SUMMARY_CHARS)}…`;
};

/**
 * Turns whatever the model returned into slices that can be shown.
 *
 * A slice with no title is nothing to add, and a type outside the six the app
 * knows has nowhere to render — both are dropped rather than guessed at.
 */
export const normalizeItinerarySlices = (raw: unknown): ItinerarySlice[] => {
  const slices = raw && typeof raw === 'object' && Array.isArray((raw as { slices?: unknown }).slices)
    ? (raw as { slices: unknown[] }).slices
    : [];

  const seen = new Set<string>();

  return slices.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const slice = entry as Record<string, unknown>;
    const title = text(slice.title);
    const type = text(slice.type) as PostSliceType;
    if (!title || !SLICE_TYPES.includes(type)) return [];

    // One screenshot often repeats a place in its caption and its tags.
    const key = `${type}:${title.toLocaleLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const startTime = text(slice.suggestedStartTime);
    const duration = typeof slice.durationMinutes === 'number' && Number.isFinite(slice.durationMinutes) && slice.durationMinutes > 0
      ? Math.min(Math.round(slice.durationMinutes), 24 * 60)
      : undefined;

    return [{
      id: `shot-${index}-${key}`,
      type,
      title,
      placeName: text(slice.placeName) || undefined,
      summary: toSummary(text(slice.summary)),
      suggestedStartTime: CLOCK.test(startTime) ? startTime : undefined,
      durationMinutes: duration,
      notes: Array.isArray(slice.notes)
        ? dedupeNoteTexts(
            (slice.notes as unknown[])
              .map(note => toNote(text((note as Record<string, unknown>)?.text)))
              .filter(note => Boolean(note) && !EMPTY_PRAISE.test(note)),
          )
            .slice(0, MAX_NOTES)
            .map(text => ({ text }))
        : [],
    }];
  });
};

/** Which kind of itinerary card a slice becomes. */
const ITEM_TYPE: Record<PostSliceType, ItineraryItem['type']> = {
  place: 'ACTIVITY',
  food: 'FOOD',
  hotel: 'HOTEL',
  activity: 'ACTIVITY',
  transport: 'TRANSPORT',
  tip: 'ACTIVITY',
};

/**
 * A chosen slice, as an itinerary card.
 *
 * Undated unless the traveller picked a day, and untimed unless the screenshot
 * stated a time: a card that lands on an invented hour has to be corrected,
 * which is more work than placing it was.
 *
 * `origin` is deliberately left unset — the two values it has mean Saved
 * Inspiration and AI suggestion, and this is neither. A picture of a place
 * confers no provenance; the traveller picked this card, so it is theirs.
 */
export const sliceToItineraryItem = (
  slice: ItinerarySlice,
  makeId: () => string,
  date?: string,
): ItineraryItem => {
  /*
    The notes travel as notes, not as a paragraph.

    「透析完筆記，要根據各推薦抓重點，之後建立行程時也要顯示筆記」. The card has a
    旅行筆記 section that lists them one per line and collapses past the third;
    flattening them into the free-text field instead meant the one thing worth
    reading in a shop — 要排隊、幾點公休、必點什麼 — arrived as a wall.

    `sourceInspirationIds` carries the screenshot marker because the persistence
    layer drops notes from an item with no linkage at all: 「沒有來源就不是收藏
    地點，筆記跟著走」. A screenshot is a source, so it says so rather than
    letting a reload quietly eat what it read.
  */
  const source = `screenshot:${slice.id}`;
  const notes = slice.notes.map(note => ({
    id: makeId(),
    sourceNoteId: `${source}:${note.text.slice(0, 24)}`,
    sourceSliceId: source,
    sourcePostId: source,
    sourceCreatorId: source,
    type: 'other' as const,
    text: note.text,
  }));

  return {
    id: makeId(),
    type: ITEM_TYPE[slice.type],
    title: slice.title,
    location: slice.placeName || slice.title,
    // The summary stays in the free-text field; the practical points go to the
    // notes list, which is where somebody standing outside the shop looks.
    notes: slice.summary || '',
    date,
    time: slice.suggestedStartTime || '',
    ...(slice.durationMinutes ? { durationMinutes: slice.durationMinutes } : {}),
    ...(notes.length > 0 ? { savedTravelNotes: notes, sourceInspirationIds: [source] } : {}),
    isCompleted: false,
  };
};
