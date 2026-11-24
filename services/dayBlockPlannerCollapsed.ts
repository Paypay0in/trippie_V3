/**
 * Whether this device wants 排今天 folded away.
 *
 * 「這邊要可以收合」. The planner prints every slot of the day — on a full day
 * that is eight or nine rows plus the empty ones offering a place, and it sits
 * above the itinerary somebody opened the screen to read. It is the right size
 * when you are planning and the wrong size every other time.
 *
 * Remembered, because a fold that forgets is not a fold: it reopens on the next
 * day tab, the next render, the next launch, and the traveller has to close the
 * same card again each time. One answer for the whole app rather than one per
 * day — 「I am not planning right now」 is a mood, not a property of a date.
 *
 * Device-local and inconsequential: nothing in the plan changes, and the worst
 * a lost value can do is show a card that was already the default.
 */

export const DAY_BLOCK_PLANNER_COLLAPSED_KEY = 'trippie_day_block_planner_collapsed_v1';

export const dayBlockPlannerCollapsed = (): boolean => {
  try {
    return localStorage.getItem(DAY_BLOCK_PLANNER_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

export const rememberDayBlockPlannerCollapsed = (collapsed: boolean): void => {
  try {
    if (collapsed) localStorage.setItem(DAY_BLOCK_PLANNER_COLLAPSED_KEY, '1');
    else localStorage.removeItem(DAY_BLOCK_PLANNER_COLLAPSED_KEY);
  } catch {
    /* A blocked store costs the card being open next launch. Never worth failing the tap over. */
  }
};
