import { describe, it, expect } from 'vitest';
import {
  buildTripPlanningInput,
  buildTripPlanningSelection,
  groupInspirationsByPlace,
  matchesTripDestination,
  selectPlannedInspirationGroupIds,
  selectTripInspirationGroups,
  tripDurationDays,
  TripDestinationContext,
  TripInspirationPlaceGroup,
} from './tripInspirationSelection';
import { ItineraryItem, SavedTravelInspiration } from '../types';

const note = (id: string, text: string, sliceId = 'slice-a', postId = 'post-1', creatorId = 'creator-1') => ({
  id: `saved-note-${id}`,
  sourceNoteId: `note-${id}`,
  sourceSliceId: sliceId,
  sourcePostId: postId,
  sourceCreatorId: creatorId,
  type: 'recommendation' as const,
  text,
});

const inspiration = (overrides: Partial<SavedTravelInspiration> & Pick<SavedTravelInspiration, 'id' | 'placeName'>): SavedTravelInspiration => ({
  savedByUserId: 'anon-1',
  country: '韓國',
  city: '釜山',
  sourcePostId: 'post-1',
  sourceSliceId: 'slice-a',
  sourceCreatorId: 'creator-1',
  sourceNoteIds: [],
  savedAt: '2026-09-01T00:00:00.000Z',
  notes: [],
  ...overrides,
});

// Acceptance fixture from the ticket: a Busan trip, two Busan saves and one Tokyo save.
const BUSAN_TRIP: TripDestinationContext & { startDate: string; endDate: string } = {
  destination: '釜山',
  destinationCountry: 'South Korea',
  destinationLatitude: 35.1796,
  destinationLongitude: 129.0756,
  destinationPlaceId: 'trip-place-busan',
  startDate: '2026-10-02',
  endDate: '2026-10-07',
};

const HAEUNDAE = inspiration({
  id: 'insp-a',
  placeName: '海雲台',
  placeId: 'place-haeundae',
  latitude: 35.1587,
  longitude: 129.1604,
  sourceSliceId: 'slice-a',
  sourceNoteIds: ['note-a1', 'note-a2'],
  notes: [note('a1', '傍晚去比較漂亮'), note('a2', '可以沿海走到尾浦')],
});

const GAMCHEON = inspiration({
  id: 'insp-b',
  placeName: '甘川文化村',
  placeId: 'place-gamcheon',
  latitude: 35.0975,
  longitude: 129.0107,
  sourceSliceId: 'slice-b',
  sourceNoteIds: ['note-b1'],
  notes: [note('b1', '週末人很多', 'slice-b')],
});

const SHIBUYA = inspiration({
  id: 'insp-c',
  placeName: 'Shibuya Crossing',
  country: '日本',
  city: '東京',
  placeId: 'place-shibuya',
  latitude: 35.6595,
  longitude: 139.7005,
  sourcePostId: 'post-2',
  sourceSliceId: 'slice-c',
  sourceCreatorId: 'creator-2',
  sourceNoteIds: ['note-c1'],
  notes: [note('c1', '人潮最多的時段是傍晚', 'slice-c', 'post-2', 'creator-2')],
});

const BUSAN_FIXTURE = [HAEUNDAE, GAMCHEON, SHIBUYA];

describe('matchesTripDestination', () => {
  it('matches on coordinates when both sides have them', () => {
    expect(matchesTripDestination(HAEUNDAE, BUSAN_TRIP)).toMatchObject({ matched: true, basis: 'coordinates' });
  });

  it('rejects a far-away place even though its country string is never compared', () => {
    const result = matchesTripDestination(SHIBUYA, BUSAN_TRIP);
    expect(result.matched).toBe(false);
    expect(result.basis).toBe('coordinates');
    expect(result.distanceKm).toBeGreaterThan(500);
  });

  it('matches on placeId before anything else', () => {
    const cityLevelSave = inspiration({ id: 'insp-city', placeName: '釜山', placeId: 'trip-place-busan', latitude: 0, longitude: 0 });
    expect(matchesTripDestination(cityLevelSave, BUSAN_TRIP)).toEqual({ matched: true, basis: 'placeId' });
  });

  it('falls back to country aliases across languages when coordinates are missing', () => {
    const noCoordinates = { ...HAEUNDAE, latitude: undefined, longitude: undefined };
    const noTripCoordinates = { ...BUSAN_TRIP, destinationLatitude: undefined, destinationLongitude: undefined, destinationPlaceId: undefined };
    // 韓國 vs "South Korea" must match; 日本 vs "South Korea" must not.
    expect(matchesTripDestination(noCoordinates, noTripCoordinates).matched).toBe(true);
    expect(matchesTripDestination({ ...SHIBUYA, latitude: undefined, longitude: undefined }, noTripCoordinates)).toEqual({ matched: false, basis: 'country' });
  });

  it('ignores a zero-island coordinate pair instead of treating it as a real place', () => {
    const bogus = { ...HAEUNDAE, placeId: undefined, latitude: 0, longitude: 0 };
    expect(matchesTripDestination(bogus, BUSAN_TRIP).basis).not.toBe('coordinates');
  });

  it('hides a same-country city that is out of range on a city-scoped trip', () => {
    // Seoul is ~325km from Busan. Same country, but not this trip.
    const seoul = inspiration({ id: 'insp-seoul', placeName: '景福宮', city: '首爾', placeId: 'place-gyeongbok', latitude: 37.5796, longitude: 126.977 });
    expect(matchesTripDestination(seoul, BUSAN_TRIP)).toMatchObject({ matched: false, basis: 'coordinates' });
  });

  it('still reaches a distant same-country place when the trip destination is the country itself', () => {
    // Founder types 韓國 as the destination, so distance alone must not rule places out.
    const koreaTrip = { ...BUSAN_TRIP, destination: '韓國', destinationPlaceId: 'trip-place-korea' };
    const seoul = inspiration({ id: 'insp-seoul', placeName: '景福宮', city: '首爾', placeId: 'place-gyeongbok', latitude: 37.5796, longitude: 126.977 });
    expect(matchesTripDestination(seoul, koreaTrip)).toMatchObject({ matched: true, basis: 'country' });
    // A Japanese place must still be excluded from a Korea-scoped trip.
    expect(matchesTripDestination(SHIBUYA, koreaTrip).matched).toBe(false);
  });

  it('hides another city in the same country when neither side has coordinates', () => {
    const osakaTrip = { destination: '大阪', destinationCountry: '日本' };
    const tokyoSave = inspiration({ id: 'insp-tokyo', placeName: '淺草寺', country: '日本', city: '東京' });
    expect(matchesTripDestination(tokyoSave, osakaTrip)).toEqual({ matched: false, basis: 'text' });
  });

  it('does not hide a matching city just because the country spelling is unrecognised', () => {
    const trip = { destination: '釜山', destinationCountry: 'Korea, Republic of' };
    const save = inspiration({ id: 'insp-weird', placeName: '海雲台', country: '대한민국 (South Korea)' });
    expect(matchesTripDestination(save, trip)).toEqual({ matched: true, basis: 'text' });
  });

  it('hides a nearby place that is confidently in another country', () => {
    // Tsushima is ~50km from Busan — inside the radius, but it is Japan.
    const tsushima = inspiration({ id: 'insp-tsushima', placeName: '対馬', country: '日本', city: '對馬', placeId: 'place-tsushima', latitude: 34.4028, longitude: 129.3286 });
    const result = matchesTripDestination(tsushima, BUSAN_TRIP);
    expect(result.matched).toBe(false);
    expect(result.basis).toBe('country');
    expect(result.distanceKm).toBeLessThan(100);
  });

  it('does not treat one country name containing another as a match', () => {
    const guineaTrip = { destination: 'Conakry', destinationCountry: 'Guinea' };
    const equatorialSave = inspiration({ id: 'insp-eq', placeName: 'Malabo Cathedral', country: 'Equatorial Guinea', city: 'Malabo' });
    expect(matchesTripDestination(equatorialSave, guineaTrip).matched).toBe(false);
  });
});

describe('selectTripInspirationGroups — Busan acceptance fixture', () => {
  const groups = selectTripInspirationGroups(BUSAN_FIXTURE, BUSAN_TRIP);

  it('shows the Busan places and hides the Tokyo one', () => {
    expect(groups.map(group => group.placeName)).toEqual(['海雲台', '甘川文化村']);
  });

  it('reuses the saved place identity rather than flagging it for re-resolution', () => {
    expect(groups.map(group => group.placeId)).toEqual(['place-haeundae', 'place-gamcheon']);
    expect(groups.every(group => group.missingPlaceIdentity === false)).toBe(true);
  });

  it('keeps every note with its original attribution', () => {
    const [haeundae] = groups;
    expect(haeundae.experienceNotes.map(item => item.text)).toEqual(['傍晚去比較漂亮', '可以沿海走到尾浦']);
    expect(haeundae.experienceNotes.every(item => item.sourceCreatorId === 'creator-1' && item.sourcePostId === 'post-1' && item.sourceSliceId === 'slice-a')).toBe(true);
    expect(haeundae.experienceNotes.map(item => item.sourceNoteId)).toEqual(['note-a1', 'note-a2']);
  });

  it('does not mutate the saved store', () => {
    const snapshot = JSON.stringify(BUSAN_FIXTURE);
    selectTripInspirationGroups(BUSAN_FIXTURE, BUSAN_TRIP);
    expect(JSON.stringify(BUSAN_FIXTURE)).toBe(snapshot);
  });

  it('works for an anonymous user regardless of savedByUserId', () => {
    const anonymous = BUSAN_FIXTURE.map(item => ({ ...item, savedByUserId: 'anon-device-42' }));
    expect(selectTripInspirationGroups(anonymous, BUSAN_TRIP)).toHaveLength(2);
  });
});

describe('groupInspirationsByPlace', () => {
  it('folds two saves of the same place into one group and collapses duplicate source notes', () => {
    const duplicate = inspiration({
      id: 'insp-a2',
      placeName: '海雲台',
      placeId: 'place-haeundae',
      latitude: 35.1587,
      longitude: 129.1604,
      sourceNoteIds: ['note-a2', 'note-a3'],
      notes: [note('a2', '可以沿海走到尾浦'), note('a3', '週末人很多')],
    });
    const [group] = groupInspirationsByPlace([HAEUNDAE, duplicate]);
    expect(group.inspirationIds).toEqual(['insp-a', 'insp-a2']);
    expect(group.experienceNotes.map(item => item.sourceNoteId)).toEqual(['note-a1', 'note-a2', 'note-a3']);
  });

  it('groups by name when no placeId exists and reports the missing identity', () => {
    const unresolved = inspiration({ id: 'insp-d', placeName: '松島天空步道' });
    const [group] = groupInspirationsByPlace([unresolved]);
    expect(group.id).toBe('name:韓國|釜山|松島天空步道');
    expect(group.missingPlaceIdentity).toBe(true);
  });

  it('picks up place identity from a later save that has it', () => {
    const withoutIdentity = inspiration({ id: 'insp-e1', placeName: '松島天空步道' });
    const withIdentity = inspiration({ id: 'insp-e2', placeName: '松島天空步道', placeId: 'place-songdo', latitude: 35.0766, longitude: 129.0227 });
    const [group] = groupInspirationsByPlace([withoutIdentity, withIdentity]);
    expect(group.placeId).toBe('place-songdo');
    expect(group.missingPlaceIdentity).toBe(false);
  });

  it('keeps two different places apart when they share a name in the same city', () => {
    const first = inspiration({ id: 'insp-f1', placeName: '스타벅스', placeId: 'place-sb-seomyeon', latitude: 35.1579, longitude: 129.0594 });
    const second = inspiration({ id: 'insp-f2', placeName: '스타벅스', placeId: 'place-sb-haeundae', latitude: 35.1631, longitude: 129.1637 });
    const groups = groupInspirationsByPlace([first, second]);
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.id)).toEqual(['place:place-sb-seomyeon', 'place:place-sb-haeundae']);
  });

  it('leaves an unresolved save on its own when its name maps to more than one place', () => {
    const first = inspiration({ id: 'insp-g1', placeName: '스타벅스', placeId: 'place-sb-seomyeon' });
    const second = inspiration({ id: 'insp-g2', placeName: '스타벅스', placeId: 'place-sb-haeundae' });
    const ambiguous = inspiration({ id: 'insp-g3', placeName: '스타벅스' });
    const groups = groupInspirationsByPlace([first, second, ambiguous]);
    expect(groups).toHaveLength(3);
    expect(groups[2].id).toBe('name:韓國|釜山|스타벅스');
    expect(groups[2].inspirationIds).toEqual(['insp-g3']);
  });

  it('does not merge places that differ only by punctuation once they are resolved', () => {
    const hyphenated = inspiration({ id: 'insp-h1', placeName: 'Park-View', placeId: 'place-park-view' });
    const spaced = inspiration({ id: 'insp-h2', placeName: 'ParkView', placeId: 'place-parkview' });
    expect(groupInspirationsByPlace([hyphenated, spaced])).toHaveLength(2);
  });

  it('does not merge unresolved places that differ only by punctuation', () => {
    // Without a placeId the name is the only identity available, so it must not
    // be normalised down to a collision.
    const hyphenated = inspiration({ id: 'insp-i1', placeName: 'Park-View' });
    const spaced = inspiration({ id: 'insp-i2', placeName: 'ParkView' });
    const groups = groupInspirationsByPlace([hyphenated, spaced]);
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.id)).toEqual(['name:韓國|釜山|park-view', 'name:韓國|釜山|parkview']);
  });

  it('still folds the same unresolved place written with different spacing or case', () => {
    const spaced = inspiration({ id: 'insp-j1', placeName: '  Gamcheon  Culture   Village ' });
    const cased = inspiration({ id: 'insp-j2', placeName: 'gamcheon culture village' });
    expect(groupInspirationsByPlace([spaced, cased])).toHaveLength(1);
  });
});

describe('buildTripPlanningSelection', () => {
  const groups = selectTripInspirationGroups(BUSAN_FIXTURE, BUSAN_TRIP);

  const GAMCHEON_GROUP_ID = 'place:place-gamcheon';
  const HAEUNDAE_GROUP_ID = 'place:place-haeundae';

  it('selects by stable group id, not by position', () => {
    expect(groups.map(group => group.id)).toEqual([HAEUNDAE_GROUP_ID, GAMCHEON_GROUP_ID]);
    expect(buildTripPlanningSelection(groups, [GAMCHEON_GROUP_ID]).map(item => item.placeName)).toEqual(['甘川文化村']);
    // The same id still resolves after the underlying order changes.
    const reordered = selectTripInspirationGroups([SHIBUYA, GAMCHEON, HAEUNDAE], BUSAN_TRIP);
    expect(buildTripPlanningSelection(reordered, [GAMCHEON_GROUP_ID]).map(item => item.placeName)).toEqual(['甘川文化村']);
  });

  it('keeps the id fixed to the placeId regardless of which display name a save carries', () => {
    const renamed = { ...GAMCHEON, id: 'insp-b2', placeName: '甘川洞文化村', resolvedPlaceName: 'Gamcheon Culture Village' };
    const merged = selectTripInspirationGroups([GAMCHEON, renamed], BUSAN_TRIP);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(GAMCHEON_GROUP_ID);
    expect(merged[0].inspirationIds).toEqual(['insp-b', 'insp-b2']);
  });

  it('carries only the planning contract, never the community post payload', () => {
    const [selected] = buildTripPlanningSelection(groups, [HAEUNDAE_GROUP_ID]);
    expect(Object.keys(selected).sort()).toEqual([
      'address', 'city', 'coordinates', 'country', 'experienceNotes', 'groupId', 'inspirationIds', 'missingPlaceIdentity', 'placeId', 'placeName',
    ]);
  });

  it('returns nothing when no group is selected', () => {
    expect(buildTripPlanningSelection(groups, [])).toEqual([]);
  });
});

describe('buildTripPlanningInput', () => {
  it('produces the Founder preview payload for the Busan fixture', () => {
    const groups = selectTripInspirationGroups(BUSAN_FIXTURE, BUSAN_TRIP);
    const input = buildTripPlanningInput(BUSAN_TRIP, buildTripPlanningSelection(groups, groups.map(group => group.id)));

    expect(input.destination).toBe('釜山');
    expect(input.startDate).toBe('2026-10-02');
    expect(input.endDate).toBe('2026-10-07');
    expect(input.durationDays).toBe(6);
    expect(input.selections.map(item => item.placeName)).toEqual(['海雲台', '甘川文化村']);
    expect(input.selections.flatMap(item => item.experienceNotes.map(entry => entry.text))).toEqual([
      '傍晚去比較漂亮', '可以沿海走到尾浦', '週末人很多',
    ]);
    expect(input.selections.map(item => item.placeId)).toEqual(['place-haeundae', 'place-gamcheon']);
    expect(input.selections.map(item => item.coordinates?.latitude)).toEqual([35.1587, 35.0975]);
    expect(input.planningPreferences).toBeUndefined();
  });

  it('carries the trip-wide planning preferences the user typed', () => {
    const groups = selectTripInspirationGroups(BUSAN_FIXTURE, BUSAN_TRIP);
    const input = buildTripPlanningInput(
      BUSAN_TRIP,
      buildTripPlanningSelection(groups, groups.map(group => group.id)),
      '  釜山輕旅行。想安排汗蒸幕，每天11點才出門。有租車。  ',
    );

    expect(input.planningPreferences).toBe('釜山輕旅行。想安排汗蒸幕，每天11點才出門。有租車。');
    // Preferences are scheduling guidance only; they must not alter the selection set.
    expect(input.selections.map(item => item.placeName)).toEqual(['海雲台', '甘川文化村']);
  });

  it('omits a blank preference instead of sending an empty string', () => {
    const groups = selectTripInspirationGroups(BUSAN_FIXTURE, BUSAN_TRIP);
    const selections = buildTripPlanningSelection(groups, groups.map(group => group.id));

    expect(buildTripPlanningInput(BUSAN_TRIP, selections, '   ').planningPreferences).toBeUndefined();
    expect(buildTripPlanningInput(BUSAN_TRIP, selections, '').planningPreferences).toBeUndefined();
  });
});

describe('tripDurationDays', () => {
  it('counts both endpoints and rejects an inverted or partial range', () => {
    expect(tripDurationDays('2026-10-02', '2026-10-07')).toBe(6);
    expect(tripDurationDays('2026-10-02', '2026-10-02')).toBe(1);
    expect(tripDurationDays('2026-10-07', '2026-10-02')).toBeUndefined();
    expect(tripDurationDays('2026-10-02', undefined)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Already-in-itinerary state
 * ------------------------------------------------------------------ */

describe('selectPlannedInspirationGroupIds', () => {
  const group = (
    id: string,
    overrides: Partial<TripInspirationPlaceGroup> = {},
  ): TripInspirationPlaceGroup => ({
    id,
    placeName: 'Place',
    country: '韓國',
    city: '釜山',
    inspirationIds: [],
    experienceNotes: [],
    missingPlaceIdentity: false,
    matchBasis: 'placeId',
    ...overrides,
  });

  const itineraryItem = (overrides: Partial<ItineraryItem> = {}): ItineraryItem => ({
    id: 'it-1', time: '09:00', title: 'X', location: 'X', notes: '', type: 'ACTIVITY', ...overrides,
  });

  it('matches on placeId, the strongest identity', () => {
    const planned = selectPlannedInspirationGroupIds(
      [group('g-beach', { placeId: 'X', placeName: '海雲台海水浴場' }), group('g-other', { placeId: 'Y', placeName: '甘川文化村' })],
      [itineraryItem({ placeId: 'X' })],
    );
    expect([...planned]).toEqual(['g-beach']);
  });

  it('falls back to saved inspiration ids when the place has no placeId', () => {
    const planned = selectPlannedInspirationGroupIds(
      [group('g-noid', { inspirationIds: ['insp-1', 'insp-2'] })],
      [itineraryItem({ sourceInspirationIds: ['insp-2'] })],
    );
    expect([...planned]).toEqual(['g-noid']);
  });

  it('never treats a shared place name as proof', () => {
    // Two different 國際市場 are two different places. Greying the saved one on a
    // name match would hide somewhere the user still wants to go.
    const planned = selectPlannedInspirationGroupIds(
      [group('g-saved', { placeId: 'saved-market', placeName: '國際市場', inspirationIds: ['insp-1'] })],
      [itineraryItem({ title: '國際市場', location: '國際市場', placeId: 'a-different-market' })],
    );
    expect(planned.size).toBe(0);
  });

  it('ignores an itinerary item with no identity at all', () => {
    const planned = selectPlannedInspirationGroupIds(
      [group('g-a', { placeId: 'X', placeName: '海雲台海水浴場' })],
      [itineraryItem({ title: '海雲台海水浴場', location: '海雲台海水浴場' })],
    );
    expect(planned.size).toBe(0);
  });

  it('returns nothing for an empty itinerary or empty group list', () => {
    expect(selectPlannedInspirationGroupIds([group('g-a', { placeId: 'X' })], []).size).toBe(0);
    expect(selectPlannedInspirationGroupIds([], [itineraryItem({ placeId: 'X' })]).size).toBe(0);
  });

  it('marks every group the itinerary covers, and only those', () => {
    const planned = selectPlannedInspirationGroupIds(
      [
        group('g-1', { placeId: 'X' }),
        group('g-2', { inspirationIds: ['insp-9'] }),
        group('g-3', { placeId: 'Z' }),
      ],
      [itineraryItem({ id: 'a', placeId: 'X' }), itineraryItem({ id: 'b', sourceInspirationIds: ['insp-9'] })],
    );
    expect([...planned].sort()).toEqual(['g-1', 'g-2']);
  });
});
