/**
 * 「每個收藏給個標籤🏷️景點、餐廳、等等」.
 *
 * The cards already carried Google's own category — 「義大利餐廳」, 「藝術表演場館」,
 * 「拉麵店」 — buried in a grey line beside the rating. That text is accurate and
 * useless as a tag: it is near enough one distinct value per place, so it can
 * be read but never scanned, and two ramen shops can carry two different words.
 *
 * This folds it into a handful of tags someone can sort a collection by. The
 * fold is deliberately coarse. A tag with twelve values is a second name.
 */
import { ItinerarySlice } from './itineraryImageSlices';
import { PlaceCategory } from '../types';

export type { PlaceCategory };

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  food: '餐廳',
  cafe: '咖啡',
  stay: '住宿',
  sight: '景點',
  shop: '購物',
  transport: '交通',
  other: '其他',
};

/**
 * Google's `primaryType`, which is an enum and the same in every language.
 *
 * Only the types this app actually meets. Anything unlisted falls through to
 * the text reading below rather than being forced into 「其他」 — an unmapped
 * type is a gap in this table, not a fact about the place.
 */
const BY_TYPE: Record<string, PlaceCategory> = {
  restaurant: 'food', meal_takeaway: 'food', meal_delivery: 'food',
  japanese_restaurant: 'food', korean_restaurant: 'food', chinese_restaurant: 'food',
  italian_restaurant: 'food', ramen_restaurant: 'food', sushi_restaurant: 'food',
  barbecue_restaurant: 'food', seafood_restaurant: 'food', fast_food_restaurant: 'food',
  bakery: 'cafe', cafe: 'cafe', coffee_shop: 'cafe', dessert_shop: 'cafe',
  bar: 'food', pub: 'food',
  hotel: 'stay', lodging: 'stay', guest_house: 'stay', hostel: 'stay',
  resort_hotel: 'stay', motel: 'stay', campground: 'stay',
  tourist_attraction: 'sight', museum: 'sight', art_gallery: 'sight',
  park: 'sight', national_park: 'sight', zoo: 'sight', aquarium: 'sight',
  amusement_park: 'sight', performing_arts_theater: 'sight', historical_landmark: 'sight',
  place_of_worship: 'sight', church: 'sight', hindu_temple: 'sight',
  mosque: 'sight', synagogue: 'sight', observation_deck: 'sight',
  store: 'shop', shopping_mall: 'shop', department_store: 'shop',
  clothing_store: 'shop', convenience_store: 'shop', supermarket: 'shop',
  market: 'shop', gift_shop: 'shop', book_store: 'shop',
  train_station: 'transport', subway_station: 'transport', bus_station: 'transport',
  airport: 'transport', transit_station: 'transport', light_rail_station: 'transport',
  ferry_terminal: 'transport', car_rental: 'transport',
};

/**
 * Stems, for the types the table above does not name.
 *
 * 「這不是景點嗎」 — 東京都現代美術館 came back as `art_museum`, and the table held
 * `museum` and `art_gallery` but not that. Google's type names are built out of
 * parts: `art_museum`, `ramen_restaurant`, `wholesale_market`. Listing every
 * combination is the list nobody finishes — the same trap as a country synonym
 * table — so the parts are matched instead.
 *
 * Ordered, and the order is the whole correctness argument: `coffee_shop`
 * contains 「shop」, so the café stems have to be read before the shop ones.
 */
const TYPE_STEMS: [RegExp, PlaceCategory][] = [
  [/cafe|coffee|bakery|dessert|tea_house|patisserie|ice_cream|juice/, 'cafe'],
  [/restaurant|bbq|steak|diner|eatery|food_court|bar$|_bar|pub|izakaya/, 'food'],
  [/hotel|lodging|hostel|inn$|_inn|resort|ryokan|campground/, 'stay'],
  [/museum|gallery|temple|shrine|church|mosque|synagogue|monument|landmark|attraction|theater|theatre|zoo|aquarium|garden|park|observation|castle|tower|historical/, 'sight'],
  [/store|shop|market|mall|boutique|pharmacy/, 'shop'],
  [/station|airport|terminal|transit|_rental|parking|bus_|train_|subway|ferry/, 'transport'],
];

/**
 * The localized category text, for records resolved before `primaryType` was
 * asked for. Substrings rather than whole words: Google writes 「義大利餐廳」 and
 * 「拉麵店」, never the bare word.
 */
const BY_TEXT: [RegExp, PlaceCategory][] = [
  [/咖啡|cafe|coffee|甜點|麵包|bakery|dessert/i, 'cafe'],
  [/餐廳|料理|食堂|小吃|燒肉|拉麵|居酒屋|酒吧|restaurant|bar\b|pub\b|烤肉|火鍋|壽司/i, 'food'],
  [/飯店|旅館|民宿|酒店|青年旅舍|hotel|hostel|lodging|guest ?house/i, 'stay'],
  [/車站|機場|航站|巴士|地鐵|電車|station|airport|terminal|租車/i, 'transport'],
  [/商店|百貨|購物|市場|超市|便利|免稅|store|mall|market|shop\b/i, 'shop'],
  [/景點|公園|博物館|美術|寺|神社|城|塔|展望|劇場|場館|動物園|水族|temple|shrine|museum|gallery|park/i, 'sight'],
];

/** What a screenshot slice already said this was. See `SLICE_TYPES`. */
const BY_SLICE: Record<ItinerarySlice['type'], PlaceCategory | undefined> = {
  food: 'food',
  hotel: 'stay',
  place: 'sight',
  activity: 'sight',
  transport: 'transport',
  tip: undefined,
};

/**
 * @param sliceType what the screenshot that produced this save called it, which
 *   is the traveller's own source and so outranks a lookup.
 */
export const placeCategory = (
  input: { primaryType?: string; kind?: string; sliceType?: ItinerarySlice['type'] },
): PlaceCategory => {
  const fromSlice = input.sliceType ? BY_SLICE[input.sliceType] : undefined;
  if (fromSlice) return fromSlice;

  const type = (input.primaryType || '').trim().toLowerCase();
  if (type) {
    if (BY_TYPE[type]) return BY_TYPE[type];
    const stem = TYPE_STEMS.find(([pattern]) => pattern.test(type));
    if (stem) return stem[1];
  }

  const kind = (input.kind || '').trim();
  if (kind) {
    const matched = BY_TEXT.find(([pattern]) => pattern.test(kind));
    if (matched) return matched[1];
  }
  return 'other';
};

/**
 * The tag to print, or nothing.
 *
 * 「其他」 is not printed. A tag that says 「this is a place」 beside a place name
 * costs a line and settles nothing; the blank is more honest about what is
 * known, and the grey line below still carries Google's own wording.
 */
export const placeCategoryLabel = (
  input: { primaryType?: string; kind?: string; sliceType?: ItinerarySlice['type'] },
): string => {
  const category = placeCategory(input);
  return category === 'other' ? '' : CATEGORY_LABELS[category];
};
