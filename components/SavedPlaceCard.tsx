import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Copy, Globe, MapPin, Navigation, Star, X } from 'lucide-react';
import { SavedExperienceNote } from '../types';
import { MappablePlace, placeCopyText, placeDirectionsUrl, placeMapsUrl } from '../services/placeLinks';
import { fetchPlaceBasics, hoursForToday, PlaceBasics, summarizePlaceBasics } from '../services/placeBasicsService';

/**
 * A saved place, opened.
 *
 * 「收藏的景點 應該要點擊後就跳出小卡 讓用戶可以轉跳到 Google 地圖等 不然很不友善」.
 * The list is for choosing between places; this is for finding out what one of
 * them is and then going there. Both are needed, and neither is the other: a
 * row that showed everything would be unreadable at twelve restaurants.
 *
 * It opens on top rather than expanding in place so the whole of it is in
 * reach on a phone — the thing a traveller wants here is a button to the map,
 * and a list that grew downward would put it below the fold.
 */

interface Props {
  place: MappablePlace;
  /** Every point saved with the place. Nothing is collapsed here. */
  notes: SavedExperienceNote[];
  onClose: () => void;
}

const SavedPlaceCard: React.FC<Props> = ({ place, notes, onClose }) => {
  const [copied, setCopied] = useState(false);
  /*
    What Google knows, for the places the traveller saved nothing about.

    「這個你要基本查一些資訊 不能讓這個行程空白」. Looked up when the card opens
    rather than when the list renders: twelve lookups to fill twelve rows that
    may never be tapped is somebody else's API bill and a slower list.
  */
  const [basics, setBasics] = useState<PlaceBasics | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBasics(null);
    void fetchPlaceBasics(place.placeId).then(found => { if (!cancelled) setBasics(found); });
    return () => { cancelled = true; };
  }, [place.placeId]);

  const basicsLine = summarizePlaceBasics(basics);
  const todayHours = hoursForToday(basics);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(placeCopyText(place));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // A denied clipboard is not worth an error dialog: the address is on
      // screen and can be read off it.
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center"
      onClick={onClose}
      data-testid="saved-place-card-overlay"
    >
      <div
        role="dialog"
        aria-label={place.placeName}
        data-testid="saved-place-card"
        onClick={event => event.stopPropagation()}
        className="w-full max-w-md rounded-[28px] border border-slate-100 bg-white p-4 shadow-[0_24px_70px_rgba(17,26,74,0.18)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black leading-6 text-[#11183d]">{place.placeName}</h3>
            <p className="mt-1 flex items-start gap-1.5 text-[11px] font-medium text-slate-500">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                {place.formattedAddress || [place.city, place.country].filter(Boolean).join('・')}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400"
          >
            <X size={16} />
          </button>
        </div>

        {/*
          Said plainly when the save never resolved to a real place.

          Without an id or a point the buttons below are a search, and a search
          can land on the wrong branch of the same chain. Telling the reader
          that is cheaper than them finding out at the door.
        */}
        {!place.placeId && !place.coordinates && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            這個收藏還沒對到地圖上的地點，以下連結是用名稱搜尋，請確認是不是同一家。
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={placeMapsUrl(place)}
            target="_blank"
            rel="noreferrer"
            data-testid="saved-place-maps-link"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#5b3df5] text-sm font-black text-white"
          >
            <MapPin size={15} />在 Google 地圖開啟
          </a>
          <a
            href={placeDirectionsUrl(place)}
            target="_blank"
            rel="noreferrer"
            data-testid="saved-place-directions-link"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 text-sm font-black text-[#11183d]"
          >
            <Navigation size={15} />路線
          </a>
        </div>

        <button
          type="button"
          onClick={copy}
          data-testid="saved-place-copy"
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-slate-50 text-xs font-black text-slate-600"
        >
          <Copy size={13} />{copied ? '已複製' : place.formattedAddress ? '複製地址' : '複製店名'}
        </button>

        {/*
          Google's own facts, kept visibly separate from what a person wrote.

          Labelled as coming from Google because that is the difference that
          matters: a note is somebody's experience of the place, this is the
          record. Mixing them would make both less trustworthy.
        */}
        {(basicsLine || basics?.summary || todayHours || basics?.website) && (
          <div data-testid="place-basics" className="mt-4 space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Google 基本資料</div>
            {basics?.summary && <p className="text-xs leading-5 text-slate-700">{basics.summary}</p>}
            {basicsLine && (
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Star size={11} className="shrink-0 text-amber-500" />{basicsLine}
              </p>
            )}
            {todayHours && (
              <p className="flex items-start gap-1.5 text-[11px] font-medium text-slate-600">
                <Clock3 size={11} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  今日 {todayHours}
                  {basics?.openNow !== undefined && (
                    <span className={`ml-1.5 font-black ${basics.openNow ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {basics.openNow ? '營業中' : '休息中'}
                    </span>
                  )}
                </span>
              </p>
            )}
            {basics?.website && (
              <a
                href={basics.website}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-black text-[#5b3df5]"
              >
                <Globe size={11} />官方網站
              </a>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">重點</div>
            {notes.map(note => (
              <div key={note.id} className="flex items-start gap-1.5 rounded-lg bg-violet-50/75 px-2 py-1.5 text-xs leading-5 text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                <p className="min-w-0 flex-1 break-words">{note.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedPlaceCard;
