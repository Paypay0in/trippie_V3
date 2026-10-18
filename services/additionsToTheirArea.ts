/**
 * The day a newly added place lands on, decided by its area.
 *
 * 「我覺得 AI 要有一個概念是 同一區域的可以安排同一天」, and then 「混排」 twice after
 * the areas went into the prompt by name.
 *
 * Twice tonight the same answer has worked: asking the model to obey one more
 * rule is weaker than taking the job away from it. An overlap became arithmetic
 * and stopped happening; a missing time became arithmetic and stopped
 * happening. Which day a place belongs on is arithmetic too — the areas are
 * already computed, and 「which day is this area already on」 is a lookup, not a
 * judgement.
 *
 * So the model keeps the part only it can do — whether a place is worth going
 * to, and in what order — and the calendar is ours.
 *
 * Deliberately conservative. A place is moved only when its area already has a
 * day on this trip; an area nobody has visited yet keeps whatever day the model
 * chose, because then there is nothing to be consistent with and overruling it
 * would be inventing a plan rather than tidying one.
 */
import { ItineraryItem } from '../types';
import { clusterSavedPlaces } from './placeClusters';

const clusterable = (item: ItineraryItem) => ({
  id: item.id,
  placeName: item.location || item.title || '',
  latitude: item.latitude,
  longitude: item.longitude,
  formattedAddress: item.address,
});

/**
 * @param addedIds the items this adjustment just created.
 * @param country the trip's country, so an address is read with its own
 *   conventions. See `districtOf`.
 */
export const additionsToTheirArea = (
  items: ItineraryItem[],
  addedIds: Set<string>,
  country?: string,
): { items: ItineraryItem[]; movedCount: number } => {
  if (addedIds.size === 0) return { items, movedCount: 0 };

  const { clusters } = clusterSavedPlaces(items.map(clusterable), undefined, country);
  const byId = new Map(items.map(item => [item.id, item]));

  const moved = new Map<string, string>();

  clusters.forEach(cluster => {
    const members = cluster.places.map(place => byId.get(place.id)).filter(Boolean) as ItineraryItem[];
    const settled = members.filter(item => !addedIds.has(item.id) && item.date);
    if (settled.length === 0) return;

    /*
      A pin decides the day outright.

      「這個行程是固定的 … 那 AI 在規劃行程的時候就要把這區附近的行程規劃在這天」,
      and then 「目前是將這區的行程附近的都放在第五天」 — the pin sat alone on its
      day and lost the count below three to one.

      A majority reads where things happen to be; a pin reads a decision the
      traveller made, and one of those outranks the other however many stops
      are on the other side. Earliest pin wins when a day somehow holds two,
      so the answer never depends on object order.
    */
    const pinnedHome = settled
      .filter(item => item.isPinned === true)
      .map(item => item.date)
      .sort()[0];

    /*
      Otherwise the day this area already owns: the one holding most of it. A
      tie goes to the earlier date, so the answer does not depend on object
      order.
    */
    const counts = new Map<string, number>();
    settled.forEach(item => counts.set(item.date, (counts.get(item.date) || 0) + 1));
    const home = pinnedHome || Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];

    members
      .filter(item => addedIds.has(item.id) && item.date && item.date !== home)
      .forEach(item => moved.set(item.id, home));
  });

  if (moved.size === 0) return { items, movedCount: 0 };
  return {
    items: items.map(item => (moved.has(item.id) ? { ...item, date: moved.get(item.id) as string } : item)),
    movedCount: moved.size,
  };
};
