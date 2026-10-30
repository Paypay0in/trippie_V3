import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlacePhoto } from '../services/placePhotoService';

/**
 * The photos of a place, at the top of the card that opens it.
 *
 * 「我預期點擊下去應該是這樣 請100%還原」 — a restaurant is chosen by looking at
 * it, and the card that opened one had no picture at all.
 *
 * Google was already asked for every photo it holds on the same request that
 * fetched the thumbnail; only the first was ever read. So this is the set that
 * was always there, capped at six by the server.
 *
 * The counter is shown rather than implied. A strip of thumbnails says there
 * are more pictures; 「1 / 6」 says how many more, which is the difference
 * between scrolling on and knowing you have seen them all.
 */

interface Props {
  photos: PlacePhoto[];
  /** What the place is called, for the alt text of a picture of it. */
  placeName: string;
}

/** Thumbnails drawn before the rest collapse into 「+2」. */
const STRIP = 4;

const PlaceGallery: React.FC<Props> = ({ photos, placeName }) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  // A different place starts at its own first photo, not at the last one's.
  useEffect(() => { setIndex(0); }, [photos[0]?.imageUrl]);

  if (photos.length === 0) return null;
  const shown = photos[Math.min(index, photos.length - 1)];
  const strip = photos.slice(0, STRIP);
  const rest = photos.length - strip.length;

  return (
    <div data-testid="place-gallery" className="overflow-hidden rounded-2xl bg-slate-100">
      <div className="relative">
        <img
          src={shown.imageUrl}
          alt={placeName}
          data-testid="place-gallery-main"
          className="h-48 w-full object-cover"
        />
        {photos.length > 1 && (
          <span
            data-testid="place-gallery-count"
            className="absolute left-2 top-2 rounded-lg bg-slate-900/65 px-2 py-0.5 text-[11px] font-black text-white"
          >
            {index + 1} / {photos.length}
          </span>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto p-1.5">
          {strip.map((photo, position) => (
            <button
              key={photo.imageUrl}
              type="button"
              aria-label={t('places.galleryPhotoAria', { place: placeName, index: position + 1 })}
              data-testid={`place-gallery-thumb-${position}`}
              onClick={() => setIndex(position)}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${position === index ? 'border-[#5b3df5]' : 'border-transparent'}`}
            >
              <img src={photo.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
          {/*
            The overflow is a button to the first photo it is hiding, not a
            label. A count somebody cannot act on is decoration.
          */}
          {rest > 0 && (
            <button
              type="button"
              data-testid="place-gallery-more"
              onClick={() => setIndex(STRIP)}
              className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 border-transparent"
            >
              <img src={photos[STRIP].imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/55 text-[11px] font-black text-white">
                +{rest}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PlaceGallery;
