import { describe, expect, it } from 'vitest';
import { selectTripInspirationGroups } from '../services/tripInspirationSelection';
import { clusterSavedPlaces } from '../services/placeClusters';
import { SavedTravelInspiration } from '../types';

const ramen = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'r1', savedByUserId: 'me', placeName: 'らぁ麺や 嶋',
  country: '日本', city: 'Tokyo',
  formattedAddress: '3-chōme-41-11 Honmachi, Shibuya, Tokyo 151-0071日本',
  latitude: 35.6883441, longitude: 139.6808875,
  notes: [], sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c',
  sourceNoteIds: [], savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

const label = (item: SavedTravelInspiration) => {
  const groups = selectTripInspirationGroups([item], { destination: 'Tokyo', destinationCountry: '日本', startDate: '2026-10-20', endDate: '2026-10-24' } as never);
  const { clusters } = clusterSavedPlaces(groups.map(group => ({
    id: group.id, placeName: group.placeName,
    latitude: group.coordinates?.latitude, longitude: group.coordinates?.longitude,
    formattedAddress: group.formattedAddress, district: group.district,
  })), undefined, '日本');
  return clusters[0]?.label;
};

describe('the ward reaching the heading, through the real path', () => {
  it('names the area from the saved ward', () => {
    expect(label(ramen({ district: 'Shibuya' }))).toBe('Shibuya');
  });

  /* Without it, the only thing left is a member's name — which is the symptom. */
  it('falls back to the place name when the record has no ward', () => {
    expect(label(ramen())).toBe('らぁ麺や 嶋 一帶');
  });
});

/**
 * An incidental finding while proving the chain: the planner matches a saved
 * place to a trip on the destination *text*, and Google now answers with
 * English city names under zh-TW. So a Tokyo trip named 「東京」 and a save
 * whose city reads 「Tokyo」 can fail to meet.
 */
describe('a trip and a save spelling the same city differently', () => {
  const groupsFor = (destination: string) =>
    selectTripInspirationGroups(
      [ramen({ district: 'Shibuya' })],
      { destination, destinationCountry: '日本', startDate: '2026-10-20', endDate: '2026-10-24' } as never,
    );

  it('meets when both say Tokyo', () => {
    expect(groupsFor('Tokyo')).toHaveLength(1);
  });

  /*
    They must meet. A mismatch does not merely mislabel the place — it removes
    it from the planner entirely, which is a far worse outcome than a wrong
    heading, and the traveller has no way to tell a hidden save from a
    forgotten one.
  */
  it('meets when the trip says 東京 and the save says Tokyo', () => {
    expect(groupsFor('東京')).toHaveLength(1);
  });

  it('still keeps a genuinely different city apart', () => {
    expect(groupsFor('大阪')).toHaveLength(0);
  });
});
