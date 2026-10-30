import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, ChevronLeft, Loader2, MapPinned, Star } from 'lucide-react';
import { PublishedTrip, PublishedTripStop } from '../types';
import {
  publishedTripDays,
  savableStops,
  tripDayCount,
} from '../services/tripPublishing';
import { dayMapSrc, mappableStops } from '../services/dayMapImage';

/**
 * Somebody else's trip, seen by whoever opened the link — 公開行程頁.
 *
 * 「可查看每日行程並收藏地點」. Three things a visitor does here and nothing
 * else: read the days, save a stop they like, save the whole thing. There is
 * no editing, because this trip is not theirs; and there is no money anywhere
 * on this screen, because `read_public_trip` never sent any. The expenses are
 * not hidden by a flag here — they are absent from the payload, which is the
 * only version of that promise worth making.
 *
 * What the owner withheld is absent rather than blank. A stop whose note was
 * not shared has no `notes` at all, so this screen cannot render an empty
 * paragraph where the traveller sees their own writing.
 */

type Tab = 'days' | 'map' | 'places';

interface Props {
  /** Absent while it is being fetched. */
  trip?: PublishedTrip;
  /** Set when the link does not open onto anything. */
  notFound?: boolean;
  loading?: boolean;
  /** Who published it, for the byline. Absent while their profile loads. */
  authorName?: string;
  authorAvatar?: string;
  /** How many people have saved it, as the server counted. */
  saveCount?: number;
  /** The stop ids this visitor has already saved, so a saved one says so. */
  savedStopIds?: string[];
  /** Absent means nobody is signed in, and saving needs an account. */
  signedIn?: boolean;
  onSignIn?: () => void;
  /** Save one stop into the visitor's own 收藏. */
  onSaveStop: (stop: PublishedTripStop) => void;
  /** Save the whole itinerary — 收藏這份行程. */
  onSaveTrip: (stops: PublishedTripStop[]) => void;
  /** Put one stop onto a trip of the visitor's own — 加入我的行程. */
  onAddStopToTrip?: (stop: PublishedTripStop) => void;
  onOpenAuthor?: () => void;
  onClose: () => void;
}

/** 「3/12」 — the chip label, from a plain date and nothing else. */
const chipDate = (date: string): string => {
  const parts = date.split('-');
  if (parts.length < 3) return date;
  return `${Number(parts[1])}/${Number(parts[2])}`;
};

/** 「4.8K 收藏」. A number nobody can read at a glance is not a number. */
export const compactCount = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(value);

const PublicTripView: React.FC<Props> = ({
  trip,
  notFound,
  loading,
  authorName,
  authorAvatar,
  saveCount,
  savedStopIds,
  signedIn,
  onSignIn,
  onSaveStop,
  onSaveTrip,
  onAddStopToTrip,
  onOpenAuthor,
  onClose,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<Tab>('days');
  const [openDay, setOpenDay] = React.useState(0);

  const days = React.useMemo(() => (trip ? publishedTripDays(trip) : []), [trip]);
  const places = React.useMemo(() => savableStops(trip?.stops ?? []), [trip]);
  const saved = React.useMemo(() => new Set(savedStopIds ?? []), [savedStopIds]);

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f7f8fc]" data-testid="public-trip">
      {children}
    </div>
  );

  const backButton = (
    <button
      type="button"
      aria-label={t('common.back')}
      data-testid="public-trip-close"
      onClick={onClose}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[#11183d] shadow-[0_4px_14px_rgba(17,26,74,.18)] backdrop-blur"
    >
      <ChevronLeft size={18} />
    </button>
  );

  if (loading) {
    return shell(
      <div className="px-[var(--screen-pad)] py-6">
        {backButton}
        <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-[13px] text-slate-400">
          <Loader2 size={15} className="animate-spin" />{t('publicTrip.loading')}
        </p>
      </div>,
    );
  }

  /*
    One sentence for every refusal.

    Private, never published, revoked, or asked for without the token it needs
    all land here, because 「你不能看」 tells a stranger that something is there.
    The server answers them identically too; this only repeats it.
  */
  if (notFound || !trip) {
    return shell(
      <div className="px-[var(--screen-pad)] py-6">
        {backButton}
        <div className="mt-3 rounded-2xl bg-white p-8 text-center" data-testid="public-trip-missing">
          <p className="text-[14px] font-black text-[#11183d]">{t('publicTrip.notFoundTitle')}</p>
          <p className="mt-1 text-[12px] text-slate-400">{t('publicTrip.notFoundBlurb')}</p>
        </div>
      </div>,
    );
  }

  const dayTotal = tripDayCount(trip);
  const cover = trip.stops.find(stop => stop.photos?.length)?.photos?.[0];

  /** One row of the timeline, and the bookmark that belongs to it. */
  const stopRow = (stop: PublishedTripStop, withTime: boolean) => {
    const mine = saved.has(stop.id);
    const savable = stop.type !== 'FLIGHT' && stop.type !== 'HOTEL';
    return (
      <li key={stop.id} data-testid={`public-trip-stop-${stop.id}`} className="flex gap-3">
        {withTime && (
          <span className="w-12 shrink-0 pt-3 text-[11px] font-black text-slate-400">
            {stop.time || '—'}
          </span>
        )}
        <div className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl bg-white p-3 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
          {stop.photos?.[0]
            ? <img src={stop.photos[0]} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#eef1ff] to-[#f3efff] text-[#6b4df6]">
                <MapPinned size={16} />
              </span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-black text-[#11183d]">{stop.title}</span>
            <span className="block truncate text-[11px] text-slate-400">
              {[t(`publicTrip.stopType.${stop.type}`), stop.location].filter(Boolean).join(t('planner.placeSeparator'))}
            </span>
            {/* The owner's own words, when they shared them. Absent means withheld. */}
            {stop.notes && (
              <span className="mt-1 block text-[11px] leading-5 text-slate-500">{stop.notes}</span>
            )}
            {stop.rating != null && (
              <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-500">
                <Star size={11} fill="currentColor" />{stop.rating}
              </span>
            )}
          </span>
          {/*
            A flight or a hotel has no bookmark at all. Saving 「華航 CI100」
            into somebody's 收藏 gives them a row they can never use, and a
            button that produces a useless row is worse than no button.
          */}
          {savable && (
            <button
              type="button"
              aria-label={mine ? t('publicTrip.alreadySaved') : t('publicTrip.saveStop')}
              data-testid={`public-trip-save-stop-${stop.id}`}
              onClick={() => (signedIn ? onSaveStop(stop) : onSignIn?.())}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                mine ? 'bg-violet-50 text-[#5b3df5]' : 'text-slate-300'
              }`}
            >
              <Bookmark size={15} fill={mine ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
      </li>
    );
  };

  return shell(
    <div className="pb-32 md:mx-auto md:max-w-2xl">
      <div className="relative">
        {cover
          ? <img src={cover} alt="" className="h-56 w-full object-cover" />
          : <div className="h-56 w-full bg-gradient-to-br from-[#2F5BFF] via-[#6B4DF6] to-[#8B3DFF]" />}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[#f7f8fc]" />
        <div className="absolute left-4 top-4">{backButton}</div>
      </div>

      <div className="px-[var(--screen-pad)]">
        <h1 className="text-2xl font-black tracking-tight text-[#11183d]">{trip.name}</h1>

        <button
          type="button"
          data-testid="public-trip-author"
          disabled={!onOpenAuthor}
          onClick={() => onOpenAuthor?.()}
          className="mt-2 flex items-center gap-2 text-left"
        >
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-100 to-blue-100 text-[11px] font-black text-violet-700">
            {authorAvatar
              ? <img src={authorAvatar} alt="" className="h-full w-full object-cover" />
              : (authorName ?? t('publicTrip.authorInitialFallback')).slice(0, 1)}
          </span>
          <span className="text-[12px] font-black text-[#11183d]">{authorName ?? t('publicTrip.unknownAuthor')}</span>
        </button>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
          {dayTotal > 0 && <span data-testid="public-trip-days">{t('publicTrip.dayCount', { days: dayTotal })}</span>}
          <span data-testid="public-trip-stop-count">{t('publicTrip.stopCount', { stops: trip.stops.length })}</span>
          {saveCount != null && saveCount > 0 && (
            <span data-testid="public-trip-saves">{t('publicTrip.saveCount', { saves: compactCount(saveCount) })}</span>
          )}
        </p>

        <div className="mt-4 flex gap-1 border-b border-slate-200">
          {([
            ['days', t('publicTrip.tabDays')],
            ['map', t('publicTrip.tabMap')],
            ['places', t('publicTrip.tabPlaces', { places: places.length })],
          ] as Array<[Tab, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`public-trip-tab-${key}`}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 pb-2 text-[13px] font-black ${
                tab === key
                  ? 'border-[#5b3df5] text-[#5b3df5]'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'days' && (
          <div className="mt-3" data-testid="public-trip-day-tab">
            {days.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-[12px] text-slate-400">
                {t('publicTrip.emptyDays')}
              </p>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((day, index) => (
                    <button
                      key={day.date}
                      type="button"
                      data-testid={`public-trip-day-${day.dayNumber}`}
                      onClick={() => setOpenDay(index)}
                      className={`shrink-0 rounded-xl px-3 py-2 text-center text-[12px] font-black ${
                        index === openDay
                          ? 'bg-violet-50 text-[#5b3df5] ring-1 ring-violet-200'
                          : 'bg-white text-slate-400'
                      }`}
                    >
                      <span className="block">Day {day.dayNumber}</span>
                      <span className="block text-[10px] font-bold">{chipDate(day.date)}</span>
                    </button>
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {(days[openDay] ?? days[0])?.stops.map(stop => stopRow(stop, true))}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'map' && (
          <div className="mt-3" data-testid="public-trip-map-tab">
            {/*
              The same picture the traveller's own day map draws, from the one
              server that holds a Maps key. Stops with no coordinates are not
              drawn and are not hidden either: the count is stated, because a
              map showing four pins for five stops is a map read twice.
            */}
            {(() => {
              const day = days[openDay] ?? days[0];
              const pins = mappableStops(day?.stops ?? []);
              if (pins.length === 0) {
                return (
                  <p className="rounded-2xl bg-white p-6 text-center text-[12px] text-slate-400">
                    {t('publicTrip.noCoordinates')}
                  </p>
                );
              }
              const missing = (day?.stops.length ?? 0) - pins.length;
              return (
                <>
                  <img
                    src={dayMapSrc({ stops: pins, width: 640, height: 420, connect: true })}
                    alt={t('publicTrip.dayMapAlt', { day: day?.dayNumber })}
                    className="w-full rounded-2xl bg-white shadow-[0_6px_18px_rgba(17,24,61,.05)]"
                  />
                  {missing > 0 && (
                    <p className="mt-2 text-center text-[11px] font-bold text-slate-400">
                      {t('publicTrip.missingPins', { missing })}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {tab === 'places' && (
          <ul className="mt-3 space-y-2" data-testid="public-trip-places-tab">
            {places.map(stop => stopRow(stop, false))}
            {places.length === 0 && (
              <p className="rounded-2xl bg-white p-6 text-center text-[12px] text-slate-400">
                {t('publicTrip.emptyPlaces')}
              </p>
            )}
          </ul>
        )}
      </div>

      {/*
        The one action this screen is for, where a thumb reaches it.

        Signed out it says so instead of failing: a save has to belong to
        somebody, and finding that out after tapping is finding it out too late.
      */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-[var(--screen-pad)] py-3 backdrop-blur md:mx-auto md:max-w-2xl">
        {signedIn ? (
          <button
            type="button"
            data-testid="public-trip-save-all"
            disabled={places.length === 0}
            onClick={() => onSaveTrip(places)}
            className="min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white disabled:opacity-50"
          >
            {t('publicTrip.saveAllCta', { places: places.length })}
          </button>
        ) : (
          <button
            type="button"
            data-testid="public-trip-sign-in"
            onClick={() => onSignIn?.()}
            className="min-h-12 w-full rounded-xl bg-white text-[13px] font-black text-[#5b3df5] ring-1 ring-violet-200"
          >
            {t('publicTrip.signInToSave')}
          </button>
        )}
        {onAddStopToTrip && places.length > 0 && signedIn && (
          <p className="mt-1.5 text-center text-[11px] font-bold text-slate-400">
            {t('publicTrip.pickSomeHint')}
          </p>
        )}
      </div>
    </div>,
  );
};

export default PublicTripView;
