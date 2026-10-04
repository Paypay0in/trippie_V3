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
*/
const DISTRICT_PATTERNS: RegExp[] = [
  // Korean romanisation, suffix included: a label reading 「Suyeong」 is not a word.
  /\b([A-Z][a-zA-Z]+-(?:gu|gun|eup))\b/,
  /*
    District before city.

    「釜山廣域市海雲台區中洞」 carries three levels, and the one that decides a day
    is the middle one: the city is the whole trip, and the 洞 is one block of it.
  */
  /([一-鿿]{1,4}[區郡邑])/,
  /([가-힣]{1,4}[구군읍])/,
  /([一-鿿]{1,4}市)/,
];

/** Well-known areas that are not administrative units but are how people speak. */
const AREA_NAMES = ['Haeundae', 'Gwangalli', 'Seomyeon', 'Nampo', 'Gamcheon', 'Songjeong', 'Centum'];

export const districtOf = (address?: string): string | undefined => {
  const text = (address || '').trim();
  if (!text) return undefined;

  const area = AREA_NAMES.find(name => text.toLowerCase().includes(name.toLowerCase()));
  if (area) return area;

  for (const pattern of DISTRICT_PATTERNS) {
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
export const labelForCluster = (places: ClusterablePlace[]): string => {
  const counts = new Map<string, number>();
  places.forEach(place => {
    const district = districtOf(place.formattedAddress);
    if (district) counts.set(district, (counts.get(district) || 0) + 1);
  });

  const best = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0];
  if (best) return best[0];
  return places[0] ? `${places[0].placeName} 一帶` : '這一區';
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

  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
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
    right.length - left.length || labelForCluster(left).localeCompare(labelForCluster(right)));

  const clusters = ordered.map((group, index) => ({
    id: `area-${labelForCluster(group)}-${group.length}`,
    label: labelForCluster(group),
    colorIndex: index,
    places: group,
    center: {
      latitude: group.reduce((sum, place) => sum + (place.latitude as number), 0) / group.length,
      longitude: group.reduce((sum, place) => sum + (place.longitude as number), 0) / group.length,
    },
  }));

  return { clusters, unlocated };
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
