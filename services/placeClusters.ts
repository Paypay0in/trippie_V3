/**
 * Saved places, grouped by how close together they are.
 *
 * 「能不能夠讓收藏的景點被分區顯示 … 將地址相近的直接分配到同一個顏色區塊」. A list
 * of twenty restaurants in alphabetical order hides the one fact that decides a
 * day: four of them are within walking distance of each other on 廣安里 beach,
 * two are out at 海雲台, one is in 機張 forty minutes away. A day built by
 * picking down the list crosses the city three times.
 *
 * Grouped by distance rather than by the district written in the address,
 * because distance is the thing that costs an afternoon — two places either
 * side of a district boundary are still a five-minute walk apart. The district
 * name is then read back out of the addresses to label the group, since a
 * traveller says 「廣安里那天」, not 「the 1.8km cluster」.
 */

export interface ClusterablePlace {
  id: string;
  placeName: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  /**
   * The ward, as Google labelled it rather than as the address spells it.
   *
   * 「成功載入 shibuya 那就要變成是 shibuya 區吧？」 — Google writes Japanese wards
   * two ways, 「Taito City」 and a bare 「Shibuya」 inside the address line, and
   * only the first can be pattern-matched out of prose. A saved place that has
   * been looked up already knows the answer; this is that answer.
   */
  district?: string;
}

export interface PlaceCluster<T extends ClusterablePlace = ClusterablePlace> {
  id: string;
  /** What to call this area, read out of the addresses in it. */
  label: string;
  /** Index into the caller's palette; stable for as long as the grouping is. */
  colorIndex: number;
  places: T[];
  center?: { latitude: number; longitude: number };
}

/**
 * How far apart two places can be and still belong to the same outing.
 *
 * 廣安里 to 海雲台 is about 6km — a different day, not a different stop. Two
 * ends of one beach are under two. 2.5km is a walk at the top end and a short
 * taxi beyond it, which is the line a day is actually planned on.
 */
export const SAME_AREA_RADIUS_KM = 2.5;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const distanceKm = (
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number => {
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

const hasCoordinates = <T extends ClusterablePlace>(place: T): place is T & { latitude: number; longitude: number } =>
  Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
  && !(place.latitude === 0 && place.longitude === 0);

/*
  The district, as the address happens to write it.

  Google answers in whatever language the request asked for and the data has,
  so one trip's addresses arrive as 「Suyeong-gu」, 「Haeundae」, 「中區」 and
  「영도구」 at the same time. All four forms are read, and none is translated:
  the name on the card should be the name on the map the traveller will open.

  「你在做分區的時候你要去抓取這個旅冊的國家地點 不然會有誤」 — and the Founder is
  right: run every country's conventions against every address and the first
  pattern to match wins, whether or not it belongs to the country the trip is
  in. 「-shi」 is Japanese and 「-si」 Korean; 區 is used in Taiwan and Korea and
  区 in Japan; 「○○ City」 is how Google writes a Japanese ward in English and
  also how it writes an ordinary city anywhere else.

  So the trip's country selects the list. An unknown country still tries
  everything, because a wrong label is better than no label — but a known one
  never has to guess.
*/

/** Suffix included: a label reading 「Suyeong」 or 「Taito」 is not a word. */
const JAPAN_PATTERNS: RegExp[] = [
  // 「Taito City」, 「Shibuya City」 — how Google writes a ward in English.
  /\b([A-Z][a-zA-Z]+ City)\b/,
  /\b([A-Z][a-zA-Z]+-(?:ku|cho|machi|shi))\b/,
  /*
    The prefecture it sits in is not part of its name. Excluded from the
    captured characters rather than trimmed afterwards: a four-character window
    ending at 区 reaches back through 「東京都」 and comes out as 「京都渋谷区」,
    and 「京都」 is a real city, so no suffix trim can tell the two apart.

    区 and 區 are different characters, U+533A and U+5340. Only the traditional
    one was ever here, so every Japanese address matched nothing at all.
  */
  /([^都道府県市区郡町村\s\d]{1,4}[区郡町村])/,
  /([^都道府県\s\d]{1,4}市)/,
];

const KOREA_PATTERNS: RegExp[] = [
  /\b([A-Z][a-zA-Z]+-(?:gu|gun|eup|si|dong))\b/,
  /([가-힣]{1,4}[구군읍])/,
  /*
    District before city.

    「釜山廣域市海雲台區中洞」 carries three levels, and the one that decides a day
    is the middle one: the city is the whole trip, and the 洞 is one block of it.
  */
  /([^市道區郡邑\s\d]{1,4}[區郡邑])/,
  /([^市道\s\d]{1,4}市)/,
];

/** Traditional characters, and no 都道府県 to trim. */
const CHINESE_PATTERNS: RegExp[] = [
  /([^市縣區鄉鎮\s\d]{1,4}[區鄉鎮])/,
  /([^市縣\s\d]{1,4}[市縣])/,
];

/**
 * Everything, for a trip whose country nobody recorded.
 *
 * Ordered by how specific the suffix is, not by country — concatenating the
 * lists made Japan's 「市」 rule match 「釜山廣域市」 before Korea's 「區」 rule was
 * ever tried, and the label came out as the whole city. That is precisely the
 * failure this scoping exists to prevent, so the fallback must not reintroduce
 * it: every district-level rule runs before any city-level one.
 */
const ANY_PATTERNS: RegExp[] = [
  // Romanised, which carries its own country in the suffix.
  /\b([A-Z][a-zA-Z]+ City)\b/,
  /\b([A-Z][a-zA-Z]+-(?:gu|gun|eup|si|dong|ku|cho|machi|shi))\b/,
  // District level.
  /([^都道府県市区郡町村\s\d]{1,4}[区郡町村])/,
  /([가-힣]{1,4}[구군읍])/,
  /([^市道區郡邑\s\d]{1,4}[區郡邑])/,
  /([^市縣區鄉鎮\s\d]{1,4}[區鄉鎮])/,
  // City level, last.
  /([^都道府県\s\d]{1,4}市)/,
  /([^市縣\s\d]{1,4}[市縣])/,
];

/**
 * Well-known areas that are not administrative units but are how people speak.
 *
 * Busan's, so they are only consulted on a Korean trip: 「Centum」 or 「Nampo」
 * appearing inside a Japanese address would otherwise name the group.
 */
const KOREA_AREA_NAMES = ['Haeundae', 'Gwangalli', 'Seomyeon', 'Nampo', 'Gamcheon', 'Songjeong', 'Centum'];

const isJapan = (country?: string) => /日本|japan|^jp$/i.test((country || '').trim());
const isKorea = (country?: string) => /韓國|南韓|韓国|한국|대한민국|korea|^kr$/i.test((country || '').trim());
const isChinese = (country?: string) => /台灣|臺灣|taiwan|^tw$|香港|hong\s*kong|^hk$|澳門|macau|^mo$/i.test((country || '').trim());

const patternsFor = (country?: string): RegExp[] => {
  if (isJapan(country)) return JAPAN_PATTERNS;
  if (isKorea(country)) return KOREA_PATTERNS;
  if (isChinese(country)) return CHINESE_PATTERNS;
  return ANY_PATTERNS;
};

export const districtOf = (address?: string, country?: string): string | undefined => {
  const text = (address || '').trim();
  if (!text) return undefined;

  if (isKorea(country) || !country?.trim()) {
    const area = KOREA_AREA_NAMES.find(name => text.toLowerCase().includes(name.toLowerCase()));
    if (area) return area;
  }

  for (const pattern of patternsFor(country)) {
    const match = text.match(pattern);
    /*
      The city it sits in is not part of its name.

      「釜山廣域市海雲台區中洞」 has no separators, so a four-character window ending
      at 區 reaches back into 「…廣域市」 and the label comes out as 「市海雲台區」.
      Trimmed afterwards rather than excluded in the pattern: 영도구 and 水營區
      contain 도 and 영 legitimately, and a blacklist inside the match refuses
      the names it is meant to find.
    */
    if (match?.[1]) return match[1].replace(/^[市道시도]+/, '');
  }
  return undefined;
};

/**
 * What to call a group of places.
 *
 * The district most of them share, because that is the word the traveller
 * already uses for the area. With no recognisable district anywhere in the
 * group, the place that anchors it names it — 「Peak square 一帶」 is still
 * something a person can picture.
 */
export const labelForCluster = (places: ClusterablePlace[], country?: string): string => {
  const counts = new Map<string, number>();
  places.forEach(place => {
    const district = districtOf(place.formattedAddress, country);
    if (district) counts.set(district, (counts.get(district) || 0) + 1);
  });

  const best = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0];
  if (best) return best[0];

  /*
    The ward a lookup already established, before falling back to a member's
    name. Read off the records rather than out of the address, because Google
    writes the same ward two ways and only one of them is matchable.
  */
  const stated = new Map<string, number>();
  places.forEach(place => {
    const district = (place.district || '').trim();
    if (district) stated.set(district, (stated.get(district) || 0) + 1);
  });
  const statedBest = Array.from(stated.entries()).sort((left, right) => right[1] - left[1])[0];
  if (statedBest) return statedBest[0];

  /*
    Nothing recognisable, so the group is named after what anchors it — and
    that name has to be short enough to be a heading.

    「我覺得這個分區好不合理喔」: a friend's home saved off a LINE screenshot has
    its full postal address as its name, and the heading read
    「110042東京都台東区寿4丁目 6-2 ハーモニーレジデンス浅草#002 503号室 一帶」.
    The shortest name in the group is preferred over the first, because a real
    shop name is almost always shorter than an address somebody pasted.
  */
  const named = places
    .map(place => (place.placeName || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.length - right.length)[0];
  if (!named) return '這一區';
  return `${named.length > 14 ? `${named.slice(0, 14)}…` : named} 一帶`;
};

/*
  Two areas, one name.

  「海雲台好像有兩個」. 清沙浦 and the market by 海雲台站 are 2.8km apart — far
  enough to be two different afternoons, and both addressed 「Haeundae」. Two
  headings reading the same word is worse than one heading covering both: the
  reader assumes a bug and stops trusting the grouping.

  The street the places sit on is what separates them, because it is also what
  separates them on the ground: Cheongsapo-ro is the cove, Gunam-ro is the
  market. Only applied where a name actually collides — an unambiguous area
  keeps its short name.
*/
const STREET_PATTERNS: RegExp[] = [
  /\b([A-Z][a-zA-Z]+)-(?:daero|ro|gil)\b/,
  /([一-鿿]{2,4})[路街洞]/,
  /([가-힣]{2,4})[로길동]/,
];

const streetOf = (address?: string): string | undefined => {
  const text = (address || '').trim();
  if (!text) return undefined;
  for (const pattern of STREET_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
};

/** The street most of a group's places sit on. */
const commonStreet = (places: ClusterablePlace[]): string | undefined => {
  const counts = new Map<string, number>();
  places.forEach(place => {
    const street = streetOf(place.formattedAddress);
    if (street) counts.set(street, (counts.get(street) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0];
};

/**
 * Tells apart two areas that the addresses give the same name.
 *
 * Qualified with the street where that separates them, and numbered only when
 * nothing does — a reader can act on 「Haeundae · Cheongsapo」 and can at least
 * tell 「Haeundae ②」 is a different place, which a bare repeat cannot.
 */
export const disambiguateLabels = <T extends ClusterablePlace>(
  clusters: PlaceCluster<T>[],
): PlaceCluster<T>[] => {
  const counts = new Map<string, number>();
  clusters.forEach(cluster => counts.set(cluster.label, (counts.get(cluster.label) || 0) + 1));

  const seen = new Map<string, number>();
  return clusters.map(cluster => {
    if ((counts.get(cluster.label) || 0) < 2) return cluster;

    const street = commonStreet(cluster.places);
    const taken = (seen.get(cluster.label) || 0) + 1;
    seen.set(cluster.label, taken);

    const qualified = street && street !== cluster.label
      ? `${cluster.label} · ${street}`
      : `${cluster.label} ${['①', '②', '③', '④', '⑤', '⑥'][taken - 1] || taken}`;
    return { ...cluster, label: qualified, id: `area-${qualified}-${cluster.places.length}` };
  });
};

/**
 * Groups places that are within walking-or-short-ride distance of each other.
 *
 * Single-link: a place joins a group when it is close to *any* member, not to
 * all of them. A beachfront with places strung along it is one area even though
 * its two ends are further apart than the radius — which is how somebody
 * walking it would describe it.
 */
export const clusterSavedPlaces = <T extends ClusterablePlace>(
  places: T[],
  radiusKm: number = SAME_AREA_RADIUS_KM,
  /*
    The trip's own country, so a Japanese address is read with Japanese
    conventions and a Korean one with Korean. 「你在做分區的時候你要去抓取這個旅冊
    的國家地點 不然會有誤」 — see `patternsFor`.
  */
  country?: string,
): { clusters: PlaceCluster<T>[]; unlocated: T[] } => {
  const located = places.filter(hasCoordinates);
  const unlocated = places.filter(place => !hasCoordinates(place));

  // Union-find over 「close enough to be the same outing」.
  const parent = located.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== cursor) { const next = parent[cursor]; parent[cursor] = root; cursor = next; }
    return root;
  };
  const union = (left: number, right: number) => { parent[find(left)] = find(right); };

  /*
    The ward decides first; distance only separates places inside one.

    「收藏的景點分區不正確」 — this was single-linkage clustering, and single
    linkage chains. Measured on a realistic central-Tokyo spread: 渋谷 ↔ 原宿 is
    1.4 km, 原宿 ↔ 代代木 1.4 km, 代代木 ↔ 新宿 0.8 km… and thirteen places from
    渋谷 to 四谷 came out as one group spanning 5.8 km — which is exactly the
    「最遠兩點約 5.9 公里」 his day was reporting while the route zigzagged across
    the city. Every hop is close enough; the chain is not.

    A ward is what a traveller means by 「一區」, it is what Google states, and it
    is on the record since the city and the ward were split. So two places in
    different wards are never joined however close they are, and distance is
    left to do the one job it is good at: splitting a large ward into separate
    outings. Records with no ward keep the old behaviour among themselves.
  */
  const wardOf = (place: ClusterablePlace): string =>
    (place.district || '').trim().toLocaleLowerCase();

  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const leftWard = wardOf(located[i]);
      const rightWard = wardOf(located[j]);
      if (leftWard && rightWard && leftWard !== rightWard) continue;
      if (distanceKm(located[i], located[j]) <= radiusKm) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  located.forEach((place, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) || []), place]);
  });

  /*
    Biggest first, so the colours fall in a stable order.

    A palette handed out in discovery order would recolour the whole list every
    time a place is added, and a colour that moves is a colour nobody learns.
    Ties break on the label so the order cannot depend on object identity.
  */
  const ordered = Array.from(groups.values()).sort((left, right) =>
    right.length - left.length || labelForCluster(left, country).localeCompare(labelForCluster(right, country)));

  const clusters = ordered.map((group, index) => ({
    id: `area-${labelForCluster(group, country)}-${group.length}`,
    label: labelForCluster(group, country),
    colorIndex: index,
    places: group,
    center: {
      latitude: group.reduce((sum, place) => sum + (place.latitude as number), 0) / group.length,
      longitude: group.reduce((sum, place) => sum + (place.longitude as number), 0) / group.length,
    },
  }));

  return { clusters: disambiguateLabels(clusters), unlocated };
};

/**
 * The area a single place belongs to, for a card that is not in the list.
 *
 * Matched by id rather than by recomputing distance, so the itinerary and the
 * collection can never disagree about which area a place is in.
 */
export const clusterOfPlace = <T extends ClusterablePlace>(
  clusters: PlaceCluster<T>[],
  placeId: string,
): PlaceCluster<T> | undefined =>
  clusters.find(cluster => cluster.places.some(place => place.id === placeId));
