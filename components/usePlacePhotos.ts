import { useEffect, useState } from 'react';
import { fetchPlacePhoto } from '../services/placePhotoService';

/**
 * Photos for places that did not bring one.
 *
 * 「這為啥都沒圖」. The collection card resolves an image through four fallbacks
 * — the photo saved with the record, the source post's cover, Google's photo
 * for that place id, then a stock image. Every screen built since then read
 * only the first of those, and most saves do not have it, so they showed a
 * grey square beside a name.
 *
 * This is the second of those steps, which is the one that actually fills the
 * gap: a saved place almost always has a `placeId`, and `fetchPlacePhoto`
 * caches on both sides, so a screen reopened costs nothing.
 *
 * Deliberately only asked for the places being shown. A collection of fifty
 * would be fifty requests to render a list somebody scrolls past.
 */
export const usePlacePhotos = (placeIds: Array<string | undefined>): Record<string, string> => {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  // A string, so the effect does not re-run on every render of a new array.
  const wanted = placeIds.filter(Boolean).join('|');

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    void Promise.all(wanted.split('|').map(async placeId => {
      const photo = await fetchPlacePhoto(placeId);
      return photo?.imageUrl ? [placeId, photo.imageUrl] as const : null;
    })).then(found => {
      if (cancelled) return;
      const resolved = found.filter((entry): entry is readonly [string, string] => entry !== null);
      if (resolved.length === 0) return;
      setPhotos(current => ({ ...current, ...Object.fromEntries(resolved) }));
    });

    return () => { cancelled = true; };
  }, [wanted]);

  return photos;
};
