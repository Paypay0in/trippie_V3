import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CloudSun, Coffee, MapPin, Navigation, Plus, Receipt, ShoppingBag, TrainFront } from 'lucide-react';
import { Category, Expense, ItineraryItem } from '../types';
import { WeatherSnapshot } from '../services/weatherService';
import { estimateRoute, RouteEstimate } from '../services/routesService';

interface Props { expenses: Expense[]; itinerary: ItineraryItem[]; startDate?: string; endDate?: string; onQuickAdd: (category?: Category) => void; onOpenPlanning: () => void; onOpenRecords: () => void; destination: string; destinationCoordinates?: { latitude: number; longitude: number }; destinationCountry?: string; }
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timeToMinutes = (value: string) => {
  const match = value.trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$|:)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
};

const TripLiveOverview: React.FC<Props> = ({ expenses, itinerary, startDate, endDate, onQuickAdd, onOpenPlanning, onOpenRecords, destination, destinationCoordinates, destinationCountry }) => {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [weatherRetry, setWeatherRetry] = useState(0);
  const [runtimeLocation, setRuntimeLocation] = useState<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(null);
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
  const [routeForStop, setRouteForStop] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<'location' | 'route' | null>(null);
  const today = localDateKey(new Date());
  const todayExpenses = expenses.filter(expense => expense.phase === 'during' && expense.date.slice(0, 10) === today);
  const todayTotal = todayExpenses.reduce((sum, expense) => sum + expense.twdAmount, 0);
  const now = new Date(); const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const outsideTrip = Boolean((startDate && today < startDate) || (endDate && today > endDate));
  const todayItems = outsideTrip ? [] : itinerary.filter(item => item.date === today);
  const completedCount = todayItems.filter(item => item.isCompleted === true).length;
  // Every incomplete item scheduled for today remains actionable, even after its
  // scheduled time has passed. Time is only used to order unresolved stops.
  const upcomingItems = todayItems
    .filter(item => item.isCompleted !== true)
    .map(item => ({ item, minutes: timeToMinutes(item.time) }))
    .sort((a, b) => {
      if (a.minutes === null) return 1;
      if (b.minutes === null) return -1;
      return a.minutes - b.minutes;
    })
    .map(candidate => candidate.item);
  const nextStop = upcomingItems[0];
  const hasValidCoordinates = (item: ItineraryItem) => typeof item.latitude === 'number' && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90 && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180;
  const nextStopCoordinates = nextStop && hasValidCoordinates(nextStop) ? { latitude: nextStop.latitude as number, longitude: nextStop.longitude as number } : undefined;
  const nextStopText = nextStop && (nextStop.address || nextStop.location) ? (nextStop.address || nextStop.location) : undefined;
  const todayCoordinateItem = todayItems.find(item => item.isCompleted !== true && hasValidCoordinates(item)) || todayItems.find(hasValidCoordinates);
  const todayCoordinates = todayCoordinateItem ? { latitude: todayCoordinateItem.latitude as number, longitude: todayCoordinateItem.longitude as number } : undefined;
  const todayTextItem = todayItems.find(item => item.isCompleted !== true && (item.address || item.location)) || todayItems.find(item => item.address || item.location);
  const selectedCoordinates = nextStopCoordinates || todayCoordinates || destinationCoordinates;
  const selectedDestination = nextStopCoordinates ? destination : nextStopText || (todayTextItem ? (todayTextItem.address || todayTextItem.location) : destination);
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
  const departureLabel = routeMinutes !== null && nextStop ? (() => { const scheduled = timeToMinutes(nextStop.time); if (scheduled === null || scheduled <= currentMinutes || scheduled - routeMinutes - 10 <= currentMinutes) return '建議立即出發'; const value = scheduled - routeMinutes - 10; return `建議 ${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')} 出發`; })() : null;
  useEffect(() => {
    if (!destination.trim() && !selectedCoordinates && !selectedDestination) { setWeather(null); setWeatherError(true); return; }
    let cancelled = false; setWeatherLoading(true); setWeatherError(false);
    fetch(weatherRequest).then(async response => { const body = await response.json().catch(() => null); if (!response.ok) throw new Error(`${response.status}: ${body?.error || 'request failed'}`); return body as WeatherSnapshot; }).then(body => { if (!cancelled) setWeather(body); }).catch(() => { if (!cancelled) { setWeather(null); setWeatherError(true); } }).finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDestination, selectedCountry, selectedCoordinates?.latitude, selectedCoordinates?.longitude, weatherRetry, nextStop?.id, nextStop?.latitude, nextStop?.longitude, nextStop?.location, nextStop?.address, todayCoordinateItem?.id, todayTextItem?.id]);
  const quickActions = [[Coffee, '餐飲', Category.FOOD], [TrainFront, '交通', Category.TRANSPORT], [ShoppingBag, '購物', Category.SHOPPING], [Plus, '其他', Category.OTHER]] as const;
  return <div className="space-y-3 pb-4">
    <section className="rounded-[1.6rem] border border-indigo-100 bg-gradient-to-br from-[#eef1ff] via-white to-[#f8f7ff] p-4 shadow-[0_10px_28px_rgba(66,74,150,.10)]">
      <div className="mb-4 flex items-start justify-between"><div><span className="inline-flex rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-1 text-[11px] font-black text-white shadow-sm">進行中</span><h1 className="mt-2 text-2xl font-black tracking-tight text-[#11183d]">旅程現況</h1></div><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm" aria-hidden="true">♧</span></div>
      <div className="mb-2 flex items-center justify-between"><div className="text-base font-black">下一站</div><span className="text-[10px] font-bold text-slate-400">LIVE</span></div>
      <div className="min-h-[6.6rem] rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_5px_16px_rgba(30,41,90,.07)]">{nextStop ? <div><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 px-2.5 py-1 text-lg font-black text-indigo-800">{nextStop.time}</span><span className="truncate text-lg font-black">{nextStop.title}</span></div>{nextStop.location && <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} />{nextStop.location}</div>}</div><div className="flex shrink-0 items-center gap-2">{navigationTarget && <a href={navigationTarget} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white"><Navigation size={14} />導航</a>}<button onClick={onOpenPlanning} className="flex min-h-10 items-center gap-1 rounded-xl bg-indigo-50 px-3 text-xs font-black text-indigo-700">查看行程</button></div></div>{nextStopCoordinates && <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">{routeIsCurrent && routeEstimate ? <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-600"><div><div className="text-[10px] font-semibold text-slate-400">距離</div><div>{(routeEstimate.distanceMeters / 1000).toFixed(1)} km</div></div><div><div className="text-[10px] font-semibold text-slate-400">預估</div><div>{routeMinutes} 分鐘</div></div><div><div className="text-[10px] font-semibold text-slate-400">出發</div><div className="text-indigo-700">{departureLabel}</div></div></div> : <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={requestRouteEstimate} disabled={routeLoading} className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-2 text-xs font-black text-white shadow-sm disabled:opacity-60">{routeLoading ? '正在估算路線…' : '取得目前位置，估算出發時間'}</button>{routeError === 'location' && <span className="text-xs font-bold text-slate-500">無法取得目前位置</span>}{routeError === 'route' && <span className="text-xs font-bold text-slate-500">暫時無法計算路線</span>}</div>}</div>}</div> : <div className="flex min-h-[4.8rem] items-center justify-between gap-3"><div><div className="text-lg font-black text-slate-700">下一站尚未設定</div><p className="mt-1 text-xs leading-5 text-slate-500">目前沒有可由今日行程確認的下一站。</p></div><button onClick={onOpenPlanning} className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-black text-white"><Navigation size={14} />去規劃行程</button></div>}</div>
      <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-[0_4px_14px_rgba(30,41,90,.05)]"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><AlertCircle size={16} /></span><div className="min-w-0 flex-1"><div className="text-sm font-black">{outsideTrip ? '目前日期不在此旅程期間' : todayItems.length > 0 ? `今日行程 ${completedCount} / ${todayItems.length} 項已完成` : '今日尚未安排任何行程'}</div><div className="mt-1 text-[11px] text-slate-400">{outsideTrip ? '可查看此旅程的完整行程安排' : todayItems.length > 0 ? '完成狀態來自已保存的行程資料' : '前往行程頁新增或編輯今天的安排'}</div></div><button onClick={onOpenPlanning} className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700">查看行程</button></div><div className="mt-3 h-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-slate-300" style={{ width: todayItems.length > 0 ? `${(completedCount / todayItems.length) * 100}%` : '0%' }} /></div></div>
      <div className="mt-3 min-h-[5.25rem] rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_5px_16px_rgba(30,41,90,.06)]">{weatherLoading ? <div className="flex min-h-[3.4rem] items-center gap-3 text-sm font-bold text-slate-500"><CloudSun size={25} className="text-slate-300" />正在取得天氣…</div> : weatherError || !weather ? <div className="flex min-h-[3.4rem] items-center gap-3"><CloudSun size={28} className="text-slate-300" /><div className="flex-1 text-sm font-bold text-slate-500">目前無法取得天氣</div><button onClick={() => setWeatherRetry(value => value + 1)} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-indigo-700">重試</button></div> : <div className="flex items-center gap-3"><span className="text-3xl">{weather.precipitationProbability >= 50 ? '🌧️' : '☁️'}</span><div><div className="text-2xl font-black">{Math.round(weather.temperature)}°C</div><div className="text-xs font-bold text-slate-500">{weather.condition} · 高 {Math.round(weather.high)}° / 低 {Math.round(weather.low)}°</div></div><div className="ml-auto text-right text-xs font-bold text-slate-500">降雨機率<br /><span className="text-sm text-indigo-700">{weather.precipitationProbability}%</span></div></div>}</div>
    </section>
    <section className="rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(66,74,150,.07)]"><div className="mb-2 flex items-center justify-between"><div><h2 className="font-black">今日花費</h2><div className="mt-1 text-[11px] text-slate-400">今日旅行中的已記錄支出</div></div><Receipt size={18} className="text-violet-600" /></div><div className="text-3xl font-black tracking-tight text-[#11183d]">NT$ {Math.round(todayTotal).toLocaleString()}</div><button onClick={onOpenRecords} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-xl bg-violet-50 text-xs font-black text-violet-700">查看記錄<ArrowRight size={13} /></button></section>
    <section className="rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(66,74,150,.07)]"><h2 className="mb-3 font-black">快速記帳</h2><div className="grid grid-cols-4 gap-2">{quickActions.map(([Icon, label, category]) => <button key={label} onClick={() => onQuickAdd(category)} className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white text-[11px] font-bold text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"><Icon size={20} />{label}</button>)}</div></section>
  </div>;
};
export default TripLiveOverview;
