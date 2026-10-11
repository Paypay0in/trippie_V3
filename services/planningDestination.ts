/**
 * Where a plan is for.
 *
 * 「我的旅策地點是沖繩 已經明確寫了 結果出現東京的方案…」.
 *
 * The planner was sent `destinationCountry || destination` — the country
 * first, and the specific place only when there was no country. A trip to
 * 日本沖繩 therefore asked for plans in 日本, and Tokyo and Fuji are in Japan.
 * The model was answering the question it was given.
 *
 * The same shape as the cover photo an hour ago: a broader field preferred
 * over the exact one the traveller typed, with nothing on screen showing
 * which had been used. The order is now specific first, always.
 *
 * The country is still worth carrying — 「沖繩」 alone is ambiguous to a search
 * that does not already know — so it is added rather than substituted, and
 * only when the destination has not already said it.
 */
export const planningDestination = (destination?: string, country?: string): string => {
  const place = (destination || '').trim().replace(/\s+/g, ' ');
  const nation = (country || '').trim();

  if (!place) return nation;
  if (!nation) return place;
  // 「日本沖繩」 already contains 「日本」; repeating it reads like two places.
  if (place.includes(nation)) return place;
  return `${nation} ${place}`;
};
