import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, NotebookPen, Search, X } from 'lucide-react';
import { BOTTOM_NAV_CLEARANCE } from './AppBottomNav';
import SuggestedPlaceCards from './SuggestedPlaceCards';
import { usePlacePhotos } from './usePlacePhotos';
import { categoryLabel } from '../services/placeCategory';
import { groupByArea } from '../services/placeAreaGroups';
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
  /** Google's id, for the photo nearly every save is missing. 「這為啥都沒圖」. */
  placeId?: string;
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
  /**
   * Places near this gap that are not in the collection.
   *
   * 「從收藏的優先推薦 或 Google 搜尋結果」 — the collection comes first and is
   * free; this is what there is when it has nothing for this corner. Shown
   * last and labelled, because 「somewhere you saved」 and 「somewhere Google
   * knows about」 are not the same recommendation.
   */
  nearby?: Array<{ placeId: string; placeName: string; rating?: number; kind?: string }>;
  onPickNearby?: (placeName: string) => void;
  /**
   * Searching Google for a name, when neither half of the sheet has it.
   *
   * 「這裡還需要：更多搜尋🔍」 — three places near a corner is an offer, and a
   * traveller who already knows what they want （一蘭, 淺草 燒肉） was left with
   * the three we chose and no way past them.
   *
   * Omitted and the search is not offered: a sheet that cannot run one must
   * not appear to.
   */
  onSearchNearby?: (query: string) => Promise<Array<{ placeId: string; placeName: string; rating?: number; kind?: string }>>;
  /** Ordered as the slot wants them; the sheet keeps that order inside a ward. */
  onPick: (placeId: string) => void;
  onClose: () => void;
  /** Offered when something is already in this slot. */
  onClear?: () => void;
  onTypeYourOwn?: () => void;
  /**
   * Why the last pick did not go in.
   *
   * 「點擊完全沒有反應」 — a tap that neither closes the sheet nor says anything
   * is the worst state this screen can be in, because there is nothing for
   * the traveller to report and nothing for anybody to act on. Whatever the
   * caller knows goes here, including the text of a thrown error: a message
   * nobody wrote is still better than silence.
   */
  error?: string;
}

/** Two lines of note is enough to recognise a place; the rest is in the card. */
const NOTE_PREVIEW = 2;

const PlacePickerSheet: React.FC<Props> = ({
  title, places, onPick, onClose, onClear, onTypeYourOwn, nearby, onPickNearby, onSearchNearby, error,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  /** What a 更多搜尋 came back with, and whether one is in flight. */
  const [found, setFound] = useState<Array<{ placeId: string; placeName: string; rating?: number; kind?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState('');
  /*
    「這為啥都沒圖」 — most saves never stored a photo of their own. The
    collection card has resolved one through Google for months; this screen
    only ever read the stored field. See `usePlacePhotos`.
  */
  const photos = usePlacePhotos(places.filter(place => !place.photoUrl).map(place => place.placeId));

  const groups = useMemo(() => {
    const wanted = query.trim().toLocaleLowerCase();
    const matching = wanted
      ? places.filter(place =>
        place.placeName.toLocaleLowerCase().includes(wanted)
        || (place.notes || []).some(note => note.toLocaleLowerCase().includes(wanted)))
      : places;

    /*
      The rule lives in `services/placeAreaGroups.ts`. `DayBlockPlanner` groups
      the same way and both screens used to spell it out, including a no-ward
      bucket whose heading was also the value the ordering compared against —
      which could not survive the heading being translated.
    */
    return groupByArea(matching);
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
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="shrink-0 rounded-full p-1.5 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <label className="mx-4 mt-2 flex items-center gap-1.5 rounded-xl border border-[#e5e5ef] bg-white px-2.5">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input
            data-testid="place-picker-search"
            aria-label={t('placePicker.searchAria')}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('placePicker.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent py-2 text-xs text-[#11183d] outline-none placeholder:text-slate-300"
          />
        </label>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {groups.length === 0 && (
            <p className="py-8 text-center text-xs font-bold text-slate-400">
              {query.trim() ? t('placePicker.noMatches') : t('placePicker.noneSaved')}
            </p>
          )}

          {/*
            Google's answer, after the collection's. See `nearby`.
          */}
          {(nearby || []).length > 0 && onPickNearby && !query.trim() && (
            <section data-testid="picker-nearby" className="mt-3">
              <h3 className="text-[11px] font-black text-slate-400">{t('placePicker.otherNearby')}</h3>
              {/*
                「我需要卡片的展示 有照片 並且告訴我是哪類餐廳」.

                A name and a star is not something anybody picks dinner from —
                「結 Yuwaeru 本店」 says nothing, 「日式餐廳」 does. The same card
                the collection above uses, so the two halves of this sheet can
                actually be compared. See `SuggestedPlaceCards`.
              */}
              <SuggestedPlaceCards
                places={(nearby || []).slice(0, 3).map(place => ({
                  id: place.placeId,
                  placeId: place.placeId,
                  placeName: place.placeName,
                  rating: place.rating,
                  kind: place.kind,
                }))}
                onPick={place => onPickNearby(place.placeName)}
              />
              <p className="mt-1 text-[10px] text-slate-400">{t('placePicker.notYoursHint')}</p>
            </section>
          )}

          {/*
            Google, for a name this collection does not have.

            Below the saved places rather than above them: the collection is
            still the first answer, and this is what there is when it has
            nothing. 「從收藏的優先推薦 或 Google 搜尋結果」.
          */}
          {onSearchNearby && query.trim() && (
            <section data-testid="picker-search-more" className="mt-3">
              <button
                type="button"
                data-testid="search-more-places"
                disabled={searching}
                onClick={async () => {
                  const wanted = query.trim();
                  setSearching(true);
                  setSearchedFor(wanted);
                  const results = await onSearchNearby(wanted).catch(() => []);
                  setFound(results);
                  setSearching(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white py-2 text-[11px] font-black text-[#5b3df5] disabled:opacity-50"
              >
                <Search size={12} />
                {searching ? t('placePicker.searching') : t('placePicker.searchNearby', { query: query.trim() })}
              </button>
              {searchedFor && !searching && found.length === 0 && (
                <p className="mt-1.5 text-center text-[10px] font-bold text-slate-400">
                  {t('placePicker.nothingNearby', { query: searchedFor })}
                </p>
              )}
              {found.length > 0 && onPickNearby && (
                <>
                  <SuggestedPlaceCards
                    places={found.slice(0, 5).map(place => ({
                      id: place.placeId,
                      placeId: place.placeId,
                      placeName: place.placeName,
                      rating: place.rating,
                      kind: place.kind,
                    }))}
                    onPick={place => onPickNearby(place.placeName)}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">{t('placePicker.notYoursHint')}</p>
                </>
              )}
            </section>
          )}

          {error && (
            <p
              data-testid="pick-place-error"
              className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold leading-4 text-rose-600"
            >
              {error}
            </p>
          )}

          {groups.map(group => (
            <section key={group.label} className="mt-3 first:mt-0">
              {/*
                A ward name is data and reads the same in every language; the
                no-ward bucket is the product's own word and carries a key.
              */}
              <h3 className="text-[11px] font-black text-slate-400">
                {group.labelKey ? t(group.labelKey) : group.label}
              </h3>
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
                      {(() => {
                        const imageUrl = place.photoUrl || (place.placeId ? photos[place.placeId] : undefined);
                        return imageUrl
                          ? <img src={imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                          : <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-100" />;
                      })()}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-black text-[#11183d]">{place.placeName}</span>
                          {place.category && place.category !== 'other' && (
                            <span className="shrink-0 rounded-lg bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-700">
                              {categoryLabel(place.category)}
                            </span>
                          )}
                          {place.alreadyPlanned && (
                            <span className="shrink-0 text-[9px] font-black text-slate-400">{t('placePicker.alreadyInPlan')}</span>
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
                                {t('placePicker.moreNotes', { n: (place.notes || []).length - NOTE_PREVIEW })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="mt-1 block text-[10px] text-slate-300">{t('placePicker.noNotes')}</span>
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
              <Check size={12} className="mr-1 inline" />{t('placePicker.clearSlot')}
            </button>
          )}
          {onTypeYourOwn && (
            <button
              type="button"
              data-testid="place-picker-manual"
              onClick={onTypeYourOwn}
              className="min-h-11 flex-1 rounded-xl border border-violet-200 text-xs font-black text-[#5b3df5]"
            >
              {t('placePicker.typeYourOwn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlacePickerSheet;
