import { CommunityPost, SavedTravelInspiration } from '../types';
import { fetchPlacePhoto } from './placePhotoService';
import { fetchDestinationImage } from './destinationImageService';

export type SavedPlaceImageResult = {
  imageUrl: string | null;
  source: 'source_post' | 'place_photo' | 'free_image' | 'destination_fallback' | 'none';
  query: string;
};

const fallbackImage = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=500&q=80';
const resultCache = new Map<string, SavedPlaceImageResult>();
const pending = new Map<string, Promise<SavedPlaceImageResult>>();

export const resolveSavedPlaceImage = (saved: SavedTravelInspiration, sourcePost?: CommunityPost): Promise<SavedPlaceImageResult> => {
  const query = `${saved.placeName} ${saved.city} ${saved.country}`.replace(/\s+/g, ' ').trim();
  const key = saved.placeId || `${saved.country}|${saved.city}|${saved.placeName}`;
  const cached = resultCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = (async (): Promise<SavedPlaceImageResult> => {
    if (saved.placePhotoUrl) return { imageUrl: saved.placePhotoUrl, source: 'place_photo', query };
    if (sourcePost?.coverImage) return { imageUrl: sourcePost.coverImage, source: 'source_post', query };
    if (saved.placeId) {
      const placePhoto = await fetchPlacePhoto(saved.placeId);
      if (placePhoto?.imageUrl) return { imageUrl: placePhoto.imageUrl, source: 'place_photo', query };
    }
    const placeImage = await fetchDestinationImage(query);
    if (placeImage?.imageUrl) return { imageUrl: placeImage.imageUrl, source: 'free_image', query };
    const destinationImage = await fetchDestinationImage(`${saved.city} ${saved.country}`);
    if (destinationImage?.imageUrl) return { imageUrl: destinationImage.imageUrl, source: 'destination_fallback', query: `${saved.city} ${saved.country}` };
    return { imageUrl: fallbackImage, source: 'none', query };
  })();
  pending.set(key, request);
  return request.then(result => { resultCache.set(key, result); pending.delete(key); return result; });
};
