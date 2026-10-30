import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TripWays from './TripWays';
import { AlertCircle, ArrowRight, CalendarRange, CloudSun, Coffee, Images, Map, MapPin, MoreHorizontal, Navigation, Plus, Receipt, ShoppingBag, TrainFront, Users } from 'lucide-react';
import { Category, Expense, ItineraryItem, TripMember } from '../types';
import { WeatherSnapshot } from '../services/weatherService';
import { tomorrowLabel, whatToWear } from '../services/whatToWear';
import { estimateRoute, RouteEstimate } from '../services/routesService';
import { localDateKey, selectNextStop } from '../services/nextStop';
import { expenseCostToViewer, ownerMemberIdOf } from '../services/viewerSpend';

interface Props {
  expenses: Expense[];
  itinerary: ItineraryItem[];
  startDate?: string;
  endDate?: string;
  onQuickAdd: (category?: Category) => void;
  onOpenPlanning: () => void;
  onOpenRecords: () => void;
  destination: string;
  destinationCoordinates?: { latitude: number; longitude: number };
  destinationCountry?: string;
  /**
   * Who is reading, and the roster their share is worked out against.
   *
   * 「我打開看會是這樣 但我今天只有花 998」 — this card summed `twdAmount`, the
   * whole of every bill on the day, including the half somebody else carries
   * and the bills they paid for themselves. `expenseCostToViewer` is the one
   * place that answers 「what did this cost *me*」, and four other screens were
   * already using it. Without a viewer the full amount is still the honest
   * answer: a solo ledger has nobody to apportion to.
   */
  viewerMemberId?: string;
  members?: TripMember[];
  /**
   * The row of ways out of this screen.
   *
   * Each is omitted rather than disabled when the caller has nowhere to send
   * it — and omitting the handler is also how a tile is removed. 「拿掉這個」
   * took 旅伴 and 更多 off the row, both of which are already in the bar at
   * the bottom of every screen; the row simply draws what it is given.
   */
  onOpenMap?: () => void;
  onOpenShoppingList?: () => void;
  onOpenCompanions?: () => void;
  onOpenMore?: () => void;
  /**
   * The full 旅程回顧 screen.
   *
   * The strip below is a dozen photographs; the review counts the days, maps
   * where the trip went and names what was liked best. 查看全部 used to go to
   * the ledger, which answered a different question.
   */
  onOpenRecap?: () => void;
}
const timeToMinutes = (value: string) => {
  const match = value.trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$|:)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
};

const TripLiveOverview: React.FC<Props> = ({ expenses, itinerary, startDate, endDate, onQuickAdd, onOpenPlanning, onOpenRecords, destination, destinationCoordinates, destinationCountry, viewerMemberId, members = [], onOpenMap, onOpenShoppingList, onOpenCompanions, onOpenMore, onOpenRecap }) => {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [weatherRetry, setWeatherRetry] = useState(0);
  const [runtimeLocation, setRuntimeLocation] = useState<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(null);
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
  const [routeForStop, setRouteForStop] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<'location' | 'route' | null>(null);
  /*
    A clock that moves.

    `new Date()` read once at render meant the card froze at whatever time it
    first mounted — on a phone left open all afternoon, 下一站 was answering a
    question about the morning. It re-reads every half minute, which is finer
    than any itinerary needs and cheap enough not to matter.
  */
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const tick = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, []);
  const today = localDateKey(clock);
  const currentMinutes = clock.getHours() * 60 + clock.getMinutes();
  const todayExpenses = expenses.filter(expense => expense.phase === 'during' && expense.date.slice(0, 10) === today);
  const todayTotal = todayExpenses.reduce(
    (sum, expense) => sum + expenseCostToViewer(expense, viewerMemberId, ownerMemberIdOf(members)),
    0,
  );

  const outsideTrip = Boolean((startDate && today < startDate) || (endDate && today > endDate));
  const todayItems = outsideTrip ? [] : itinerary.filter(item => item.date === today);
  const completedCount = todayItems.filter(item => item.isCompleted === true).length;
  /*
    The clock decides which stop is next, not merely the order of the ones left.

    「現在是晚上十點半 他沒有跟著本機時間在判斷下一站」 — at 22:37 this card was
    pointing at a 14:35 flight from Taoyuan, because an unticked item counted as
    still to come no matter how long ago it was. Nobody ticks boxes while
    travelling; 0/6 項已完成 on the same screen says so.
  */
  const next = selectNextStop(itinerary, clock, { startDate, endDate });
  const nextStop = next?.item;
  /*
    A stop on another day has to say which one. 「09:00 甘川洞文化村」 at half past
    ten at night is only useful once it is clear that is tomorrow morning.
  */
  const nextStopDayLabel = (() => {
    if (!nextStop?.date || next?.kind !== 'later_day') return null;
    const tomorrow = new Date(clock);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return nextStop.date === localDateKey(tomorrow) ? t('tripLive.tomorrow') : nextStop.date.slice(5).replace('-', '/');
  })();
  const hasValidCoordinates = (item: ItineraryItem) => typeof item.latitude === 'number' && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90 && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180;
  const nextStopCoordinates = nextStop && hasValidCoordinates(nextStop) ? { latitude: nextStop.latitude as number, longitude: nextStop.longitude as number } : undefined;
  const nextStopText = nextStop && (nextStop.address || nextStop.location) ? (nextStop.address || nextStop.location) : undefined;
  const todayCoordinateItem = todayItems.find(item => item.isCompleted !== true && hasValidCoordinates(item)) || todayItems.find(hasValidCoordinates);
  const todayCoordinates = todayCoordinateItem ? { latitude: todayCoordinateItem.latitude as number, longitude: todayCoordinateItem.longitude as number } : undefined;
  const todayTextItem = todayItems.find(item => item.isCompleted !== true && (item.address || item.location)) || todayItems.find(item => item.address || item.location);
  const selectedCoordinates = nextStopCoordinates || todayCoordinates || destinationCoordinates;
  const selectedDestination = nextStopCoordinates ? destination : nextStopText || (todayTextItem ? (todayTextItem.address || todayTextItem.location) : destination);
  // i18n-data: regex anchors matched against a stop's own address text, not copy.
  const embeddedCountry = nextStopText?.match(/\bSouth Korea\b|\bKorea\b|韓國|韩国/i)?.[0];
  const selectedCountry = destinationCountry || embeddedCountry;
  const weatherParams = new URLSearchParams();
  if (selectedCoordinates) { weatherParams.set('latitude', String(selectedCoordinates.latitude)); weatherParams.set('longitude', String(selectedCoordinates.longitude)); }
  if (selectedDestination) weatherParams.set('destination', selectedDestination);
  if (selectedCountry) weatherParams.set('country', selectedCountry);
  const weatherRequest = `/api/weather?${weatherParams.toString()}`;
  const navigationTarget = nextStop && (nextStopCoordinates || nextStop.location || nextStop.address) ? nextStopCoordinates ? `https://www.google.com/maps/dir/?api=1&destination=${nextStopCoordinates.latitude},${nextStopCoordinates.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextStop.address || nextStop.location)}` : null;
  const requestRouteEstimate = () => {
    if (!nextStop || !nextStopCoordinates || !navigator.geolocation) { setRouteError('location'); return; }
    setRouteLoading(true); setRouteError(null); setRouteEstimate(null); setRouteForStop(null);
    navigator.geolocation.getCurrentPosition(async position => {
      const current = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp };
      setRuntimeLocation(current);
      try {
        const estimate = await estimateRoute(current, nextStopCoordinates);
        setRouteEstimate(estimate); setRouteForStop(nextStop.id);
      } catch { setRouteError('route'); }
      finally { setRouteLoading(false); }
    }, () => { setRouteLoading(false); setRouteError('location'); setRouteEstimate(null); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };
  useEffect(() => { setRouteEstimate(null); setRouteForStop(null); setRouteError(null); }, [nextStop?.id, nextStop?.latitude, nextStop?.longitude]);
  const routeIsCurrent = Boolean(routeEstimate && routeForStop === nextStop?.id);
  const routeMinutes = routeIsCurrent && routeEstimate ? Math.max(1, Math.ceil(routeEstimate.durationSeconds / 60)) : null;
  const departureLabel = routeMinutes !== null && nextStop ? (() => { const scheduled = timeToMinutes(nextStop.time); if (scheduled === null || scheduled <= currentMinutes || scheduled - routeMinutes - 10 <= currentMinutes) return t('tripLive.departNow'); const value = scheduled - routeMinutes - 10; return t('tripLive.departAt', { time: `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }); })() : null;
  useEffect(() => {
    if (!destination.trim() && !selectedCoordinates && !selectedDestination) { setWeather(null); setWeatherError(true); return; }
    let cancelled = false; setWeatherLoading(true); setWeatherError(false);
    fetch(weatherRequest).then(async response => { const body = await response.json().catch(() => null); if (!response.ok) throw new Error(`${response.status}: ${body?.error || 'request failed'}`); return body as WeatherSnapshot; }).then(body => { if (!cancelled) setWeather(body); }).catch(() => { if (!cancelled) { setWeather(null); setWeatherError(true); } }).finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDestination, selectedCountry, selectedCoordinates?.latitude, selectedCoordinates?.longitude, weatherRetry, nextStop?.id, nextStop?.latitude, nextStop?.longitude, nextStop?.location, nextStop?.address, todayCoordinateItem?.id, todayTextItem?.id]);
  /*
    The label travels as a key, resolved at render.

    This `const` used to sit at module scope holding the Chinese words, which a
    `t()` could not replace: the module runs once at import, so the row would
    have frozen in whatever language the app booted in. The `Category.*` beside
    each label is the stored enum value and does not move.
  */
  const quickActions = [
    [Coffee, 'tripLive.quickAction.food', Category.FOOD],
    [TrainFront, 'tripLive.quickAction.transport', Category.TRANSPORT],
    [ShoppingBag, 'tripLive.quickAction.shopping', Category.SHOPPING],
    [Plus, 'tripLive.quickAction.other', Category.OTHER],
  ] as const;
  /*
    The photographs this trip holds, newest first.

    Only the traveller's own: receipt photos are what this app has actually
    been given. A strip of Google's pictures of the same places would be
    captioning somebody else's photos as their trip.
  */
  const memories = [...expenses]
    .sort((left, right) => (right.date || '').localeCompare(left.date || ''))
    .flatMap(expense => expense.receiptPhotos ?? [])
    .slice(0, 12);

  return <div className="space-y-3 pb-4">
    {/* The ways out, as a row. One row, shared with a finished trip. */}
    <TripWays
      onOpenPlanning={onOpenPlanning}
      onOpenMap={onOpenMap}
      onOpenShoppingList={onOpenShoppingList}
      onOpenRecap={onOpenRecap}
      onOpenCompanions={onOpenCompanions}
      onOpenMore={onOpenMore}
    />
    <section className="rounded-[1.6rem] border border-indigo-100 bg-gradient-to-br from-[#eef1ff] via-white to-[#f8f7ff] p-4 shadow-[0_10px_28px_rgba(66,74,150,.10)]">
      <div className="mb-4 flex items-start justify-between"><div><span className="inline-flex rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-1 text-[11px] font-black text-white shadow-sm">{t('tripLive.badgeOngoing')}</span><h1 className="mt-2 text-2xl font-black tracking-tight text-[#11183d]">{t('tripLive.title')}</h1></div><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm" aria-hidden="true">♧</span></div>
      <div className="mb-2 flex items-center justify-between"><div className="text-base font-black">{t('tripLive.nextStop')}</div><span className="text-[10px] font-bold text-slate-400">LIVE</span></div>
      <div className="min-h-[6.6rem] rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_5px_16px_rgba(30,41,90,.07)]">{nextStop ? <div><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 px-2.5 py-1 text-lg font-black text-indigo-800">{nextStop.time}</span>{nextStopDayLabel && <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{nextStopDayLabel}</span>}{next?.kind === 'now' && <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">{t('tripLive.now')}</span>}<span className="truncate text-lg font-black">{nextStop.title}</span></div>{nextStop.location && <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} />{nextStop.location}</div>}</div><div className="flex shrink-0 items-center gap-2">{navigationTarget && <a href={navigationTarget} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white"><Navigation size={14} />{t('tripLive.navigate')}</a>}<button onClick={onOpenPlanning} className="flex min-h-10 items-center gap-1 rounded-xl bg-indigo-50 px-3 text-xs font-black text-indigo-700">{t('tripLive.viewItinerary')}</button></div></div>{nextStopCoordinates && <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">{routeIsCurrent && routeEstimate ? <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-600"><div><div className="text-[10px] font-semibold text-slate-400">{t('tripLive.distance')}</div><div>{(routeEstimate.distanceMeters / 1000).toFixed(1)} km</div></div><div><div className="text-[10px] font-semibold text-slate-400">{t('tripLive.estimate')}</div><div>{t('tripLive.minutes', { minutes: routeMinutes })}</div></div><div><div className="text-[10px] font-semibold text-slate-400">{t('tripLive.depart')}</div><div className="text-indigo-700">{departureLabel}</div></div></div> : <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={requestRouteEstimate} disabled={routeLoading} className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-2 text-xs font-black text-white shadow-sm disabled:opacity-60">{routeLoading ? t('tripLive.estimatingRoute') : t('tripLive.estimateFromLocation')}</button>{routeError === 'location' && <span className="text-xs font-bold text-slate-500">{t('tripLive.locationUnavailable')}</span>}{routeError === 'route' && <span className="text-xs font-bold text-slate-500">{t('tripLive.routeUnavailable')}</span>}</div>}</div>}</div> : <div className="flex min-h-[4.8rem] items-center justify-between gap-3"><div><div className="text-lg font-black text-slate-700">{t('tripLive.noNextStop')}</div><p className="mt-1 text-xs leading-5 text-slate-500">{t('tripLive.noNextStopBlurb')}</p></div><button onClick={onOpenPlanning} className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-black text-white"><Navigation size={14} />{t('tripLive.goPlan')}</button></div>}</div>
      <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_4px_14px_rgba(30,41,90,.05)]"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><AlertCircle size={16} /></span><div className="min-w-0 flex-1"><div className="text-sm font-black">{outsideTrip ? t('tripLive.outsideTrip') : todayItems.length > 0 ? t('tripLive.todayProgress', { completed: completedCount, total: todayItems.length }) : t('tripLive.nothingToday')}</div><div className="mt-1 text-[11px] text-slate-400">{outsideTrip ? t('tripLive.outsideTripHint') : todayItems.length > 0 ? t('tripLive.todayProgressHint') : t('tripLive.nothingTodayHint')}</div></div><button onClick={onOpenPlanning} className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700">{t('tripLive.viewItinerary')}</button></div><div className="mt-3 h-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-slate-300" style={{ width: todayItems.length > 0 ? `${(completedCount / todayItems.length) * 100}%` : '0%' }} /></div></div>
      <div className="mt-3 min-h-[5.25rem] rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_5px_16px_rgba(30,41,90,.06)]">{weatherLoading ? <div className="flex min-h-[3.4rem] items-center gap-3 text-sm font-bold text-slate-500"><CloudSun size={25} className="text-slate-300" />{t('tripLive.weatherLoading')}</div> : weatherError || !weather ? <div className="flex min-h-[3.4rem] items-center gap-3"><CloudSun size={28} className="text-slate-300" /><div className="flex-1 text-sm font-bold text-slate-500">{t('tripLive.weatherUnavailable')}</div><button onClick={() => setWeatherRetry(value => value + 1)} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-indigo-700">{t('tripLive.retry')}</button></div> : <div className="flex items-center gap-3"><span className="text-3xl">{weather.precipitationProbability >= 50 ? '🌧️' : '☁️'}</span><div><div className="text-2xl font-black">{Math.round(weather.temperature)}°C</div><div className="text-xs font-bold text-slate-500">{t('tripLive.conditionHighLow', { condition: weather.condition, high: Math.round(weather.high), low: Math.round(weather.low) })}</div></div><div className="ml-auto text-right text-xs font-bold text-slate-500">{t('tripLive.rainChance')}<br /><span className="text-sm text-indigo-700">{weather.precipitationProbability}%</span></div></div>}
      {/*
        明天的衣著建議. 「少一個明天衣著建議！」

        Derived from the forecast printed above it rather than written by a
        model: a sentence about a jacket is only useful if it agrees with the
        numbers beside it, and two writers of one fact is the defect this
        project is made of. See `whatToWear`.
      */}
      {weather?.tomorrow && (
        <div data-testid="what-to-wear" className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-black text-[#11183d]">{t('tripLive.whatToWearTomorrow')}</span>
            <span className="text-[11px] font-bold text-slate-400">{tomorrowLabel(weather.tomorrow)}</span>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {whatToWear(weather.tomorrow).map(line => (
              <li key={line} className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />{line}
              </li>
            ))}
          </ul>
        </div>
      )}</div>
    </section>
    <section className="rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(66,74,150,.07)]"><div className="mb-2 flex items-center justify-between"><div><h2 className="font-black">{t('tripLive.todaySpend')}</h2><div className="mt-1 text-[11px] text-slate-400">{t('tripLive.todaySpendHint')}</div></div><Receipt size={18} className="text-violet-600" /></div><div className="text-3xl font-black tracking-tight text-[#11183d]">NT$ {Math.round(todayTotal).toLocaleString()}</div><button onClick={onOpenRecords} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-xl bg-violet-50 text-xs font-black text-violet-700">{t('saved.viewRecord')}<ArrowRight size={13} /></button></section>
    {/*
      旅程回顧.

      「100%還原」 — and the only photographs this trip actually holds are the
      ones the traveller took of their own bills. There is no album; inventing
      one would be a different product, and filling this strip with Google's
      pictures of the places would be captioning somebody else's photos as
      their trip.

      So it is their own, newest first, and it says what it is.
    */}
    {memories.length > 0 && (
      <section data-testid="trip-memories" className="rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(66,74,150,.07)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            {/*
              Named for what it holds, not for where 旅程回顧 lives.

              「回顧不是應該在這嗎」 put the review in the row of tiles above,
              which is where it belongs. This strip briefly carried the same
              name and a second button to the same screen — the duplicate door
              that 旅伴 and 更多 were taken off this very row for.
            */}
            <h2 className="font-black">{t('tripLive.photosTitle')}</h2>
            <div className="mt-1 text-[11px] text-slate-400">{t('tripLive.photosHint')}</div>
          </div>
          <button onClick={onOpenRecords} className="flex shrink-0 items-center gap-1 text-xs font-black text-violet-700">
            {t('settle.viewAll')}<ArrowRight size={13} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {memories.map(photo => (
            <img
              key={photo}
              src={photo}
              alt=""
              loading="lazy"
              className="h-24 w-24 shrink-0 rounded-2xl object-cover"
            />
          ))}
        </div>
      </section>
    )}

    <section className="rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(66,74,150,.07)]"><h2 className="mb-3 font-black">{t('tripLive.quickAdd')}</h2><div className="grid grid-cols-4 gap-2">{quickActions.map(([Icon, labelKey, category]) => <button key={labelKey} onClick={() => onQuickAdd(category)} className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"><Icon size={20} />{t(labelKey)}</button>)}</div></section>
  </div>;
};
export default TripLiveOverview;
