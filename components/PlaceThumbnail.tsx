import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunityPost, SavedTravelInspiration } from '../types';
import { resolveSavedPlaceImage, SavedPlaceImageResult } from '../services/savedPlaceImageService';

/**
 * A saved place's picture, with the four fallbacks it has always had.
 *
 * 「要有圖」 — the 規劃 shortlist drew twenty-six restaurants as names, a tag
 * and a note. A photo is how a place is recognised; without it a list of
 * twenty-six is twenty-six strings to read in full.
 *
 * Lifted out of the collection detail screen rather than written again. The
 * fallbacks are the stored photo, the source post's cover, Google's photo for
 * that place id, then a stock image — and this project has now lost that chain
 * four times by rebuilding it one field at a time somewhere else.
 *
 * `resolveSavedPlaceImage` caches per place for the life of the page, across
 * every screen using it, so a collection opened before this one costs nothing
 * here.
 */
export const PlaceThumbnail: React.FC<{
  saved: SavedTravelInspiration;
  sourcePost?: CommunityPost;
  /** Side length in pixels. The collection uses 112; a list row wants less. */
  size?: number;
  className?: string;
}> = ({ saved, sourcePost, size = 112, className = 'rounded-[14px]' }) => {
  const { t } = useTranslation();
  const [imageResult, setImageResult] = useState<SavedPlaceImageResult | null>(
    sourcePost?.coverImage
      ? { imageUrl: sourcePost.coverImage, source: 'source_post', query: saved.placeName }
      : null,
  );
  const [loading, setLoading] = useState(!sourcePost?.coverImage);

  useEffect(() => {
    let active = true;
    if (sourcePost?.coverImage) return () => { active = false; };
    setLoading(true);
    resolveSavedPlaceImage(saved, sourcePost).then(result => {
      if (active) { setImageResult(result); setLoading(false); }
    });
    return () => { active = false; };
  }, [saved, sourcePost]);

  const fallback = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=500&q=80';
  const imageUrl = imageResult?.imageUrl || fallback;

  return (
    /* Spans, so this can sit inside the button that opens the place. */
    <span className="block shrink-0">
      {/*
        A placeholder of the same size, never a gap: a row that is sometimes
        56px tall and sometimes not is a list that jumps while it is read.
      */}
      <span className="relative block" style={{ height: size, width: size }}>
        {loading
          ? <span className={`block h-full w-full animate-pulse bg-slate-100 ${className}`} aria-label={t('places.imageLoading')} />
          : <img src={imageUrl} alt={saved.placeName} loading="lazy" className={`h-full w-full object-cover ${className}`} />}
      </span>
    </span>
  );
};

export default PlaceThumbnail;
