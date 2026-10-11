/**
 * Typing a place into a slot that no saved place fits.
 *
 * 「下拉式選單要讓用戶也可以手動新增」. The picker offered the collection and
 * nothing else, so a 10:00 slot could only be filled by somebody who had
 * already saved the place — and a traveller planning a morning around a shop
 * a friend just mentioned had to go and save it first, in another screen,
 * then come back.
 *
 * What lands here is a name, and only a name. That matters downstream and is
 * not a shortcoming to be papered over: the item has no coordinates, so the
 * transport card will say it cannot compute travel time, and the map link
 * will not be built. Those screens already handle a place with no point and
 * say so plainly, which is the honest outcome — inventing a location from a
 * typed string is how a day gets planned around the wrong building.
 */

export const MAX_TITLE = 60;

/**
 * The name, cleaned, or null when there is nothing to add.
 *
 * Whitespace alone is a slot the traveller opened and thought better of, not
 * an entry called 「 」, and a blank item on the plan is worse than an empty
 * slot: the slot says 「無」, which is an answer.
 */
export const cleanManualTitle = (typed: string): string | null => {
  const title = (typed || '').trim().replace(/\s+/g, ' ');
  if (!title) return null;
  return title.slice(0, MAX_TITLE);
};

/**
 * Whether a typed name duplicates something already on this day.
 *
 * Not a refusal — somebody may genuinely pass the same place twice — but the
 * caller can say so. Compared case-insensitively and without spacing, because
 * 「cafe onion」 and 「Cafe Onion」 are the same shop to the person typing.
 */
export const alreadyOnThisDay = (title: string, existingTitles: string[]): boolean => {
  const key = title.toLowerCase().replace(/\s+/g, '');
  return existingTitles.some(other => (other || '').toLowerCase().replace(/\s+/g, '') === key);
};
