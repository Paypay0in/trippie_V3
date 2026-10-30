/**
 * Where Google's Routes API will not answer a transit question at all.
 *
 * 「你說說可能嗎」 — 「這個地區查不到大眾運輸路線」 under Taoyuan airport, and then
 * under every other pair on a Japan trip. It is not plausible, and it was not
 * the region's fault, and it was not the wording either.
 *
 * Measured against this project's key, `travelMode: "TRANSIT"`, one hour from
 * now, straight at `routes.googleapis.com`:
 *
 *   日本   東京 → 新宿        {} — nothing
 *   日本   大阪 → 難波        {} — nothing
 *   台灣   台北 → 板橋        OK
 *   韓國   首爾站 → 江南      OK
 *   香港   中環 → 旺角        OK
 *   新加坡 政府大廈 → 樟宜     OK
 *   英國   倫敦 KX → LBG      OK
 *
 * Walking and driving answer normally in Tokyo with the same key, so this is
 * neither credentials nor code: the Routes API does not carry Japanese transit.
 * The consumer Google Maps app does, under separate agreements, which is why
 * it looks like a bug to anybody holding a phone.
 *
 * Kept narrow and evidence-only. A country is listed here because a request
 * was made and came back empty — guessing more of them in would hide working
 * routes behind an excuse.
 *
 * This is the same shape as the Korean driving restriction that has been in
 * `TransportLeg` all along: a known reason for a missing answer, said out loud,
 * with the app that does have it named.
 *
 * The two sentences are resolved at call time rather than held in this table,
 * because the table is built once per page load and the reader can change
 * language after that.
 */
import i18n from '../i18n/config';

const NO_TRANSIT = [
  {
    // i18n-data: matched against the trip's stored destination country.
    match: /日本|japan|^jp$/i,
    /*
      The reason, not just the refusal.

      「日本的鐵路法規若不能顯示 我希望 app 是要告訴用戶原因 不要只寫查不到」 —
      「查不到」 reads as 「there is no train」, which is the opposite of the truth
      in the densest rail network on earth. What is actually true, and what was
      measured rather than assumed: Google's routing service returns nothing
      for Japan while answering normally for every neighbouring country on the
      same key, and the consumer Google Maps app has the timetables.

      Said as a limit of the data we can reach, not as a legal claim. The
      Korean notice above does name a legal restriction, because that one is
      documented; this one is not, and inventing a reason is worse than naming
      the boundary.
    */
    adviceKey: 'transport.japanTransitReason',
    shortKey: 'transport.japanTransitHint',
  },
];

const entryFor = (country?: string) => {
  const text = (country || '').trim();
  return text ? NO_TRANSIT.find(entry => entry.match.test(text)) : undefined;
};

/** Whether asking for transit here can ever produce a number. */
export const transitIsUnavailable = (country?: string): boolean => Boolean(entryFor(country));

/** The full sentence, for the sheet. Empty where transit works normally. */
export const transitUnavailableReason = (country?: string): string => {
  const key = entryFor(country)?.adviceKey;
  return key ? i18n.t(key) : '';
};

/** The one line under the summary, where there is less room. */
export const transitUnavailableHint = (country?: string): string => {
  const key = entryFor(country)?.shortKey;
  return key ? i18n.t(key) : '';
};

/**
 * Which mode to open on.
 *
 * Opening on 大眾運輸 in Japan guarantees the first thing the traveller sees is
 * a failure, every single time, on every leg of the trip. Driving is the mode
 * that answers there, and the chips are still right above it.
 */
export const defaultTravelMode = (country?: string): 'TRANSIT' | 'DRIVE' =>
  transitIsUnavailable(country) ? 'DRIVE' : 'TRANSIT';
