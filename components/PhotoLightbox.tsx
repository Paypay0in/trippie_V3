/**
 * One photograph, full screen.
 *
 * 「點擊照片能讓他變大嗎」 — the day's photos are 64px squares, which is enough
 * to recognise a picture and not nearly enough to look at one. A receipt in
 * particular is unreadable at that size, and reading it back is most of why it
 * was photographed.
 *
 * Written once, here, rather than inside the day timeline: the collection's
 * card, the ledger and the shopping list all show photographs at thumbnail
 * size too, and this project has already rebuilt one photo chain four times in
 * four places.
 *
 * Deliberately not a gallery with thumbnails: `PlaceGallery` is that, and it
 * is an inline component for browsing a place's pictures. This is for looking
 * at one of them.
 */
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { OVERLAY } from '../constants/layers';

interface Props {
  photos: string[];
  /** Which one is open. Out-of-range is clamped rather than blank. */
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}

const PhotoLightbox: React.FC<Props> = ({ photos, index, onIndex, onClose }) => {
  const { t } = useTranslation();
  const at = Math.min(Math.max(index, 0), Math.max(0, photos.length - 1));

  /*
    Escape closes and the arrows move, because a phone is not the only thing
    this runs on and a full-screen overlay with no keyboard way out is a trap
    on a laptop.
  */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && at > 0) onIndex(at - 1);
      if (event.key === 'ArrowRight' && at < photos.length - 1) onIndex(at + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, photos.length, onIndex, onClose]);

  if (photos.length === 0) return null;

  return (
    <div
      data-testid="photo-lightbox"
      role="dialog"
      aria-label={t('common.photo')}
      className={`fixed inset-0 ${OVERLAY.alert} flex items-center justify-center bg-black/95`}
      onClick={onClose}
    >
      <img
        data-testid="photo-lightbox-image"
        src={photos[at]}
        alt=""
        className="max-h-full max-w-full object-contain"
        onClick={event => event.stopPropagation()}
      />

      <button
        type="button"
        aria-label={t('common.close')}
        data-testid="photo-lightbox-close"
        /* Stopped, or the backdrop behind it closes a second time. */
        onClick={event => { event.stopPropagation(); onClose(); }}
        className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <X size={20} />
      </button>

      {photos.length > 1 && (
        <>
          <span
            data-testid="photo-lightbox-count"
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white"
            style={{ top: 'max(0.95rem, env(safe-area-inset-top))' }}
          >
            {at + 1} / {photos.length}
          </span>
          {at > 0 && (
            <button
              type="button"
              aria-label={t('common.previousPhoto')}
              data-testid="photo-lightbox-prev"
              onClick={event => { event.stopPropagation(); onIndex(at - 1); }}
              className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {at < photos.length - 1 && (
            <button
              type="button"
              aria-label={t('common.nextPhoto')}
              data-testid="photo-lightbox-next"
              onClick={event => { event.stopPropagation(); onIndex(at + 1); }}
              className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default PhotoLightbox;
