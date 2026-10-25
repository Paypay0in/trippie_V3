/**
 * 旅程回顧 — the trip, read back.
 *
 * Three tabs: 總覽 counts and maps it, 每日行程 walks through it a day at a
 * time, 我的精選 names what was liked best. Everything on all three comes out
 * of `buildTripRecap`, which is the only place any of it is worked out.
 *
 * The cover is `TripCover` — the same credited photograph the trip already
 * wears on every other screen, not a second idea of what this trip looks
 * like.
 *
 * What the mock shows that this deliberately does not invent:
 *
 * - A rating for a stop with no bill. Stars come from the till, so a stop
 *   nobody rated shows none — and a section with nothing rated in it says so
 *   rather than ranking the stops by something else and calling them 亮點.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarRange, ChevronRight, ImagePlus, MapPin, NotebookPen, Plus, Receipt, ShoppingBag, Sparkles, Star, UtensilsCrossed, Wallet } from 'lucide-react';
import { RECEIPT_PHOTO, readAndDownscale } from '../services/postPhotos';
import { Expense, Trip, TripMember } from '../types';
import { RecapStop, buildTripRecap, dayOfStop, isGettingThere, starsFor } from '../services/tripRecap';
import { ITINERARY_PREFIX, buildTripAreas } from '../services/tripAreas';
import { dayMapSrc } from '../services/dayMapImage';
import { CATEGORY_LABELS } from '../services/placeCategory';
import TripCover from './TripCover';
import PhotoLightbox from './PhotoLightbox';
import { PlaceThumbnail } from './PlaceThumbnail';
import { SavedTravelInspiration } from '../types';

interface Props {
  trip: Pick<Trip, 'name' | 'itinerary' | 'travelCountry'>;
  expenses: Expense[];
  today: string;
  /**
   * Who is reading. 「總花費是錯的 只需要算我自己」 — the figure is this
   * traveller's share, never the whole trip's.
   */
  viewerMemberId?: string;
  members?: TripMember[];
  onBack: () => void;
  /** Opens the ledger, for a figure somebody wants to question. */
  onOpenRecords?: () => void;
  /**
   * Writes the traveller's private account of a stop.
   *
   * Saved into `itinerary_journals`, a row owned by its author — not the
   * item's `notes`, which is the trip's note and which everybody on the trip
   * reads, and not a device-local store, which is the shape that cost a
   * morning.
   */
  onWriteDiary?: (itemId: string, text: string) => void;
  /**
   * What this traveller has written privately about each stop.
   *
   * 「日記只給自己看」 — kept in `itinerary_journals`, where the row belongs to
   * its author and RLS says so. The itinerary item's own `notes` stays what it
   * always was: the trip's note, which everybody on it reads.
   */
  journals?: Record<string, { text: string }>;
  /**
   * 編輯這一天 / 新增行程, both landing on the planner with that day in hand.
   *
   * 「這個呢」 — the design ends each day with a way to add to it, which is the
   * difference between a review you read and one you keep.
   */
  onPlanDay?: (date: string) => void;
  /**
   * The star given while looking back, and the photographs of the stop.
   *
   * 「如何給淺草寺評價」 — the till can only ask about places that charged for
   * something, which leaves out most of what a traveller remembers.
   */
  onRateStop?: (itemId: string, rating: number) => void;
  onAddStopPhotos?: (itemId: string, photos: string[]) => void;
}

type Tab = 'overview' | 'days' | 'picks';

const TABS: Array<[Tab, string]> = [
  ['overview', '總覽'],
  ['days', '每日行程'],
  ['picks', '我的精選'],
];

const money = (value: number) => `NT$ ${Math.round(value).toLocaleString()}`;

/** 10/18（六） — the day as the chips and the timeline print it. */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}（${WEEKDAYS[parsed.getDay()]}）`;
};

const CARD = 'rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(66,74,150,.07)]';

/** The stars a stop was given, or the honest blank. */
const Stars: React.FC<{ stop: RecapStop; testId: string }> = ({ stop, testId }) => {
  const stars = starsFor(stop.rating);
  if (!stars) return null;
  return (
    <span data-testid={testId} className="shrink-0 text-[11px] font-black tracking-tight text-amber-500">
      {stars}
    </span>
  );
};

const TripRecapScreen: React.FC<Props> = ({ trip, expenses, today, viewerMemberId, members, onBack, onOpenRecords, onWriteDiary, onPlanDay, onRateStop, onAddStopPhotos, journals = {} }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const recap = useMemo(
    () => buildTripRecap({ trip, expenses, today, viewerMemberId, members }),
    [trip, expenses, today, viewerMemberId, members],
  );
  const [day, setDay] = useState(0);
  /** The stop whose diary is open, and what has been typed into it. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /**
   * The area the map is showing, or the whole trip.
   *
   * 「應該點哪一區就要換那一區的地圖」 — the footprint of a whole trip is a
   * country at a time, which answers 「did I go to Japan」 and nothing else.
   * 13 個地點 in Taito City is a walk, and that is the map worth drawing.
   */
  const [area, setArea] = useState<string | null>(null);
  /**
   * The photograph being looked at, full screen.
   *
   * 「點擊照片能讓他變大嗎」 — 64px is enough to recognise a picture and not
   * nearly enough to read a receipt, which is most of why one was taken.
   */
  const [viewing, setViewing] = useState<{ photos: string[]; index: number } | null>(null);
  /**
   * The stop a highlight was followed to, marked until it has been seen.
   *
   * 「點這個 要打開地點記錄等」 — 旅程亮點 named three stops and did nothing
   * when tapped, while everything worth reaching about a stop (the stars, the
   * photographs, the diary) was a tab away in 每日行程. Rather than build a
   * second place to keep a record, the highlight walks to the one that
   * exists — and says which stop it meant, because a day of eight stops is
   * not an answer to a tap on one.
   */
  const [followed, setFollowed] = useState<string | null>(null);

  const followedRef = useRef<HTMLLIElement | null>(null);

  /* A stop halfway down a day is not reached by changing the tab alone. */
  useEffect(() => {
    if (!followed) return;
    followedRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    /* The mark fades; it says which stop was meant, it is not a selection. */
    const timer = setTimeout(() => setFollowed(null), 2400);
    return () => clearTimeout(timer);
  }, [followed]);

  const followHighlight = (itemId: string) => {
    const at = dayOfStop(recap, itemId);
    /* No day holds it — the tab would open on a stop that is not there. */
    if (at < 0) return;
    setTab('days');
    setDay(at);
    setFollowed(itemId);
  };

  /*
    The areas, from the same grouping the collection screen uses. 新宿區 4個景點
    is a count of this trip's stops in that ward, not of everything saved
    there — the review is about where this trip went.
  */
  const areaOf = useMemo(
    () => buildTripAreas({
      itinerary: (trip.itinerary || []).filter(item => !isGettingThere(item)),
      country: trip.travelCountry,
    }).areaOfItem,
    [trip.itinerary, trip.travelCountry],
  );

  const areas = useMemo(
    () => buildTripAreas({
      // 「這都能去掉機場」 — 桃園 一帶 is not an area of a trip to Tokyo.
      itinerary: (trip.itinerary || []).filter(item => !isGettingThere(item)),
      country: trip.travelCountry,
    }).clusters,
    [trip.itinerary, trip.travelCountry],
  );

  const dates = recap.days.length > 0
    ? `${dayLabel(recap.days[0].date)} – ${dayLabel(recap.days[recap.days.length - 1].date)}`
    : '尚未安排日期';

  /*
    The footprint, with no line through it. A day is walked in an order and
    the line is that order; five days joined up would draw a route nobody
    took, in the order the itinerary happens to be stored in.
  */
  /* The places, not the airports they were reached through. */
  const everywhere = recap.visited.filter(
    stop => typeof stop.latitude === 'number' && stop.category !== 'transport',
  );
  /* The stops of the chosen area, by the ids that area was clustered from. */
  const chosen = areas.find(cluster => cluster.id === area);
  const inArea = chosen
    ? new Set(chosen.places.map(place => place.id.replace(ITINERARY_PREFIX, '')))
    : undefined;
  const pins = inArea ? everywhere.filter(stop => inArea.has(stop.itemId)) : everywhere;
  const footprint = pins.length > 0
    ? dayMapSrc({
      stops: pins.map((stop, index) => ({
        id: stop.itemId,
        latitude: stop.latitude as number,
        longitude: stop.longitude as number,
        number: index + 1,
      })),
      width: 640,
      height: 320,
      connect: false,
    })
    : undefined;

  const stats: Array<[React.ComponentType<{ size?: number }>, string, string, string]> = [
    [CalendarRange, '旅行天數', String(recap.stats.days), 'text-blue-600'],
    [MapPin, '造訪景點', String(recap.stats.places), 'text-violet-600'],
    [UtensilsCrossed, '餐廳美食', String(recap.stats.meals), 'text-amber-500'],
    /* 我的花費, because it is: the reader's share, not the trip's total. */
    [Receipt, '我的花費', money(recap.stats.totalTwd), 'text-emerald-600'],
  ];

  const current = recap.days[Math.min(day, Math.max(0, recap.days.length - 1))];
  /* A photograph from the day itself, or none. */
  const dayPhoto = current?.stops.map(stop => stop.photo).find(Boolean);

  return (
    <div className="min-h-full bg-[#f6f7fc] pb-8">
      {viewing && (
        <PhotoLightbox
          photos={viewing.photos}
          index={viewing.index}
          onIndex={index => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
        />
      )}
      {/*
        「過度滿版」 — the title sat under the clock and the Dynamic Island.

        index.html asks for viewport-fit=cover on purpose, so every screen
        that owns the top of the display has to pay the inset back. Padding
        rather than an offset: the header's own background then fills the
        strip behind the clock instead of leaving a second status bar of
        white above it.
      */}
      <header
        data-safe-top
        className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-3 py-3 backdrop-blur"
      >
        <button
          type="button"
          onClick={onBack}
          data-testid="recap-back"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black leading-5 tracking-tight text-[#11183d]">旅程回顧</h1>
          <p className="truncate text-[11px] font-bold text-slate-400">{trip.name} · {dates}</p>
        </div>
      </header>

      <div className="space-y-3 px-3 pt-3">
        {/*
          The same cover the trip already wears, not a second one.

          I had built this out of the traveller's own newest receipt photo,
          reasoning that the app holds no album — but the app does picture a
          trip, with a credited Pexels photograph, and has since long before
          this screen existed. A review that pictured the trip differently
          from every other screen would be this project's recurring defect in
          its purest form: one thing, two implementations.
        */}
        <section data-testid="recap-cover">
          <TripCover query={trip.name} dateRange={dates} minHeight="min-h-44">
            <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-indigo-700 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-violet-500" />RECAP 旅程回顧
            </span>
          </TripCover>
        </section>

        <nav className="flex gap-1 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`recap-tab-${key}`}
              onClick={() => setTab(key)}
              aria-selected={tab === key}
              className={`min-h-10 flex-1 rounded-xl text-xs font-black transition-colors ${
                tab === key
                  ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          <>
            <section data-testid="recap-stats" className="grid grid-cols-2 gap-2">
              {stats.map(([Icon, label, value, tone]) => (
                <div key={label} className={`${CARD} flex flex-col gap-1`}>
                  <Icon size={18} />
                  <div className={`text-xl font-black tracking-tight ${tone}`} data-testid={`recap-stat-${label}`}>
                    {value}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400">{label}</div>
                </div>
              ))}
            </section>

            <section className={CARD}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-black text-[#11183d]">旅程足跡地圖</h3>
                {chosen && (
                  <button
                    type="button"
                    data-testid="recap-area-clear"
                    onClick={() => setArea(null)}
                    className="shrink-0 text-[11px] font-black text-violet-700"
                  >
                    看整趟
                  </button>
                )}
              </div>
              <div data-testid="recap-map-scope" className="mt-1 text-[11px] font-bold text-slate-400">
                {chosen ? chosen.label : '整趟旅程'}
              </div>
              {footprint ? (
                <img
                  data-testid="recap-footprint"
                  src={footprint}
                  alt="旅程足跡"
                  loading="lazy"
                  className="mt-3 w-full rounded-2xl border border-slate-100"
                />
              ) : (
                /* Nothing resolved to a position is nothing to draw. */
                <p data-testid="recap-footprint-empty" className="mt-2 text-[11px] leading-5 text-slate-500">
                  這趟旅程的行程還沒有可定位的地點，所以畫不出足跡。
                </p>
              )}
              {areas.length > 0 && (
                <div data-testid="recap-areas" className="mt-3 grid grid-cols-2 gap-2">
                  {areas.map(cluster => (
                    <button
                      key={cluster.id}
                      type="button"
                      data-testid={`recap-area-${cluster.id}`}
                      aria-pressed={area === cluster.id}
                      /* Pressing the chosen one again goes back to the whole trip. */
                      onClick={() => setArea(current => (current === cluster.id ? null : cluster.id))}
                      className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                        area === cluster.id
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-slate-100 bg-[#f8f9ff]'
                      }`}
                    >
                      <div className="truncate text-xs font-black text-[#11183d]">{cluster.label}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-slate-400">{cluster.places.length} 個地點</div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={CARD}>
              <div className="flex items-center gap-1.5">
                <Star size={16} className="text-amber-500" />
                <h3 className="font-black text-[#11183d]">旅程亮點</h3>
              </div>
              {recap.highlights.length > 0 ? (
                <ol data-testid="recap-highlights" className="mt-3 space-y-2">
                  {recap.highlights.map((stop, index) => (
                    <li key={stop.itemId}>
                      <button
                        type="button"
                        data-testid={`recap-highlight-${stop.itemId}`}
                        onClick={() => followHighlight(stop.itemId)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-[11px] font-black text-white">
                          {index + 1}
                        </span>
                        {stop.photo && <img src={stop.photo} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-black text-[#11183d]">{stop.title}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                            <Stars stop={stop} testId={`recap-highlight-stars-${stop.itemId}`} />
                            {stop.location && <span className="truncate">{stop.location}</span>}
                          </div>
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-slate-300" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                /*
                  Promoting three stops nobody praised would be making the
                  praise up. The way to fill this is to rate something, and
                  that is what it says.
                */
                <p data-testid="recap-highlights-empty" className="mt-2 text-[11px] leading-5 text-slate-500">
                  還沒有評分過的地點。記帳時順手給個星等，這裡就會列出這趟旅程最喜歡的前三名。
                </p>
              )}
            </section>
          </>
        )}

        {tab === 'days' && (
          <>
            {recap.days.length === 0 ? (
              <section className={CARD}>
                <p data-testid="recap-days-empty" className="text-[11px] leading-5 text-slate-500">
                  這趟旅程還沒有排進任何一天的行程。
                </p>
              </section>
            ) : (
              <>
                <div data-testid="recap-day-chips" className="flex gap-2 overflow-x-auto pb-1">
                  {recap.days.map((entry, index) => (
                    <button
                      key={entry.date}
                      type="button"
                      data-testid={`recap-day-chip-${entry.index}`}
                      onClick={() => setDay(index)}
                      aria-selected={current?.date === entry.date}
                      className={`shrink-0 rounded-2xl px-3 py-2 text-center text-[11px] font-black leading-4 transition-colors ${
                        current?.date === entry.date
                          ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm'
                          : 'border border-slate-100 bg-white text-slate-500'
                      }`}
                    >
                      <span className="block">第 {entry.index} 天</span>
                      <span className="block opacity-80">{dayLabel(entry.date)}</span>
                    </button>
                  ))}
                </div>
                <section className={CARD} data-testid="recap-day">
                  {/*
                    The day, over a photograph taken on it.

                    Their own, as everywhere else on this screen — and the
                    gradient when they took none, rather than a stock picture
                    of a city standing in for a Tuesday they actually had.
                  */}
                  <div
                    data-testid="recap-day-hero"
                    className="relative mb-3 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700"
                  >
                    {dayPhoto && <img src={dayPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#101638]/85 to-[#101638]/30" />
                    <div className="relative flex items-end justify-between gap-3 p-4 pt-10">
                      <div className="min-w-0">
                        <div className="text-lg font-black text-white">
                          Day {current.index} · {dayLabel(current.date)}
                        </div>
                      </div>
                      {onPlanDay && (
                        <button
                          type="button"
                          data-testid="recap-edit-day"
                          onClick={() => onPlanDay(current.date)}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-black text-indigo-700"
                        >
                          <NotebookPen size={12} />編輯這一天
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-black text-[#11183d]">
                    第 {current.index} 天 · {dayLabel(current.date)}
                  </h3>
                  {/*
                    What the day was made of. Counts of what is actually on it
                    — no weather, because nobody recorded the weather of a day
                    that has already happened, and no written summary, because
                    nobody wrote one.
                  */}
                  <div data-testid="recap-day-stats" className="mt-3 grid grid-cols-4 gap-1.5">
                    {[
                      [MapPin, current.stats.sights, '個景點'],
                      [UtensilsCrossed, current.stats.food, '家餐廳'],
                      [ShoppingBag, current.stats.shopping, '個購物'],
                      [Wallet, money(current.stats.twdAmount), '當日花費'],
                    ].map(([Icon, value, label]) => (
                      <div key={label as string} className="rounded-2xl border border-slate-100 bg-[#f8f9ff] px-2 py-2 text-center">
                        {React.createElement(Icon as React.ElementType, { size: 14, className: 'mx-auto text-violet-600' })}
                        <div className="mt-1 truncate text-[12px] font-black text-[#11183d]">{value as string}</div>
                        <div className="text-[10px] font-bold text-slate-400">{label as string}</div>
                      </div>
                    ))}
                  </div>
                  <ol className="mt-3 space-y-2">
                    {current.stops.map(stop => (
                      <li
                        key={stop.itemId}
                        data-testid={`recap-stop-${stop.itemId}`}
                        data-followed={followed === stop.itemId ? 'true' : undefined}
                        ref={followed === stop.itemId ? followedRef : undefined}
                        /* The rail: a day is a sequence, and the line says so. */
                        className={`relative flex gap-3 rounded-2xl border bg-white px-3 py-2.5 pl-6 shadow-sm ${followed === stop.itemId ? 'border-violet-300 ring-2 ring-violet-200' : 'border-slate-100'} before:absolute before:left-3 before:top-5 before:h-2 before:w-2 before:-translate-x-1/2 before:rounded-full before:bg-violet-500 after:absolute after:left-3 after:top-7 after:bottom-0 after:w-px after:-translate-x-1/2 after:bg-violet-100 last:after:hidden`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="shrink-0 rounded-lg bg-indigo-50 px-1.5 py-0.5 text-[11px] font-black text-indigo-800">{stop.time}</span>
                            <span className="truncate text-sm font-black text-[#11183d]">{stop.title}</span>
                            {/* Only when there is no picker below saying the same thing. */}
                            {!onRateStop && <Stars stop={stop} testId={`recap-stop-stars-${stop.itemId}`} />}
                          </div>
                          {/*
                            The stars, given here rather than at a till.

                            Pressing the star you already gave clears it:
                            「not rated」 has to be reachable again, or a
                            mis-tap is permanent.
                          */}
                          {onRateStop && (
                            <div
                              data-testid={`recap-rate-${stop.itemId}`}
                              className="mt-1 flex items-center gap-0.5"
                            >
                              <span className="sr-only" data-testid={`recap-stop-stars-${stop.itemId}`}>{starsFor(stop.rating)}</span>
                              {[1, 2, 3, 4, 5].map(value => (
                                <button
                                  key={value}
                                  type="button"
                                  aria-label={`${value} 星`}
                                  data-testid={`recap-rate-${stop.itemId}-${value}`}
                                  onClick={() => onRateStop(stop.itemId, stop.rating === value ? 0 : value)}
                                  className={`text-base leading-none ${
                                    (stop.rating ?? 0) >= value ? 'text-amber-500' : 'text-slate-200'
                                  }`}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {stop.category !== 'other' && (
                              <span className="inline-flex rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">
                                {CATEGORY_LABELS[stop.category]}
                              </span>
                            )}
                            {/* The ward, from the same grouping the areas above use. */}
                            {areaOf(stop.itemId) && (
                              <span
                                data-testid={`recap-stop-area-${stop.itemId}`}
                                className="inline-flex rounded-lg bg-violet-50 px-1.5 py-0.5 text-[10px] font-black text-violet-600"
                              >
                                {areaOf(stop.itemId)?.label}
                              </span>
                            )}
                          </div>
                          {stop.note && (
                            <p data-testid={`recap-stop-note-${stop.itemId}`} className="mt-1 text-[11px] leading-4 text-slate-600">
                              {stop.note}
                            </p>
                          )}
                          {typeof stop.twdAmount === 'number' && (
                            <div className="mt-1 text-[11px] font-bold text-slate-400">{money(stop.twdAmount)}</div>
                          )}
                          {/*
                            The traveller's own photographs of this stop.

                            Only theirs: these are the pictures taken of the
                            bills so far, and a place photo column is written
                            and unrun （`0029_itinerary_item_photos`）. Google's
                            picture of the same door would be a stranger's
                            photograph presented as a memory.
                          */}
                          {stop.photos && stop.photos.length > 0 && (
                            <div data-testid={`recap-stop-photos-${stop.itemId}`} className="mt-2 flex gap-1.5">
                              {stop.photos.slice(0, 3).map((shot, at) => (
                                <button
                                  key={shot}
                                  type="button"
                                  aria-label={`放大 ${stop.title} 的第 ${at + 1} 張照片`}
                                  data-testid={`recap-stop-photo-${stop.itemId}-${at}`}
                                  onClick={() => setViewing({ photos: stop.photos ?? [], index: at })}
                                >
                                  <img src={shot} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover" />
                                </button>
                              ))}
                              {/* The overflow opens at the fourth, not at the first. */}
                              {stop.photos.length > 3 && (
                                <button
                                  type="button"
                                  data-testid={`recap-stop-photo-more-${stop.itemId}`}
                                  onClick={() => setViewing({ photos: stop.photos ?? [], index: 3 })}
                                  className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-black text-slate-500"
                                >
                                  +{stop.photos.length - 3}
                                </button>
                              )}
                            </div>
                          )}
                          {/*
                            The diary for a stop that cost nothing.

                            「淺草寺啊啥的 應該要讓我點擊可以寫下日記」 — a temple
                            has no bill, so it had a grey pin and its name and
                            nothing else. Written against the item's own
                            `notes`, which has always synced.
                          */}
                          {/*
                            The trip's own note on the stop, which is not a
                            diary and never was: 「共 3 晚，退房 訂房編號…」 is
                            for whoever else is on the trip.
                          */}
                          {stop.diary && (
                            <p data-testid={`recap-stop-shared-note-${stop.itemId}`} className="mt-1 text-[11px] leading-4 text-slate-500">
                              {stop.diary}
                            </p>
                          )}
                          {onWriteDiary && editing === stop.itemId ? (
                            <div className="mt-2">
                              <textarea
                                data-testid={`recap-diary-input-${stop.itemId}`}
                                value={draft}
                                onChange={event => setDraft(event.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="這裡發生了什麼？只有你看得到。"
                                className="w-full rounded-xl border border-slate-200 p-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-violet-400"
                              />
              {/* 「日記只給自己看」 — and now it is. */}
                              <p data-testid={`recap-diary-private-${stop.itemId}`} className="mt-1 text-[10px] leading-4 text-slate-400">
                                只有你看得到。
                              </p>
                              <div className="mt-1.5 flex gap-2">
                                <button
                                  type="button"
                                  data-testid={`recap-diary-save-${stop.itemId}`}
                                  onClick={() => { onWriteDiary(stop.itemId, draft.trim()); setEditing(null); }}
                                  className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-1.5 text-[11px] font-black text-white"
                                >
                                  儲存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-500"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {journals[stop.itemId]?.text && (
                                <p data-testid={`recap-stop-diary-${stop.itemId}`} className="mt-1 rounded-xl bg-violet-50/60 px-2 py-1.5 text-[11px] leading-4 text-slate-700">
                                  {journals[stop.itemId].text}
                                </p>
                              )}
                              {onAddStopPhotos && (
                                <label
                                  data-testid={`recap-add-photo-${stop.itemId}`}
                                  className="mt-1.5 mr-3 inline-flex cursor-pointer items-center gap-1 text-[11px] font-black text-violet-700"
                                >
                                  <ImagePlus size={12} />加照片
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={async event => {
                                      const files = [...(event.target.files ?? [])];
                                      event.target.value = '';
                                      if (files.length === 0) return;
                                      const shots = await Promise.all(
                                        files.map(file => readAndDownscale(file, RECEIPT_PHOTO)),
                                      );
                                      onAddStopPhotos(stop.itemId, shots);
                                    }}
                                  />
                                </label>
                              )}
                              {onWriteDiary && (
                                <button
                                  type="button"
                                  data-testid={`recap-diary-open-${stop.itemId}`}
                                  onClick={() => { setDraft(journals[stop.itemId]?.text ?? ''); setEditing(stop.itemId); }}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-black text-violet-700"
                                >
                                  <NotebookPen size={12} />{journals[stop.itemId]?.text ? '編輯日記' : '寫下日記'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {onPlanDay && (
                    <button
                      type="button"
                      data-testid="recap-add-to-day"
                      onClick={() => onPlanDay(current.date)}
                      className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-violet-200 text-xs font-black text-violet-700"
                    >
                      <Plus size={14} />新增行程 / 記錄
                    </button>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {tab === 'picks' && (
          <>
            {[
              ['最愛景點', recap.favouritePlace, 'recap-pick-place'] as const,
              ['最愛餐廳', recap.favouriteMeal, 'recap-pick-meal'] as const,
            ].map(([label, stop, testId]) => (
              <section key={label} className={CARD}>
                <h3 className="font-black text-[#11183d]">{label}</h3>
                {stop ? (
                  /* Same gesture as 旅程亮點: the card names a stop, so it reaches it. */
                  <button
                    type="button"
                    data-testid={testId}
                    onClick={() => followHighlight(stop.itemId)}
                    className="mt-3 flex w-full items-center gap-3 text-left"
                  >
                    {/*
                      「就要有縮圖」, and the traveller's own picture first.

                      Their photograph of the place beats anybody's; only when
                      they took none does this fall to `PlaceThumbnail`, which
                      is this project's one answer to 「a picture for a place」
                      and has been rebuilt field by field four times already.
                    */}
                    {stop.photo
                      ? <img data-testid={`${testId}-photo`} src={stop.photo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      : (
                        <PlaceThumbnail
                          saved={{
                            placeName: stop.title,
                            latitude: stop.latitude,
                            longitude: stop.longitude,
                          } as SavedTravelInspiration}
                          size={56}
                          className="shrink-0 rounded-xl"
                        />
                      )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-[#11183d]">{stop.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Stars stop={stop} testId={`${testId}-stars`} />
                        {stop.location && <span className="truncate text-[11px] font-bold text-slate-400">{stop.location}</span>}
                      </div>
                      {/*
                        「如果我有筆記都用我的資料」 — what was written at the till
                        and what was written against the stop are both theirs,
                        and either is better than a blank card.
                      */}
                      {(stop.note || stop.diary) && (
                        <p data-testid={`${testId}-note`} className="mt-1 text-[11px] leading-4 text-slate-600">
                          {stop.note || stop.diary}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                ) : (
                  <p data-testid={`${testId}-empty`} className="mt-2 text-[11px] leading-5 text-slate-500">
                    還沒有評分過{label === '最愛餐廳' ? '餐廳' : '景點'}。
                  </p>
                )}
              </section>
            ))}

            <section className={CARD}>
              <div className="flex items-center gap-1.5">
                <Sparkles size={16} className="text-violet-600" />
                <h3 className="font-black text-[#11183d]">旅程小結</h3>
              </div>
              {/*
                Counts, not prose. A paragraph about how the trip felt is the
                one thing on this screen nobody recorded, and writing it with
                a model would put sentences in the traveller's mouth. What
                this can say is what it was given.
              */}
              <p data-testid="recap-summary" className="mt-2 text-xs leading-6 text-slate-600">
                {recap.stats.days} 天的旅程，走過 {recap.stats.places} 個地點、吃了 {recap.stats.meals} 餐，
                你自己花了 {money(recap.stats.totalTwd)}。
                {recap.highlights.length > 0 && `最喜歡的是 ${recap.highlights[0].title}。`}
              </p>
              {onOpenRecords && (
                <button
                  type="button"
                  onClick={onOpenRecords}
                  className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-violet-50 text-xs font-black text-violet-700"
                >
                  查看完整帳本
                </button>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default TripRecapScreen;
