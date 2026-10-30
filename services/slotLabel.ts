/**
 * What a block in the day is called.
 *
 * 「午餐的標注要以地點標籤判斷 不是用時間判斷」. The grid names its blocks by the
 * clock — 12:00 is 午餐, 18:00 is 晚餐 — which is the right guess for a block
 * with nothing in it, because the clock is all there is to go on and the name
 * is what makes the row suggest restaurants.
 *
 * It is the wrong name once something is in it. 八十八淺草 is a café; sitting at
 * 18:30 does not make it dinner, and the row said 晚餐 and then had to ask
 * 「這格是晚餐，但八十八淺草是咖啡。確定嗎？」 — a question the screen only had to
 * ask because it had just asserted something it could see was untrue.
 *
 * So: a filled block is named after what is in it, and an empty one keeps the
 * clock's guess. The mismatch warning goes with it. A label that describes its
 * contents cannot disagree with its contents.
 *
 * 食べる is the one category the clock still has something to say about —
 * 餐廳 at noon is lunch and at seven is dinner, and 午餐 is more use to a
 * traveller reading the day than 餐廳 is. Everything else takes its own name.
 */
import i18n from '../i18n/config';
import { PlaceCategory, categoryLabel } from './placeCategory';

/*
  The clock-given names a meal block can have. See `dayTemplate`.

  They are the keys `dayTemplate` names its blocks with, not words on screen:
  translating them would stop 午餐 being recognised as a meal window, and the
  café at 18:30 would be renamed after all.
*/
// i18n-data: matched against the incoming label with includes; these are dayTemplate's block keys
const MEAL_LABELS = ['早餐', '午餐', '晚餐'];

export const slotLabelFor = (
  { label, kind, category }: { label: string; kind: string; category?: string },
): string => {
  // Nothing in it, or nothing known about what is in it: the clock's guess
  // stands, because there is nothing better and the name is what makes the
  // row offer the right suggestions.
  if (!category || category === 'other') return label;

  /*
    A restaurant in a meal window keeps the meal's name: 午餐 says more about
    the day than 餐廳 does, and the two do not disagree.
  */
  if (category === 'food') {
    return kind === 'meal' && MEAL_LABELS.includes(label) ? label : i18n.t('planner.slotEating');
  }

  return categoryLabel(category as PlaceCategory) || label;
};
