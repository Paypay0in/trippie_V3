import { ExperienceNoteType, SavedTravelInspiration } from '../types';

export const SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY = 'trippie_saved_travel_inspirations_v1';

const normalize = (value: unknown): SavedTravelInspiration | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (!['id', 'savedByUserId', 'country', 'city', 'placeName', 'sourcePostId', 'sourceSliceId', 'sourceCreatorId', 'savedAt'].every(key => typeof source[key] === 'string' && Boolean(source[key]))) return null;
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
  return { id: source.id as string, savedByUserId: source.savedByUserId as string, country: source.country as string, city: source.city as string, placeName: source.placeName as string, placeId: typeof source.placeId === 'string' ? source.placeId : undefined, resolvedPlaceName: typeof source.resolvedPlaceName === 'string' ? source.resolvedPlaceName : undefined, formattedAddress: typeof source.formattedAddress === 'string' ? source.formattedAddress : undefined, latitude: typeof source.latitude === 'number' ? source.latitude : undefined, longitude: typeof source.longitude === 'number' ? source.longitude : undefined, placePhotoUrl: typeof source.placePhotoUrl === 'string' ? source.placePhotoUrl : undefined, sourcePostId: source.sourcePostId as string, sourceSliceId: source.sourceSliceId as string, sourceCreatorId: source.sourceCreatorId as string, sourceNoteIds, savedAt: source.savedAt as string, notes };
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
