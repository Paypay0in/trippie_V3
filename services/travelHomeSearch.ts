/**
 * Finding one of your own trips by typing its name.
 *
 * The 旅行 home is almost entirely a list of things the traveller already
 * owns — the trip in progress, the drafts behind it, saved notes, finished
 * journeys — stacked in horizontal strips that scroll separately. Four strips
 * is already more than fits on a phone, and a returning traveller with a year
 * of history is scrolling three of them to find one name they already know.
 *
 * So the field searches what is on the screen rather than opening a catalogue
 * of destinations the app does not have. A search box wired to a feature that
 * does not exist is the most expensive kind of decoration: it looks like the
 * answer to 「where is my Osaka trip」 and then answers nothing.
 */

/** Case- and space-insensitive, because 「釜山 」 and 「釜山」 are the same ask. */
export const searchNormalize = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, '');

/**
 * Does any of these fields contain what was typed?
 *
 * Substring rather than prefix: 「大阪」 should find 「大阪之旅」, and a traveller
 * recalling a trip rarely recalls how its name starts.
 */
export const matchesQuery = (query: string, ...fields: (string | undefined | null)[]): boolean => {
  const needle = searchNormalize(query);
  if (!needle) return true;
  return fields.some(field => field && searchNormalize(field).includes(needle));
};

export const isSearching = (query: string): boolean => searchNormalize(query).length > 0;
