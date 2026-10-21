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
import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, MapPin, NotebookPen, Receipt, Sparkles, Star, UtensilsCrossed } from 'lucide-react';
import { Expense, Trip, TripMember } from '../types';
import { RecapStop, buildTripRecap, isGettingThere, starsFor } from '../services/tripRecap';
import { buildTripAreas } from '../services/tripAreas';
import { dayMapSrc } from '../services/dayMapImage';
import { CATEGORY_LABELS } from '../services/placeCategory';
import TripCover from './TripCover';

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
   * Writes the traveller's own account of a stop.
   *
   * Saved onto the itinerary item's `notes`, so it travels with the trip and
   * is readable by whoever else is on it — rather than into a device-local
   * store, which is the shape that cost this morning.
   */
  onWriteDiary?: (itemId: string, text: string) => void;
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

const TripRecapScreen: React.FC<Props> = ({ trip, expenses, today, viewerMemberId, members, onBack, onOpenRecords, onWriteDiary }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const recap = useMemo(
    () => buildTripRecap({ trip, expenses, today, viewerMemberId, members }),
    [trip, expenses, today, viewerMemberId, members],
  );
  const [day, setDay] = useState(0);
  /** The stop whose diary is open, and what has been typed into it. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  /*
    The areas, from the same grouping the collection screen uses. 新宿區 4個景點
    is a count of this trip's stops in that ward, not of everything saved
    there — the review is about where this trip went.
  */
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
  const pins = recap.visited.filter(
    stop => typeof stop.latitude === 'number' && stop.category !== 'transport',
  );
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

  return (
    <div className="min-h-full bg-[#f6f7fc] pb-8">
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
        <h1 className="text-lg font-black tracking-tight text-[#11183d]">旅程回顧</h1>
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
              <h3 className="font-black text-[#11183d]">旅程足跡地圖</h3>
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
                  {areas.map(area => (
                    <div key={area.id} className="rounded-2xl border border-slate-100 bg-[#f8f9ff] px-3 py-2.5">
                      <div className="truncate text-xs font-black text-[#11183d]">{area.label}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-slate-400">{area.places.length} 個地點</div>
                    </div>
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
                    <li key={stop.itemId} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
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
                      className={`min-h-10 shrink-0 rounded-xl px-3 text-[11px] font-black transition-colors ${
                        current?.date === entry.date
                          ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-sm'
                          : 'border border-slate-100 bg-white text-slate-500'
                      }`}
                    >
                      第 {entry.index} 天 · {dayLabel(entry.date)}
                    </button>
                  ))}
                </div>
                <section className={CARD} data-testid="recap-day">
                  <h3 className="font-black text-[#11183d]">
                    第 {current.index} 天 · {dayLabel(current.date)}
                  </h3>
                  <ol className="mt-3 space-y-2">
                    {current.stops.map(stop => (
                      <li
                        key={stop.itemId}
                        data-testid={`recap-stop-${stop.itemId}`}
                        className="flex gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                      >
                        {stop.photo
                          ? <img src={stop.photo} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                          : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-300"><MapPin size={18} /></span>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="shrink-0 rounded-lg bg-indigo-50 px-1.5 py-0.5 text-[11px] font-black text-indigo-800">{stop.time}</span>
                            <span className="truncate text-sm font-black text-[#11183d]">{stop.title}</span>
                            <Stars stop={stop} testId={`recap-stop-stars-${stop.itemId}`} />
                          </div>
                          {stop.category !== 'other' && (
                            <span className="mt-1 inline-flex rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">
                              {CATEGORY_LABELS[stop.category]}
                            </span>
                          )}
                          {stop.note && (
                            <p data-testid={`recap-stop-note-${stop.itemId}`} className="mt-1 text-[11px] leading-4 text-slate-600">
                              {stop.note}
                            </p>
                          )}
                          {typeof stop.twdAmount === 'number' && (
                            <div className="mt-1 text-[11px] font-bold text-slate-400">{money(stop.twdAmount)}</div>
                          )}
                          {/*
                            The diary for a stop that cost nothing.

                            「淺草寺啊啥的 應該要讓我點擊可以寫下日記」 — a temple
                            has no bill, so it had a grey pin and its name and
                            nothing else. Written against the item's own
                            `notes`, which has always synced.
                          */}
                          {onWriteDiary && editing === stop.itemId ? (
                            <div className="mt-2">
                              <textarea
                                data-testid={`recap-diary-input-${stop.itemId}`}
                                value={draft}
                                onChange={event => setDraft(event.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="這裡發生了什麼？"
                                className="w-full rounded-xl border border-slate-200 p-2 text-[12px] leading-5 text-slate-700 outline-none focus:border-violet-400"
                              />
                              {/*
                                「日記只給自己看」 — and this is not that yet.

                                It writes the trip's own note on the stop,
                                which everybody on the trip reads. The private
                                journal needs a table of its own （see
                                `0030_itinerary_journals`）; until that exists,
                                the honest thing is to say whose eyes this is
                                in front of rather than let somebody write
                                something personal into it.
                              */}
                              <p data-testid={`recap-diary-shared-${stop.itemId}`} className="mt-1 text-[10px] leading-4 text-amber-600">
                                這則目前是行程備註，同行的人也看得到。私人日記還在等資料表建立。
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
                              {stop.diary && (
                                <p data-testid={`recap-stop-diary-${stop.itemId}`} className="mt-1 text-[11px] leading-4 text-slate-700">
                                  {stop.diary}
                                </p>
                              )}
                              {onWriteDiary && (
                                <button
                                  type="button"
                                  data-testid={`recap-diary-open-${stop.itemId}`}
                                  onClick={() => { setDraft(stop.diary ?? ''); setEditing(stop.itemId); }}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-black text-violet-700"
                                >
                                  <NotebookPen size={12} />{stop.diary ? '編輯備註' : '寫下備註'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
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
                  <div data-testid={testId} className="mt-3 flex items-center gap-3">
                    {stop.photo && <img src={stop.photo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-[#11183d]">{stop.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Stars stop={stop} testId={`${testId}-stars`} />
                        {stop.location && <span className="truncate text-[11px] font-bold text-slate-400">{stop.location}</span>}
                      </div>
                      {stop.note && <p className="mt-1 text-[11px] leading-4 text-slate-600">{stop.note}</p>}
                    </div>
                  </div>
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
