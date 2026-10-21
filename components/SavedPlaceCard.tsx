import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Copy, Globe, MapPin, Navigation, NotebookPen, Sparkles, Star, Users, X } from 'lucide-react';
import { SavedExperienceNote } from '../types';
import { MappablePlace, placeCopyText, placeDirectionsUrl, placeMapsUrl } from '../services/placeLinks';
import { navigationProviderFor } from '../services/navigationProvider';
import { naverPlaceUrl } from '../services/naverMapLinks';
import { fetchPlaceBasics, hoursForToday, PlaceBasics, summarizePlaceBasics } from '../services/placeBasicsService';
import { placeWhereLabel } from '../services/placeWhereLabel';
import { fetchPlacePhotos, PlacePhoto } from '../services/placePhotoService';
import PlaceGallery from './PlaceGallery';
import PlaceSpendRecord from './PlaceSpendRecord';
import { SpendAtPlace } from '../services/spendAtPlace';
import { fetchPlaceHighlights, PlaceHighlights } from '../services/placeHighlightsService';
import { fetchPlaceReviews, PlaceReview } from '../services/placeReviewsService';

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
  /**
   * Who is reading. Kept for callers; the split below does not need it.
   *
   * 「這是我收藏的其他人的旅行筆記 不是我寫的備註」 — the first attempt compared
   * `sourceCreatorId` against the reader, and that id does not mean what it
   * reads like: the collection screen resolves a note's author from its
   * `sourcePostId` precisely because the creator id on a saved note is the
   * person who saved it as often as the person who wrote it.
   */
  viewerUserId?: string;
  /**
   * Whether the traveller has been here.
   *
   * 「我希望主要看到的都是自己的紀錄 不是跟看收藏一樣都是網路搜尋的結果」 — the
   * card holds the same blocks either way and puts his own first.
   */
  visited?: boolean;
  /**
   * What was spent here, when the caller has a ledger to read.
   *
   * Passed in rather than looked up: the card is opened from three screens
   * and only one of them is inside a trip with bills.
   */
  spend?: SpendAtPlace[];
  onClose: () => void;
}

const SavedPlaceCard: React.FC<Props> = ({ place, notes, viewerUserId, spend = [], visited = false, onClose }) => {
  /*
    A note came from somewhere or the reader wrote it; there is no third case.
    A `sourcePostId` is that somewhere — a community post, or a screenshot of
    somebody's blog — so a note carrying one is another traveller's, and only
    a note with no source at all is the reader's own.

    This is the direction that cannot misattribute: an unsourced note of
    Ann's does not exist, while a sourced note of his reads as hers, which is
    a smaller error than putting her words in his mouth.
  */
  const theirs = notes.filter(note => Boolean(note.sourcePostId?.trim()));
  const mine = notes.filter(note => !theirs.includes(note));

  /*
    「若點選我去過的紀錄的話 我希望主要看到的都是自己的紀錄」.

    Asked of the place rather than passed in: a bill recorded here, or a line
    he wrote himself, is evidence he went. `visited` is accepted too, because
    a place can be marked 已訪 by hand with nothing else attached to it — see
    `statedVisits`, which exists for exactly that case.
  */
  const mineFirst = visited || spend.length > 0 || mine.length > 0;
  const [copied, setCopied] = useState(false);
  /*
    「Allow users to manually choose another supported navigation provider」.

    Collapsed rather than absent: in Korea the answer is NAVER for almost
    everybody, and showing three equal buttons makes a decision out of
    something that has a right answer.
  */
  const [showOthers, setShowOthers] = useState(false);
  const naverUrl = navigationProviderFor({
    countryCode: place.countryCode,
    country: place.country,
  }) === 'naver'
    ? naverPlaceUrl({ placeName: place.placeName, coordinates: place.coordinates })
    : null;
  /*
    What Google knows, for the places the traveller saved nothing about.

    「這個你要基本查一些資訊 不能讓這個行程空白」. Looked up when the card opens
    rather than when the list renders: twelve lookups to fill twelve rows that
    may never be tapped is somebody else's API bill and a slower list.
  */
  const [basics, setBasics] = useState<PlaceBasics | null>(null);
  /*
    The pictures, on the same terms as the facts above: fetched when the card
    opens, never when the list renders. Google was always asked for all of
    them on this request; only the first was ever read.
  */
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  /*
    「可以讓AI爬文看這間店有名的是什麼嗎？」 — for the places nobody wrote a note
    about. Behind a button rather than fetched on open: this is a search per
    place, and a collection opened card by card would be a search per card.
  */
  const [highlights, setHighlights] = useState<PlaceHighlights | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  /*
    What people wrote on the map. Fetched with the card, unlike the search:
    this is one field on a Details call for a place already being looked up,
    and it is the part a traveller actually reads.
  */
  const [reviews, setReviews] = useState<PlaceReview[]>([]);

  useEffect(() => {
    let cancelled = false;
    setBasics(null);
    setPhotos([]);
    setHighlights(null);
    setReviews([]);
    setLookingUp(false);
    void fetchPlaceBasics(place.placeId).then(found => { if (!cancelled) setBasics(found); });
    if (place.placeId) {
      void fetchPlacePhotos(place.placeId).then(found => { if (!cancelled) setPhotos(found); });
      void fetchPlaceReviews(place.placeId).then(found => { if (!cancelled) setReviews(found); });
    }
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
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-slate-100 bg-white p-4 shadow-[0_24px_70px_rgba(17,26,74,0.18)]"
      >
        {photos.length > 0 && (
          <div className="mb-3">
            <PlaceGallery photos={photos} placeName={place.placeName} />
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black leading-6 text-[#11183d]">{place.placeName}</h3>
            <p className="mt-1 flex items-start gap-1.5 text-[11px] font-medium text-slate-500">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                {place.formattedAddress || placeWhereLabel(place.city, place.country)}
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

        {/*
          Korea opens in NAVER, and only when there is a point to send.

          Verified on a phone: this link opens NAVER Map with the pin on the
          place and From / To underneath — which is the whole principle, that
          Trippie plans and the local app navigates.

          `naverUrl` is null without coordinates, and that branch matters more
          than the happy one. The same link with a misspelled parameter opened
          NAVER anyway and sat on the traveller's own location with 「Out of
          service range」 — no pin, no error. A wrong parameter does not make a
          broken link, it makes a working link to the wrong place. So when
          there is no point, this falls through to exactly what it did before.
        */}
        {naverUrl && (
          <a
            href={naverUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="saved-place-naver-link"
            className="mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#03c75a] text-sm font-black text-white"
          >
            <Navigation size={15} />在 NAVER 地圖開啟
          </a>
        )}

        {naverUrl && !showOthers && (
          <button
            type="button"
            onClick={() => setShowOthers(true)}
            data-testid="saved-place-other-providers"
            className="mt-2 min-h-11 w-full text-xs font-black text-slate-500"
          >
            其他導航方式
          </button>
        )}

        {/* Unchanged for every place outside Korea, deliberately and by test. */}
        <div
          className={`mt-3 grid grid-cols-2 gap-2 ${naverUrl && !showOthers ? 'hidden' : ''}`}
        >
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
          Whose record comes first.

          「若點選我去過的紀錄的話 我希望主要看到的都是自己的紀錄 不是跟看收藏一
          樣都是網路搜尋的結果」 — a place he has been to is a different screen
          from a place he is deciding about. Deciding wants Google's record
          and strangers' reviews at the top; remembering wants his own bill,
          his own line, his own photographs, and the internet underneath.

          Same blocks either way, in the other order. Nothing is hidden from
          either reading — a visited place still has opening hours, and a
          place he has not been to still has whatever he wrote about it.
        */}
        {mineFirst ? (
          <>
          {mine.length > 0 && (
            <div data-testid="saved-place-notes" className="mt-4 space-y-1.5 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-800">
                <NotebookPen size={12} />我的備註
              </div>
              {mine.map(note => (
                <div key={note.id} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs leading-5 text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <p className="min-w-0 flex-1 break-words">{note.text}</p>
                </div>
              ))}
            </div>
          )}
          {/*
            Somebody else's experience of the place, kept under their own
            heading. 「不是我的備註，是我從旅人筆記的資訊」 — this is the third kind
            of thing on the card, after Google's record and the reader's own
            line, and running them together makes all three less trustworthy.
          */}
          {theirs.length > 0 && (
            <div data-testid="saved-place-traveller-notes" className="mt-4 space-y-1.5 rounded-2xl border border-violet-100 bg-violet-50/40 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-violet-700">
                <Users size={12} />旅人筆記
              </div>
              {theirs.map(note => (
                <div key={note.id} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs leading-5 text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  <p className="min-w-0 flex-1 break-words">{note.text}</p>
                </div>
              ))}
            </div>
          )}

          {/*
            What the place is known for, when nobody has said anything about it.

            Offered only in the absence of traveller notes: somebody's own
            account of a restaurant beats a search every time, and running both
            would put a machine's summary beside a person's experience as though
            the two were the same kind of thing.
          */}
          <PlaceSpendRecord spend={spend} />
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
          {/*
            The map's own reviews, quoted.

            「沒辦法觸發Google map上的評論」 — these are first-party, attributed,
            and written by people who went, which is why they are quoted whole
            rather than summarised. A summary of five reviews is a sentence
            nobody said; a review with a name on it is somebody's own.

            Shown whatever else the card holds: a traveller's note and a
            stranger's review answer different questions, and neither replaces
            the other.
          */}
          {reviews.length > 0 && (
            <div data-testid="place-reviews" className="mt-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500">
                <Star size={12} className="text-amber-500" />Google 評論
              </div>
              {reviews.map(review => (
                <div key={`${review.authorName}-${review.when}-${review.text.slice(0, 12)}`} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-2.5">
                  <div className="flex items-center gap-1.5">
                    {review.authorPhoto && (
                      <img src={review.authorPhoto} alt="" loading="lazy" className="h-5 w-5 rounded-full object-cover" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] font-black text-[#11183d]">
                      {review.authorName || '旅客'}
                    </span>
                    {review.rating !== undefined && (
                      <span className="shrink-0 text-[11px] font-black text-amber-600">★ {review.rating}</span>
                    )}
                    {review.when && <span className="shrink-0 text-[10px] text-slate-400">{review.when}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-700">{review.text}</p>
                </div>
              ))}
            </div>
          )}
          </>
        ) : (
          <>
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
          {mine.length > 0 && (
            <div data-testid="saved-place-notes" className="mt-4 space-y-1.5 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-800">
                <NotebookPen size={12} />我的備註
              </div>
              {mine.map(note => (
                <div key={note.id} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs leading-5 text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <p className="min-w-0 flex-1 break-words">{note.text}</p>
                </div>
              ))}
            </div>
          )}
          {/*
            Somebody else's experience of the place, kept under their own
            heading. 「不是我的備註，是我從旅人筆記的資訊」 — this is the third kind
            of thing on the card, after Google's record and the reader's own
            line, and running them together makes all three less trustworthy.
          */}
          {theirs.length > 0 && (
            <div data-testid="saved-place-traveller-notes" className="mt-4 space-y-1.5 rounded-2xl border border-violet-100 bg-violet-50/40 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-violet-700">
                <Users size={12} />旅人筆記
              </div>
              {theirs.map(note => (
                <div key={note.id} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs leading-5 text-slate-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  <p className="min-w-0 flex-1 break-words">{note.text}</p>
                </div>
              ))}
            </div>
          )}

          {/*
            What the place is known for, when nobody has said anything about it.

            Offered only in the absence of traveller notes: somebody's own
            account of a restaurant beats a search every time, and running both
            would put a machine's summary beside a person's experience as though
            the two were the same kind of thing.
          */}
          {/*
            The map's own reviews, quoted.

            「沒辦法觸發Google map上的評論」 — these are first-party, attributed,
            and written by people who went, which is why they are quoted whole
            rather than summarised. A summary of five reviews is a sentence
            nobody said; a review with a name on it is somebody's own.

            Shown whatever else the card holds: a traveller's note and a
            stranger's review answer different questions, and neither replaces
            the other.
          */}
          {reviews.length > 0 && (
            <div data-testid="place-reviews" className="mt-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500">
                <Star size={12} className="text-amber-500" />Google 評論
              </div>
              {reviews.map(review => (
                <div key={`${review.authorName}-${review.when}-${review.text.slice(0, 12)}`} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-2.5">
                  <div className="flex items-center gap-1.5">
                    {review.authorPhoto && (
                      <img src={review.authorPhoto} alt="" loading="lazy" className="h-5 w-5 rounded-full object-cover" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] font-black text-[#11183d]">
                      {review.authorName || '旅客'}
                    </span>
                    {review.rating !== undefined && (
                      <span className="shrink-0 text-[11px] font-black text-amber-600">★ {review.rating}</span>
                    )}
                    {review.when && <span className="shrink-0 text-[10px] text-slate-400">{review.when}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-700">{review.text}</p>
                </div>
              ))}
            </div>
          )}
          {theirs.length === 0 && mine.length === 0 && (
            <div className="mt-4">
              {!highlights && (
                <button
                  type="button"
                  data-testid="look-up-highlights"
                  disabled={lookingUp}
                  onClick={() => {
                    setLookingUp(true);
                    void fetchPlaceHighlights({
                      placeId: place.placeId,
                      placeName: place.placeName,
                      address: place.formattedAddress,
                      city: place.city,
                    })
                      .then(setHighlights)
                      .finally(() => setLookingUp(false));
                  }}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50/50 text-xs font-black text-[#5b3df5] disabled:opacity-60"
                >
                  <Sparkles size={13} />{lookingUp ? '查詢中…' : '查查這裡有名的是什麼'}
                </button>
              )}

              {highlights && (
                <div data-testid="place-highlights" className="space-y-1.5 rounded-2xl border border-violet-100 bg-violet-50/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-violet-700">
                    <Sparkles size={12} />AI 查到的重點
                  </div>
                  {highlights.points.length > 0 ? (
                    <>
                      {highlights.points.map(point => (
                        <div key={point} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs leading-5 text-slate-700">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                          <p className="min-w-0 flex-1 break-words">{point}</p>
                        </div>
                      ))}
                      {/*
                        The pages it was read off, named. This sits where a
                        person's notes would sit, so where it came from is the
                        part that stops it being mistaken for one.
                      */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {highlights.sources.map(source => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="max-w-full truncate text-[10px] font-bold text-slate-500 underline"
                          >
                            {source.title || source.url}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : (
                    /*
                      Said plainly. The server refuses to answer from memory, so
                      an empty answer means nothing was found — which is a fact
                      about this place, not a failure to report.
                    */
                    <p data-testid="place-highlights-empty" className="text-xs leading-5 text-slate-500">
                      查不到這家店的介紹，網路上沒有寫到什麼。
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <PlaceSpendRecord spend={spend} />
          </>
        )}
      </div>
    </div>
  );
};

export default SavedPlaceCard;
