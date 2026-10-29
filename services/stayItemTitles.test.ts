import { describe, expect, it } from 'vitest';

import {
  CHECK_IN_PREFIX,
  CHECK_OUT_PREFIX,
  isCheckInItem,
  isCheckOutItem,
  stayTitleBody,
} from './stayItemTitles';

/**
 * How an itinerary item says it is a check-in or a check-out.
 *
 * These prefixes are written into `ItineraryItem.title` and stored, so they
 * are data as much as display text — and four separate places knew the string:
 * `stayIntake` wrote it and declared its own copy, `stayConflicts` declared a
 * second copy, and `App.tsx` matched a third by hand. A rule with four homes
 * is four chances for one of them to disagree.
 */

const item = (title: string) => ({ title } as { title: string });

describe('check-in and check-out titles', () => {
  it('recognises a check-in written by the stay intake', () => {
    expect(isCheckInItem(item(`${CHECK_IN_PREFIX}Kent Hotel`))).toBe(true);
    expect(isCheckOutItem(item(`${CHECK_OUT_PREFIX}Kent Hotel`))).toBe(true);
  });

  it('does not confuse the two', () => {
    expect(isCheckOutItem(item(`${CHECK_IN_PREFIX}Kent Hotel`))).toBe(false);
    expect(isCheckInItem(item(`${CHECK_OUT_PREFIX}Kent Hotel`))).toBe(false);
  });

  it('leaves every other itinerary item alone', () => {
    expect(isCheckInItem(item('甘川文化村'))).toBe(false);
    expect(isCheckInItem(item('前往 Kent Hotel'))).toBe(false);
    expect(isCheckInItem(item(''))).toBe(false);
  });

  it('recognises an English title too', () => {
    // The titles are generated, and generation may be translated later. The
    // predicate has to keep working for rows already on travellers' devices
    // AND for anything written afterwards, because both will sit in the same
    // itinerary.
    expect(isCheckInItem(item('Check in Kent Hotel'))).toBe(true);
    expect(isCheckOutItem(item('Check out Kent Hotel'))).toBe(true);
  });

  it('gives back the property name without the prefix', () => {
    expect(stayTitleBody(item(`${CHECK_IN_PREFIX}Kent Hotel`))).toBe('Kent Hotel');
    expect(stayTitleBody(item('Check out Kent Hotel'))).toBe('Kent Hotel');
    // Not a stay item: the title is its own name.
    expect(stayTitleBody(item('甘川文化村'))).toBe('甘川文化村');
  });
});
