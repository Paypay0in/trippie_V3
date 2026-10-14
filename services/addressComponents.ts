/**
 * The city an address component list names.
 *
 * 「不要以區為單位，要是城市。日本。東京 這樣」 and 「筆記我希望以國家。城市 為單位」 — and every saved note was filed under its
 * country, because the city written onto a save came from the trip's own
 * destination field. On a trip created from a boarding pass that field holds
 * what destination detection wrote, which for a Japan trip was 「日本」, so the
 * city and the country were the same word and every note in the country
 * collapsed into one card.
 *
 * Google has been sending the answer the whole time: `addressComponents` has
 * been in both place field masks for as long as they have existed, and only
 * the country was ever read out of them.
 *
 * City level, not ward level. 「台東区」 and 「渋谷区」 are how an area heading
 * should read — that is what `districtOf` is for — but a saved note belongs
 * under the city somebody says they went to, and nobody says they went to
 * 台東区.
 */

export interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/**
 * Tokyo's twenty-three special wards are municipalities in their own right, so
 * Google puts the ward in `locality` and 「Tokyo」 in the prefecture above it.
 * Everywhere else `locality` already is the city — 札幌 and 大阪 both come back
 * there, with the ward one level below in `sublocality_level_1`.
 */
const TOKYO = /^(tokyo|東京都?)$/i;

const componentOf = (components: AddressComponent[] | undefined, type: string): string | undefined =>
  components?.find(component => component.types?.includes(type))?.longText;

/**
 * The ward or district, which is what an *area heading* wants.
 *
 * 「成功載入 shibuya 那就要變成是 shibuya 區吧？」 — it had, and the heading still
 * read 「らぁ麺や 嶋 一帶」, because that heading is guessed out of the address
 * string and Google writes Japanese wards two ways: 「Taito City」 matches the
 * English rule, 「…Honmachi, Shibuya, Tokyo」 matches nothing at all.
 *
 * Read from the components instead, where it is a labelled field rather than
 * something to pattern-match out of prose. In Tokyo the ward is the locality;
 * everywhere else the ward sits one level below it, in `sublocality_level_1`.
 *
 * Separate from `cityFromComponents` on purpose: a note is filed under the
 * city somebody says they went to, and an area inside that city is named by
 * its ward. 「日本・東京」 for the note, 「Shibuya」 for the heading.
 */
export const districtFromComponents = (components?: AddressComponent[]): string | undefined => {
  const region = componentOf(components, 'administrative_area_level_1');
  if (region && TOKYO.test(region.trim())) return componentOf(components, 'locality');
  return componentOf(components, 'sublocality_level_1')
    || componentOf(components, 'sublocality');
};

export const cityFromComponents = (components?: AddressComponent[]): string | undefined => {
  const locality = componentOf(components, 'locality');
  const region = componentOf(components, 'administrative_area_level_1');

  // See `TOKYO`: there, the locality is a ward and the city is above it.
  if (region && TOKYO.test(region.trim())) return region;

  /*
    The town, then the region it sits in. A place in no town at all — a beach,
    a mountain pass — has only the region, and that is still better than
    nothing to group it under.
  */
  return locality || region || componentOf(components, 'administrative_area_level_2');
};
