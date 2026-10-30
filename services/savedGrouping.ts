import i18n from '../i18n/config';
import { SavedInspiration } from '../types';

/**
 * 我的收藏, by country and city.
 *
 * 「這個要以國家城市區分 不要全部攤開」. It was `savedInspirations.map()` — one
 * row per saved place, with 「韓國・釜山」 repeated underneath every single one.
 * Twenty saved places read as twenty unrelated things, and the one fact that
 * organises them was printed twenty times in grey.
 *
 * Grouping is only useful if nothing falls out of it, so the rules here are
 * mostly about where a place goes when it does not say where it is. A saved
 * place that vanishes because it had no country is worse than an ugly group:
 * the traveller saved it, and the list is the only record that they did.
 */

export interface CityGroup {
  /** Empty when the place named a country but no city. */
  city: string;
  items: SavedInspiration[];
}

export interface CountryGroup {
  /** '' for places that never said where they were; rendered as 其他. */
  country: string;
  cities: CityGroup[];
  /** Every item under this country, across its cities. */
  count: number;
}

export const UNPLACED = '';

/**
 * A city worth showing as a city.
 *
 * `韓國・韓國` is on the home screen today: when a place only knows its
 * country, the city field gets filled with the country and the label prints it
 * twice. A city equal to its own country is not a city, it is the country
 * said again.
 */
const cityOf = (item: SavedInspiration): string => {
  const city = (item.city || '').trim();
  const country = (item.country || '').trim();
  if (!city) return '';
  return city === country ? '' : city;
};

/**
 * Grouped, with the biggest country first.
 *
 * Ties keep the order the items arrived in, so a list does not reshuffle
 * itself between two renders of the same data — somebody looking for the group
 * they just collapsed should find it where they left it.
 *
 * Unplaced saves sort last whatever their size: they are a loose end, not a
 * destination, and a 其他 group at the top would be the first thing read.
 */
export const groupSavedByPlace = (items: SavedInspiration[]): CountryGroup[] => {
  const order: string[] = [];
  const byCountry = new Map<string, Map<string, SavedInspiration[]>>();

  for (const item of items) {
    const country = (item.country || '').trim();
    if (!byCountry.has(country)) {
      byCountry.set(country, new Map());
      order.push(country);
    }
    const cities = byCountry.get(country)!;
    const city = cityOf(item);
    if (!cities.has(city)) cities.set(city, []);
    cities.get(city)!.push(item);
  }

  const groups = order.map(country => {
    const cities = byCountry.get(country)!;
    const cityGroups: CityGroup[] = Array.from(cities.entries())
      .map(([city, cityItems]) => ({ city, items: cityItems }))
      // A city named is a city first; the country-only remainder sits under it.
      .sort((a, b) => (a.city ? 0 : 1) - (b.city ? 0 : 1));
    return {
      country,
      cities: cityGroups,
      count: cityGroups.reduce((total, group) => total + group.items.length, 0),
    };
  });

  return groups.sort((a, b) => {
    if (a.country === UNPLACED) return 1;
    if (b.country === UNPLACED) return -1;
    return b.count - a.count || order.indexOf(a.country) - order.indexOf(b.country);
  });
};

/** 其他 for the ones that never said where they were. */
export const countryLabel = (country: string): string => country || i18n.t('places.otherArea');

/**
 * Which groups open on arrival.
 *
 * 「不要全部攤開」, so: closed. The exception is a single country, where the
 * whole screen would otherwise be one collapsed row and a question — that is
 * not organised, it is hidden, and it would need a tap to show something the
 * traveller could already have seen.
 */
export const initiallyOpen = (groups: CountryGroup[]): string[] =>
  groups.length === 1 ? [groups[0].country] : [];

/** 「3 個城市・12 個地點」, or just the places when no city is named. */
export const groupSummary = (group: CountryGroup): string => {
  const namedCities = group.cities.filter(city => city.city).length;
  const places = i18n.t('saved.groupPlaceCount', { count: group.count });
  return namedCities > 0
    ? i18n.t('saved.groupCitiesAndPlaces', { count: namedCities, places })
    : places;
};
