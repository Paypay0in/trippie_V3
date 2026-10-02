/**
 * Checking what the planner proposed before showing it as an option.
 *
 * The changes came back from the model and went straight to the screen. So an
 * `add` with a time but no date rendered as 「加到：未指定日期」 — a suggestion
 * the traveller asked to have scheduled, offered back unscheduled, with
 * nothing to do but accept it and then go find it.
 *
 * Nothing here guesses a date. A day is the one thing the request was for, and
 * inventing one would be worse than saying it is missing.
 */

export interface ProposedChange {
  type?: string;
  existingItemId?: string;
  toDate?: string;
  toTime?: string;
  /**
   * The place this change is about, named at the top level.
   *
   * Required of every change by the schema, which is the only thing that has
   * ever made the model reliably write one: nested inside `proposedItem` it was
   * optional, and 「重新規劃」 answered a six-line request with four adds that
   * carried no place at all. They were dropped, so the traveller got a summary
   * claiming the whole request had been handled and an itinerary where nothing
   * had happened.
   */
  placeName?: string;
  proposedItem?: { placeName?: string };
  [key: string]: unknown;
}

export interface CheckedChanges {
  changes: ProposedChange[];
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Longer than the longest real place name, and far shorter than a paragraph. */
const MAX_PLACE_NAME_LENGTH = 80;

const nameOf = (change: ProposedChange): string =>
  change.proposedItem?.placeName?.trim()
  || (typeof change.placeName === 'string' ? change.placeName.trim() : '')
  || '一個新地點';

/**
 * Keeps the changes a traveller can actually act on.
 *
 * An `add` needs a day inside the trip. Without one it is dropped and named in
 * the warnings, so the answer is "this could not be placed" rather than a card
 * that looks accepted and then is not anywhere.
 *
 * `move` and `update` are left alone: they carry an existing item that already
 * has a date, and a missing `toDate` there means "keep the day it is on".
 */
export const checkProposedChanges = (
  raw: unknown,
  tripDates: string[],
  /**
   * Per date, the earliest time that day is free — the end of its last flight.
   *
   * 「當我輸入航班資訊時 行程表就應該先錨定」: the flights are anchored first and
   * everything else is placed after them. An add before the floor is retimed to
   * it rather than dropped; the place was a real suggestion, only the clock was
   * wrong.
   */
  dayFloors: Record<string, string> = {},
  /**
   * Per date, the time the day stops — when they leave for the airport. Dropped
   * rather than retimed: a ceiling has nowhere to move an item to.
   */
  dayCeilings: Record<string, string> = {},
): CheckedChanges => {
  const changes = Array.isArray(raw) ? (raw as ProposedChange[]) : [];
  const withinTrip = new Set(tripDates);
  const warnings: string[] = [];

  const kept = changes.map(change => {
    if (change?.type !== 'add') return change;
    // The top-level name is the one the schema insists on, so an `add` whose
    // `proposedItem` came back empty is still a real suggestion and is rebuilt
    // around it rather than thrown away.
    const fallbackName = typeof change.placeName === 'string' ? change.placeName.trim() : '';
    if (!change.proposedItem?.placeName?.trim() && fallbackName) {
      return { ...change, proposedItem: { ...(change.proposedItem || {}), placeName: fallbackName } };
    }
    return change;
  }).filter(change => {
    if (change?.type !== 'add') return true;

    // A place is the entire content of an `add`. One came back with no
    // `proposedItem` at all and the place written into `toTime` as
    // 「22:45 N/A (Late Night Snack near Hotel)」 — a change that can only be
    // accepted into a card with no name on it.
    const placeName = change.proposedItem?.placeName?.trim() || '';
    // A place has a name, not an essay. Pushed onto a fallback model, one came
    // back as nine hundred words of 「safely cleanly efficiently」 with the real
    // shop name buried at the end — which would have become the title of a card
    // in somebody's itinerary. No real place is anywhere near this long.
    if (placeName.length > MAX_PLACE_NAME_LENGTH) {
      warnings.push('有一筆新增建議的地點名稱不像地名，已略過，請再試一次。');
      return false;
    }
    if (!placeName) {
      warnings.push('有一筆新增建議沒有地點名稱，已略過。');
      return false;
    }

    const date = typeof change.toDate === 'string' ? change.toDate.trim() : '';
    if (!ISO_DATE.test(date)) {
      warnings.push(`${nameOf(change)} 沒有指定要排在哪一天，已略過。`);
      return false;
    }
    // A date outside the trip is not a day the traveller is there. Snapping it
    // to the nearest one would be a guess wearing a specific number.
    if (withinTrip.size > 0 && !withinTrip.has(date)) {
      warnings.push(`${nameOf(change)} 被排在旅程以外的 ${date}，已略過。`);
      return false;
    }
    return true;
  });

  /*
    Nothing is placed on a day before that day's flights are over.

    Day 1 of the Busan itinerary had 「抵達金海國際機場並完成入境」 at 14:00 above the
    16:35 departure from Taoyuan and the 19:55 landing — 「怎麼會先入境金浦機場再去
    桃園機場」. The model is told the flights; this is what makes it true anyway.
  */
  const floored = kept.map(change => {
    if (change?.type !== 'add' && change?.type !== 'move') return change;
    const date = typeof change.toDate === 'string' ? change.toDate.trim() : '';
    const floor = dayFloors[date];
    const time = typeof change.toTime === 'string' ? change.toTime.trim() : '';
    if (!floor || !CLOCK.test(time) || time >= floor) return change;
    warnings.push(`${nameOf(change)} 被排在 ${time}，但 ${date} 當天的航班到 ${floor} 才結束，已改排到 ${floor} 之後。`);
    return { ...change, toTime: floor };
  });

  // And nothing after they have left for the airport.
  const withinDay = floored.filter(change => {
    if (change?.type !== 'add' && change?.type !== 'move') return true;
    const date = typeof change.toDate === 'string' ? change.toDate.trim() : '';
    const ceiling = dayCeilings[date];
    const time = typeof change.toTime === 'string' ? change.toTime.trim() : '';
    if (!ceiling || !CLOCK.test(time) || time < ceiling) return true;
    warnings.push(`${nameOf(change)} 被排在 ${time}，但 ${date} 當天 ${ceiling} 就要出發去機場了，已略過。`);
    return false;
  });

  return { changes: withinDay, warnings };
};
