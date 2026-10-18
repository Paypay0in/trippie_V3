import React from 'react';
import { NotebookPen } from 'lucide-react';
import { usePlacePhotos } from './usePlacePhotos';

/**
 * Suggested places, as cards rather than a sentence of names.
 *
 * 「這個我就希望像收藏卡片一樣 有帶入圖片 店名 一些旅行筆記讓用戶可以有想法 不然只列
 * 餐廳名稱怎麼知道」.
 *
 * 「這一帶還有：一蘭 淺草店（★ 4.3）、紅鶴（★ 4）、淺草 炸牛（★ 4.8）」 is three
 * names and three numbers. Nobody picks a restaurant from that — the collection
 * screen worked this out long ago and shows a photo, a name and the notes kept
 * about it, which is the whole reason a saved place is recognisable at all.
 *
 * The same card either way. A place from the collection brings its own notes;
 * one from Google brings a rating and no notes, and says so rather than
 * pretending the gap is a fact about the restaurant.
 */

export interface SuggestedPlace {
  id: string;
  placeName: string;
  /** Used to fetch a photo when the place did not bring one. */
  placeId?: string;
  photoUrl?: string;
  notes?: string[];
  rating?: number;
  /** 拉麵店, 咖啡 — what kind of place it is. 「告訴我是哪類餐廳」. */
  kind?: string;
  /** 「少繞 1.2 公里」, where it is known. */
  detourLabel?: string;
}

interface Props {
  places: SuggestedPlace[];
  onPick?: (place: SuggestedPlace) => void;
}

/** Two lines of note is enough to recognise a place from. */
const NOTE_PREVIEW = 2;

const SuggestedPlaceCards: React.FC<Props> = ({ places, onPick }) => {
  /*
    One lookup per place that did not bring a picture, shared with the picker.
    See `usePlacePhotos`.
  */
  const photos = usePlacePhotos(places.filter(place => !place.photoUrl).map(place => place.placeId));

  if (places.length === 0) return null;

  return (
    <ul data-testid="suggested-place-cards" className="mt-1.5 space-y-1.5">
      {places.map(place => {
        const imageUrl = place.photoUrl || (place.placeId ? photos[place.placeId] : undefined);
        const notes = place.notes || [];
        return (
          <li key={place.id}>
            <button
              type="button"
              data-testid={`suggested-place-${place.id}`}
              disabled={!onPick}
              onClick={() => onPick?.(place)}
              className="flex w-full gap-2.5 rounded-2xl border border-[#eceaf5] bg-white p-2 text-left disabled:cursor-default"
            >
              {/*
                A placeholder rather than a gap: a row that is sometimes 56px
                tall and sometimes not is a list that jumps while it is read.
              */}
              {imageUrl
                ? <img src={imageUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                : <div className="h-14 w-14 shrink-0 rounded-xl bg-slate-100" />}

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-black text-[#11183d]">{place.placeName}</span>
                  {typeof place.rating === 'number' && (
                    <span className="shrink-0 text-[10px] font-black text-amber-600">★ {place.rating}</span>
                  )}
                </span>
                {(place.kind || place.detourLabel) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] font-bold">
                    {place.kind && <span className="text-slate-500">{place.kind}</span>}
                    {place.detourLabel && <span className="text-[#5b3df5]">{place.detourLabel}</span>}
                  </span>
                )}
                {notes.length > 0 ? (
                  <span className="mt-0.5 block">
                    {notes.slice(0, NOTE_PREVIEW).map(note => (
                      <span key={note} className="flex items-start gap-1 text-[10px] leading-4 text-slate-500">
                        <NotebookPen size={9} className="mt-[3px] shrink-0 text-violet-300" />
                        <span className="min-w-0 flex-1 break-words">{note}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  /*
                    Said, not hidden. A Google result has no note because
                    nobody saved it yet, and that is a fact about the
                    collection rather than about the restaurant.
                  */
                  <span className="mt-0.5 block text-[10px] text-slate-300">還不是你的收藏，沒有筆記</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default SuggestedPlaceCards;
