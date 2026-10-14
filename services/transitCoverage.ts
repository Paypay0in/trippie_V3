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
 */

const NO_TRANSIT = [
  {
    match: /日本|japan|^jp$/i,
    /** Where the traveller should actually look, named rather than implied. */
    advice: '日本的大眾運輸 Google 路線服務查不到。Google 地圖 App 本身查得到，或用「乘換案內」這類日本在地 App。',
    short: 'Google 地圖 App 或日本在地轉乘 App 查得到。',
  },
];

const entryFor = (country?: string) => {
  const text = (country || '').trim();
  return text ? NO_TRANSIT.find(entry => entry.match.test(text)) : undefined;
};

/** Whether asking for transit here can ever produce a number. */
export const transitIsUnavailable = (country?: string): boolean => Boolean(entryFor(country));

/** The full sentence, for the sheet. Empty where transit works normally. */
export const transitUnavailableReason = (country?: string): string => entryFor(country)?.advice || '';

/** The one line under the summary, where there is less room. */
export const transitUnavailableHint = (country?: string): string => entryFor(country)?.short || '';

/**
 * Which mode to open on.
 *
 * Opening on 大眾運輸 in Japan guarantees the first thing the traveller sees is
 * a failure, every single time, on every leg of the trip. Driving is the mode
 * that answers there, and the chips are still right above it.
 */
export const defaultTravelMode = (country?: string): 'TRANSIT' | 'DRIVE' =>
  transitIsUnavailable(country) ? 'DRIVE' : 'TRANSIT';
