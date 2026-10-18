import React, { useMemo, useState } from 'react';
import { Check, NotebookPen, Search, X } from 'lucide-react';
import { BOTTOM_NAV_CLEARANCE } from './AppBottomNav';
import { CATEGORY_LABELS } from '../services/placeCategory';
import { PlaceCategory } from '../types';

/**
 * Choosing a saved place, with the reason it was saved in front of you.
 *
 * 「我突然覺得這個下拉式選單是不足夠的 應該要 pop up 一個視窗讓用戶滑看筆記跟圖片才會
 * 知道」.
 *
 * The dropdown offered fifty names. A name is what a place is called, not what
 * it is — 「Lonich,」 and 「proto 器とタカラモノ」 say nothing about whether this is
 * the afternoon for them. The note somebody kept and the photo it came with
 * are the whole reason it is in the collection, and both were already loaded.
 *
 * Still grouped by ward, because the question the planner asks is 「what can I
 * do near here」 and the answer is still geography first.
 */

export interface PickablePlace {
  id: string;
  placeName: string;
  category?: PlaceCategory;
  district?: string;
  areaLabel?: string;
  alreadyPlanned?: boolean;
  photoUrl?: string;
  notes?: string[];
}

interface Props {
  title: string;
  places: PickablePlace[];
  /** Ordered as the slot wants them; the sheet keeps that order inside a ward. */
  onPick: (placeId: string) => void;
  onClose: () => void;
  /** Offered when something is already in this slot. */
  onClear?: () => void;
  onTypeYourOwn?: () => void;
}

/** Two lines of note is enough to recognise a place; the rest is in the card. */
const NOTE_PREVIEW = 2;

const PlacePickerSheet: React.FC<Props> = ({ title, places, onPick, onClose, onClear, onTypeYourOwn }) => {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const wanted = query.trim().toLocaleLowerCase();
    const matching = wanted
      ? places.filter(place =>
        place.placeName.toLocaleLowerCase().includes(wanted)
        || (place.notes || []).some(note => note.toLocaleLowerCase().includes(wanted)))
      : places;

    const byWard: Array<{ label: string; places: PickablePlace[] }> = [];
    const index = new Map<string, { label: string; places: PickablePlace[] }>();
    matching.forEach(place => {
      const label = place.district?.trim() || place.areaLabel?.trim() || '其他';
      let group = index.get(label);
      if (!group) { group = { label, places: [] }; index.set(label, group); byWard.push(group); }
      group.places.push(place);
    });
    // 「其他」 says nothing, so it goes last.
    return [...byWard.filter(g => g.label !== '其他'), ...byWard.filter(g => g.label === '其他')];
  }, [places, query]);

  /*
    「縮小 目前太滿版 跟底下導覽列重疊了」.

    The floating nav sits above the bottom edge and its raised + button stands
    proud of it again, so 「the bottom of the screen」 is not somewhere a sheet
    may end. `BOTTOM_NAV_CLEARANCE` is the one place that knows how much room
    it needs; a number copied here would be a number that stops being right the
    next time the bar changes.

    z-40 rather than z-50: the nav is z-50, and a sheet that covers the way out
    is worse than one that stops short of it.
  */
  return (
    <div
      data-testid="place-picker"
      className={`fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4 ${BOTTOM_NAV_CLEARANCE} sm:pb-4`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-[28px] bg-white shadow-2xl sm:max-h-[80vh]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-sm font-black text-[#11183d]">{title}</h2>
          <button type="button" aria-label="關閉" onClick={onClose} className="shrink-0 rounded-full p-1.5 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <label className="mx-4 mt-2 flex items-center gap-1.5 rounded-xl border border-[#e5e5ef] bg-white px-2.5">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            data-testid="place-picker-search"
            aria-label="搜尋收藏"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="找地點或筆記裡的字"
            className="min-w-0 flex-1 bg-transparent py-2 text-xs text-[#11183d] outline-none placeholder:text-slate-300"
          />
        </label>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {groups.length === 0 && (
            <p className="py-8 text-center text-xs font-bold text-slate-400">
              {query.trim() ? '收藏裡沒有符合的地點。' : '這趟旅程還沒有收藏的地點。'}
            </p>
          )}

          {groups.map(group => (
            <section key={group.label} className="mt-3 first:mt-0">
              <h3 className="text-[11px] font-black text-slate-400">{group.label}</h3>
              <ul className="mt-1.5 space-y-1.5">
                {group.places.map(place => (
                  <li key={place.id}>
                    <button
                      type="button"
                      data-testid={`pick-place-${place.id}`}
                      disabled={place.alreadyPlanned}
                      onClick={() => onPick(place.id)}
                      className={`flex w-full gap-2.5 rounded-2xl border p-2 text-left ${
                        place.alreadyPlanned
                          ? 'border-slate-100 bg-slate-50 opacity-60'
                          : 'border-[#eceaf5] bg-white'
                      }`}
                    >
                      {/*
                        The photo it was saved with. A placeholder rather than
                        a gap: a row that is sometimes 64px tall and sometimes
                        not is a list that jumps while it is being read.
                      */}
                      {place.photoUrl
                        ? <img src={place.photoUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                        : <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-100" />}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-black text-[#11183d]">{place.placeName}</span>
                          {place.category && place.category !== 'other' && (
                            <span className="shrink-0 rounded-lg bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-700">
                              {CATEGORY_LABELS[place.category]}
                            </span>
                          )}
                          {place.alreadyPlanned && (
                            <span className="shrink-0 text-[9px] font-black text-slate-400">已在行程中</span>
                          )}
                        </span>

                        {(place.notes || []).length > 0 ? (
                          <span className="mt-1 block space-y-0.5">
                            {(place.notes || []).slice(0, NOTE_PREVIEW).map(note => (
                              <span key={note} className="flex items-start gap-1 text-[10px] leading-4 text-slate-500">
                                <NotebookPen size={9} className="mt-[3px] shrink-0 text-violet-300" />
                                <span className="min-w-0 flex-1 break-words">{note}</span>
                              </span>
                            ))}
                            {(place.notes || []).length > NOTE_PREVIEW && (
                              <span className="block text-[10px] font-bold text-slate-300">
                                還有 {(place.notes || []).length - NOTE_PREVIEW} 則筆記
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="mt-1 block text-[10px] text-slate-300">這個地點沒有筆記</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex gap-2 border-t border-slate-100 p-3">
          {onClear && (
            <button
              type="button"
              data-testid="place-picker-clear"
              onClick={onClear}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 text-xs font-black text-slate-500"
            >
              <Check size={12} className="mr-1 inline" />清空這格
            </button>
          )}
          {onTypeYourOwn && (
            <button
              type="button"
              data-testid="place-picker-manual"
              onClick={onTypeYourOwn}
              className="min-h-11 flex-1 rounded-xl border border-violet-200 text-xs font-black text-[#5b3df5]"
            >
              自己輸入地點
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlacePickerSheet;
