/**
 * Whether a trip stays inside the country the traveller lives in.
 *
 * 「國內旅行」 and 「國外旅行」 are not two kinds of data — the same trip, the
 * same itinerary, the same bills. What differs is which preparation the app
 * should bother a traveller with: a weekend in 台南 does not need a passport
 * expiry, and showing one there makes every other item look optional too.
 *
 * ONE home for the comparison. Create-trip asks it to preselect the toggle and
 * the preparation page asks it to hide the entry-rules block, and a rule
 * honoured by one caller and dropped by the other is how 「先離開機場才去入住」
 * happened. `sameCountry` already knows that 日本 and Japan are one place; this
 * module adds nothing to that question and only names the answer.
 *
 * `unknown` is a first-class answer, not a missing one. Residence is asked for
 * and never inferred (`types.ts` says so about `residenceCountryCode`), and
 * the trip's country is itself often inferred from a name or a boarding pass.
 * When either side is absent the honest answer is that nobody said — and the
 * screen asks, rather than defaulting to 國外 and dressing a guess as a fact.
 */
import { countryKey, sameCountry } from './countryIdentity';

export type TripScope = 'domestic' | 'international';

/** What the toggle shows when nobody has chosen: an answer, or no answer. */
export type DerivedTripScope = TripScope | 'unknown';

/**
 * The trip's scope as the two country fields imply it.
 *
 * Both sides accept whatever spelling was stored — an ISO code from the
 * profile, 「日本」 from a trip name, 「Japan」 from an airport directory.
 */
export const deriveTripScope = (
  residenceCountry?: string,
  tripCountry?: string,
): DerivedTripScope => {
  if (!residenceCountry?.trim() || !tripCountry?.trim()) return 'unknown';
  return sameCountry(residenceCountry, tripCountry) ? 'domestic' : 'international';
};

/**
 * What a traveller chose, and only then what the countries imply.
 *
 * A stored scope outranks the derivation for the same reason a typed
 * destination outranks one detected from the trip name: somebody said it.
 * It also survives the traveller moving house, which a live derivation
 * would silently reclassify every trip they have ever taken.
 */
export const effectiveTripScope = (
  stored: TripScope | undefined,
  residenceCountry?: string,
  tripCountry?: string,
): DerivedTripScope => stored || deriveTripScope(residenceCountry, tripCountry);

/**
 * The currency to SUGGEST for a country.
 *
 * A suggestion, never an imposition: the field stays editable and a currency
 * the traveller has touched is never overwritten. Missing means no suggestion
 * — the currency select keeps whatever it had rather than falling back to TWD,
 * which would be a Taiwan-shaped guess about somebody in Seattle.
 */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  tw: 'TWD',
  jp: 'JPY',
  us: 'USD',
  kr: 'KRW',
  cn: 'CNY',
  hk: 'HKD',
  th: 'THB',
  gb: 'GBP',
  au: 'AUD',
  sg: 'SGD',
  my: 'MYR',
  vn: 'VND',
  ph: 'PHP',
  id: 'IDR',
  mo: 'MOP',
  fr: 'EUR',
  it: 'EUR',
  es: 'EUR',
  de: 'EUR',
};

export const suggestedCurrency = (country?: string): string | undefined =>
  CURRENCY_BY_COUNTRY[countryKey(country)];

/**
 * A destination a traveller can tap instead of typing.
 *
 * `query` is what goes into the destination field and into the cover-image
 * lookup, so it is the same text a traveller would have typed. `city` and
 * `country` are display only.
 */
export interface PopularDestination {
  id: string;
  city: string;
  country: string;
  query: string;
}

/**
 * Deliberately a short hand-written table, like `destinationFromTripName`.
 *
 * A place on this list is a shortcut, not a claim about where anybody should
 * go, and a country missing from it simply shows no shortcuts — the text field
 * does everything it did before. Inventing a worldwide city dataset to fill
 * this grid is how a confidently wrong 「熱門」 list gets shipped.
 */
const DOMESTIC_BY_COUNTRY: Record<string, PopularDestination[]> = {
  tw: [
    { id: 'tw-tpe', city: '台北', country: '台灣', query: '台北' },
    { id: 'tw-tao', city: '台中', country: '台灣', query: '台中' },
    { id: 'tw-tnn', city: '台南', country: '台灣', query: '台南' },
    { id: 'tw-khh', city: '高雄', country: '台灣', query: '高雄' },
  ],
  us: [
    { id: 'us-nyc', city: 'New York', country: 'USA', query: 'New York' },
    { id: 'us-sea', city: 'Seattle', country: 'USA', query: 'Seattle' },
    { id: 'us-chi', city: 'Chicago', country: 'USA', query: 'Chicago' },
    { id: 'us-bos', city: 'Boston', country: 'USA', query: 'Boston' },
  ],
  jp: [
    { id: 'jp-tyo', city: '東京', country: '日本', query: '東京' },
    { id: 'jp-osa', city: '大阪', country: '日本', query: '大阪' },
    { id: 'jp-kyo', city: '京都', country: '日本', query: '京都' },
    { id: 'jp-fuk', city: '福岡', country: '日本', query: '福岡' },
  ],
};

const INTERNATIONAL: PopularDestination[] = [
  { id: 'intl-jp', city: '東京', country: '日本', query: '日本' },
  { id: 'intl-kr', city: '首爾', country: '韓國', query: '韓國' },
  { id: 'intl-th', city: '曼谷', country: '泰國', query: '泰國' },
  { id: 'intl-fr', city: '巴黎', country: '法國', query: '法國' },
];

/**
 * Shortcuts for the scope being created.
 *
 * Domestic shortcuts are places inside the residence country, so an unknown
 * residence yields none — the alternative is offering a Taiwanese a list of
 * American cities under the heading 「國內」.
 *
 * International shortcuts drop anywhere that would not in fact be abroad.
 */
export const popularDestinations = (
  scope: TripScope,
  residenceCountry?: string,
): PopularDestination[] => {
  if (scope === 'domestic') {
    return DOMESTIC_BY_COUNTRY[countryKey(residenceCountry)] || [];
  }
  return INTERNATIONAL.filter(place => !sameCountry(place.country, residenceCountry));
};
