import { ExperienceNoteType, SavedTravelInspiration } from '../types';

export const SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY = 'trippie_saved_travel_inspirations_v1';

const CATEGORIES = ['food', 'cafe', 'stay', 'sight', 'shop', 'transport', 'other'];

const normalize = (value: unknown): SavedTravelInspiration | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  /*
    What a saved place has to have to be a saved place.

    「我原本存 40 個」, and the collection was down to twenty-two.

    This gate used to require nine non-empty strings, `country` and `city`
    among them — and 「把這 N 個退回未對應」 writes `country: undefined` and
    `city: undefined` onto every record it touches, by design, because the
    whole point is to forget a wrong map binding. `JSON.stringify` omits an
    undefined key, the record came back without one, this returned `null`, and
    the `.filter` below deleted it. The standing effect then wrote the
    shortened list back to storage, so one reload made it permanent — and the
    sync prune, seeing records that had locally disappeared, deleted the server
    rows too.

    The button says 「只清掉地圖對應，店名和你寫的筆記都留著」. It destroyed them.

    A record's identity is its `id` and the name of the place. Where it is, who
    posted it and when it was saved are facts *about* it: a record missing one
    is a record with a gap, not a record that never existed. They are read as
    empty strings now, which is also what every other screen already handles —
    `savedElsewhere` skips a blank country, the backfill exists precisely to
    fill them in.
  */
  if (!['id', 'placeName'].every(key => typeof source[key] === 'string' && Boolean(source[key]))) return null;
  const text = (key: string): string => (typeof source[key] === 'string' ? source[key] as string : '');
  const notes = Array.isArray(source.notes) ? source.notes.filter(note => note && typeof note === 'object').map(note => {
    const item = note as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.sourceNoteId === 'string' && typeof item.sourceSliceId === 'string' && typeof item.sourcePostId === 'string' && typeof item.sourceCreatorId === 'string' && typeof item.text === 'string'
      ? { id: item.id, sourceNoteId: item.sourceNoteId, sourceSliceId: item.sourceSliceId, sourcePostId: item.sourcePostId, sourceCreatorId: item.sourceCreatorId, type: item.type as ExperienceNoteType, text: item.text }
      : null;
  }).filter(Boolean) as SavedTravelInspiration['notes'] : [];
  const sourceNoteIds = Array.from(new Set(
    (Array.isArray(source.sourceNoteIds) ? source.sourceNoteIds : notes.map(note => note.sourceNoteId))
      .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
  ));
  return { id: source.id as string, savedByUserId: text('savedByUserId'), country: text('country'), city: text('city'), placeName: source.placeName as string, placeId: typeof source.placeId === 'string' ? source.placeId : undefined, resolvedPlaceName: typeof source.resolvedPlaceName === 'string' ? source.resolvedPlaceName : undefined, formattedAddress: typeof source.formattedAddress === 'string' ? source.formattedAddress : undefined, latitude: typeof source.latitude === 'number' ? source.latitude : undefined, longitude: typeof source.longitude === 'number' ? source.longitude : undefined, placePhotoUrl: typeof source.placePhotoUrl === 'string' ? source.placePhotoUrl : undefined, sourcePostId: text('sourcePostId'), sourceSliceId: text('sourceSliceId'), sourceCreatorId: text('sourceCreatorId'), sourceNoteIds, savedAt: text('savedAt'), notes,
    /*
      Fields added to the record after this whitelist was written.

      「標籤出現又消失」. This rebuilds every saved place field by field out of
      localStorage, and anything it does not name is dropped — so the 🏷️ tag,
      the ward and the lookup stamp were erased on every single page load,
      signed in or not. 補齊 would write them, the screen would show them, and
      the next reload would take them away again.

      It is also why an area heading kept reverting to the place name（`district`
      gone）and why 補齊 never finished counting down（`placeResolvedAt` gone, so
      every record looked unasked again）.

      Validated like the rest rather than trusted: a hand-edited store should
      not be able to put an arbitrary string into a typed field.
    */
    category: CATEGORIES.includes(source.category as string) ? source.category as SavedTravelInspiration['category'] : undefined,
    categoryRules: typeof source.categoryRules === 'number' ? source.categoryRules : undefined,
    district: typeof source.district === 'string' ? source.district : undefined,
    placeResolvedAt: typeof source.placeResolvedAt === 'string' ? source.placeResolvedAt : undefined,
    /*
      Every recommendation behind this place, where the record has them.

      Named here because this whitelist drops what it does not name — the
      reason the 🏷️ tag and the ward kept vanishing on reload. A field holding
      who recommended a place would have been erased the same way, which is
      the exact loss this field was added to stop.

      Absent on a record written before it existed, and left absent: `sourcesOf`
      derives the one source such a record implies, so nothing is invented here
      and nothing has to be migrated. Validated per entry rather than trusted,
      like the rest.
    */
    ...(Array.isArray(source.sources)
      ? {
          sources: (source.sources as unknown[]).flatMap(entry => {
            const item = entry as Record<string, unknown> | null;
            if (!item || typeof item !== 'object') return [];
            if (typeof item.sourceType !== 'string' || !item.sourceType.trim()) return [];
            if (typeof item.sourceId !== 'string' || !item.sourceId.trim()) return [];
            return [{
              sourceType: item.sourceType,
              sourceId: item.sourceId,
              ...(typeof item.sourceItemId === 'string' && item.sourceItemId
                ? { sourceItemId: item.sourceItemId } : {}),
              sourceCreatorId: typeof item.sourceCreatorId === 'string' ? item.sourceCreatorId : '',
              ...(typeof item.firstSeenAt === 'string' && item.firstSeenAt
                ? { firstSeenAt: item.firstSeenAt } : {}),
            }];
          }),
        }
      : {}) };
};

export const loadSavedTravelInspirations = (): SavedTravelInspiration[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalize).filter((item): item is SavedTravelInspiration => Boolean(item)) : [];
  } catch { return []; }
};

export const saveSavedTravelInspirations = (items: SavedTravelInspiration[]) => {
  localStorage.setItem(SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY, JSON.stringify(items));
};
