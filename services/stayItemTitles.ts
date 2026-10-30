/**
 * How an itinerary item says it is a check-in or a check-out.
 *
 * `stayIntake` turns a booking into two itinerary rows and names them 「入住
 * <hotel>」 and 「退房 <hotel>」. Those titles are written into
 * `ItineraryItem.title` and stored, so the prefix is data as much as it is
 * display text.
 *
 * It had four homes: `stayIntake` wrote it and declared a copy, `stayConflicts`
 * declared a second, and `App.tsx` matched a third by hand to decide whether a
 * check-in time should follow the flight's arrival. Four chances for one to
 * disagree — and the arrival repair is the one that fails silently, leaving
 * 入住 21:55 sitting above 前往飯店 21:55 with nothing reported.
 *
 * The prefixes are NOT translated here, deliberately. They are embedded in
 * titles already stored on travellers' devices, so translating them would
 * orphan every stay recorded so far — the same boundary as `Category`. What
 * the predicates do instead is recognise both spellings, so an English title
 * written later still answers the question correctly.
 */

// i18n-data: embedded in stay titles already stored on travellers' devices.
export const CHECK_IN_PREFIX = '入住 ';
// i18n-data: embedded in stay titles already stored on travellers' devices.
export const CHECK_OUT_PREFIX = '退房 ';

/**
 * Both spellings, because an itinerary can hold rows from before and after a
 * translation of the generator. Matching is anchored to the start of the
 * title: 「前往 Kent Hotel」 mentions the hotel and is not a check-in.
 */
// i18n-data: anchors matching the stored prefix, both spellings.
const CHECK_IN_PATTERNS = [/^入住\s/, /^check[-\s]?in\s/i];
// i18n-data: anchors matching the stored prefix, both spellings.
const CHECK_OUT_PATTERNS = [/^退房\s/, /^check[-\s]?out\s/i];

type TitledItem = { title: string };

export const isCheckInItem = (item: TitledItem): boolean =>
  CHECK_IN_PATTERNS.some(pattern => pattern.test(item.title));

export const isCheckOutItem = (item: TitledItem): boolean =>
  CHECK_OUT_PATTERNS.some(pattern => pattern.test(item.title));

/**
 * The property name with the prefix taken off, for showing the choice.
 *
 * An item that is neither a check-in nor a check-out keeps its whole title:
 * stripping a prefix that is not there would silently shorten a stop's name.
 */
export const stayTitleBody = (item: TitledItem): string => {
  for (const pattern of [...CHECK_IN_PATTERNS, ...CHECK_OUT_PATTERNS]) {
    const match = pattern.exec(item.title);
    if (match) return item.title.slice(match[0].length).trim();
  }
  return item.title;
};
