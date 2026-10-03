import { ItineraryItem } from '../types';
import { TripInspirationPlaceGroup } from './tripInspirationSelection';

/**
 * A saved place, put on a day by hand.
 *
 * 「目前要將這些筆記加入行程只能用 AI 也要有可以手動更新選後輸入的選項」. Choosing
 * three places and a day is a decision the traveller has already made; routing
 * it through a model that re-orders the day, invents times and may drop one of
 * them is a worse answer than doing what was asked.
 *
 * Everything the place already knows comes with it — the resolved Google
 * identity, the address, the coordinates and the notes saved alongside it — so
 * a card added this way is the same card the AI route would have produced,
 * minus the opinions.
 */

/** Untimed by default: a place picked off a list has no hour attached to it. */
export const inspirationGroupToItineraryItem = (
  group: TripInspirationPlaceGroup,
  makeId: () => string,
  date?: string,
): ItineraryItem => {
  const notes = group.experienceNotes.map(note => ({ ...note }));

  return {
    id: makeId(),
    type: 'ACTIVITY',
    title: group.placeName,
    location: group.placeName,
    notes: '',
    date,
    // No time. The planner's whole value is deciding when; a manual add is the
    // traveller saying where, and inventing an hour they did not choose only
    // creates something to correct.
    time: '',
    isCompleted: false,
    ...(group.placeId ? { placeId: group.placeId } : {}),
    ...(group.formattedAddress ? { address: group.formattedAddress } : {}),
    ...(group.coordinates
      ? { latitude: group.coordinates.latitude, longitude: group.coordinates.longitude }
      : {}),
    /*
      The notes, and the linkage that keeps them.

      「之後建立行程時也要顯示筆記」 — and the persistence layer drops
      savedTravelNotes from an item carrying no `sourceInspirationIds`, so the
      linkage is what stops a reload eating them. It also marks the place as
      planned, which is what greys it out in the picker afterwards.
    */
    ...(group.inspirationIds.length > 0 ? { sourceInspirationIds: [...group.inspirationIds] } : {}),
    ...(notes.length > 0 ? { savedTravelNotes: notes } : {}),
    origin: 'saved_inspiration',
  };
};

/** The chosen groups, in the order they appear in the picker. */
export const selectedInspirationsToItineraryItems = (
  groups: TripInspirationPlaceGroup[],
  selectedGroupIds: string[],
  makeId: () => string,
  date?: string,
): ItineraryItem[] =>
  groups
    .filter(group => selectedGroupIds.includes(group.id))
    .map(group => inspirationGroupToItineraryItem(group, makeId, date));
