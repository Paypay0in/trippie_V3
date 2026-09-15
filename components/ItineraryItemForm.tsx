import React, { useEffect, useRef, useState } from 'react';
import { ItineraryItem } from '../types';
import { autocompletePlaces, getPlaceDetails, PlaceSuggestion, ResolvedPlace } from '../services/placeService';
import { Activity, CalendarDays, Car, Check, Clock3, Hotel, MapPin, MapPinned, Plane, Search, Utensils, X } from 'lucide-react';

interface Props {
  item?: ItineraryItem;
  startDate: string;
  endDate: string;
  onSave: (item: ItineraryItem) => void;
  onCancel: () => void;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationCountry?: string;
  travelCountry?: string;
  initialDate?: string;
}

const TYPES: ItineraryItem['type'][] = ['ACTIVITY', 'FOOD', 'TRANSPORT', 'FLIGHT', 'HOTEL'];
const TYPE_META: Record<ItineraryItem['type'], { label: string; icon: React.ReactNode }> = {
  ACTIVITY: { label: '景點', icon: <Activity size={14} /> },
  FOOD: { label: '餐飲', icon: <Utensils size={14} /> },
  TRANSPORT: { label: '交通', icon: <Car size={14} /> },
  HOTEL: { label: '住宿', icon: <Hotel size={14} /> },
  FLIGHT: { label: '航班', icon: <Plane size={14} /> },
};

const ItineraryItemForm: React.FC<Props> = ({ item, startDate, endDate, onSave, onCancel, destinationLatitude, destinationLongitude, destinationCountry, travelCountry, initialDate }) => {
  const [form, setForm] = useState({
    title: item?.title || '', location: item?.location || '', date: item?.date || initialDate || startDate || '',
    time: item?.time || '09:00', type: item?.type || 'ACTIVITY' as ItineraryItem['type'], notes: item?.notes || ''
  });
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [place, setPlace] = useState<ResolvedPlace & { location: string } | null>(item?.latitude != null && item.longitude != null ? { location: item.location, address: item.address, placeId: item.placeId, latitude: item.latitude, longitude: item.longitude } : null);
  const [isSearching, setIsSearching] = useState(false);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const sessionToken = useRef(crypto.randomUUID());
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  useEffect(() => {
    const query = form.location.trim();
    if (place?.location !== query || !query) setPlace(current => current && current.location !== query ? null : current);
    if (query.length < 2 || (place && place.location === query)) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => { setIsSearching(true); try { setSuggestions(await autocompletePlaces(query, { latitude: destinationLatitude, longitude: destinationLongitude, country: destinationCountry, travelCountry }, controller.signal)); } catch { setSuggestions([]); } finally { if (!controller.signal.aborted) setIsSearching(false); } }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.location, place, destinationCountry, destinationLatitude, destinationLongitude, travelCountry]);

  const selectPlace = async (suggestion: PlaceSuggestion) => {
    setIsSearching(true); setError('');
    try { const details = await getPlaceDetails(suggestion.placeId, sessionToken.current); setPlace(details); update('location', details.location); setSuggestions([]); }
    catch { setError('無法取得地點詳細資料，可使用目前輸入文字'); }
    finally { setIsSearching(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.date || form.date < startDate || form.date > endDate) {
      setError('請填寫標題，並選擇旅程日期範圍內的日期');
      return;
    }
    onSave({
      id: item?.id || '', title: form.title.trim(), location: (place?.location || form.location).trim(), date: form.date,
      time: form.time, type: form.type, notes: form.notes.trim(),
      isCompleted: item?.isCompleted === true, ...(item?.linkedExpenseId ? { linkedExpenseId: item.linkedExpenseId } : {}), ...(place ? { placeId: place.placeId, address: place.address, latitude: place.latitude, longitude: place.longitude } : {})
    });
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
    <form onSubmit={submit} className="w-full max-w-lg space-y-3 rounded-[30px] border border-slate-100 bg-white p-4 shadow-[0_24px_70px_rgba(17,26,74,0.18)] sm:p-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-500">Itinerary</p><h3 className="mt-0.5 text-xl font-black tracking-tight text-[#111A4A]">{item ? '編輯行程' : '新增行程'}</h3></div><button type="button" onClick={onCancel} aria-label="關閉" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-brand-200 hover:text-brand-600"><X size={16} /></button></div>
      <div className="space-y-2.5">
        <label className="relative block text-[11px] font-bold text-slate-500"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-[#111A4A]"><Search size={14} className="text-brand-500" />地點</span>{item && !place && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2"><span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-brand-700"><MapPin size={13} className="shrink-0" />尚未連結地圖地點</span><button type="button" onClick={() => locationInputRef.current?.focus()} className="shrink-0 text-[10px] font-black text-brand-600 underline underline-offset-2">搜尋並連結地點</button></div>}<div className={`rounded-2xl border ${place ? 'border-brand-200 bg-white shadow-[0_8px_24px_rgba(91,61,245,0.09)]' : 'border-slate-200 bg-white'} px-3 py-2.5 transition-colors`}><div className="flex items-center gap-2"><MapPin size={17} className="shrink-0 text-brand-600" /><input ref={locationInputRef} value={form.location} onChange={e => { update('location', e.target.value); setPlace(null); }} placeholder="搜尋地點或輸入文字" className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#111A4A] outline-none placeholder:font-normal placeholder:text-slate-400" />{place && place.latitude != null && place.longitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`} target="_blank" rel="noreferrer" aria-label="在地圖查看" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition hover:bg-brand-100"><MapPinned size={15} /></a>}{isSearching && <span className="shrink-0 text-[10px] text-slate-400">搜尋中…</span>}{place && <Check size={17} className="shrink-0 text-brand-600" />}</div>{place?.address && <p className="mt-1.5 truncate pl-6 text-[10px] font-medium text-slate-500">{place.address}</p>}</div>{suggestions.length > 0 && <div className="absolute left-0 right-0 top-[4.7rem] z-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">{suggestions.map(suggestion => <button type="button" key={suggestion.placeId} onClick={() => selectPlace(suggestion)} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-brand-50"><span className="block text-sm font-bold text-[#111A4A]">{suggestion.primaryText}</span><span className="block text-[10px] font-normal text-slate-500">{suggestion.secondaryText || '地點'}</span></button>)}</div>}{form.location.trim().length >= 2 && !isSearching && suggestions.length === 0 && !place && <button type="button" onClick={() => setSuggestions([])} className="mt-1.5 pl-1 text-[10px] font-bold text-brand-600">使用目前輸入文字</button>}</label>
        <label className="block text-[11px] font-bold text-slate-500">標題<input required value={form.title} onChange={e => update('title', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#111A4A] outline-none focus:border-brand-300" /></label>
        <div className="grid grid-cols-2 gap-2.5"><label className="text-[11px] font-bold text-slate-500"><span className="flex items-center gap-1"><CalendarDays size={12} />日期</span><input required type="date" min={startDate} max={endDate} value={form.date} onChange={e => update('date', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-[#111A4A] outline-none focus:border-brand-300" /></label><label className="text-[11px] font-bold text-slate-500"><span className="flex items-center gap-1"><Clock3 size={12} />時間</span><input required type="time" value={form.time} onChange={e => update('time', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-[#111A4A] outline-none focus:border-brand-300" /></label></div>
        <fieldset><legend className="mb-1.5 text-[11px] font-bold text-slate-500">類型</legend><div className="flex flex-wrap gap-1.5">{TYPES.map(type => <button type="button" key={type} onClick={() => update('type', type)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${form.type === type ? 'border-brand-500 bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-white shadow-[0_5px_14px_rgba(91,61,245,0.2)]' : 'border-slate-200 bg-white text-slate-500 hover:border-brand-200 hover:text-brand-600'}`}>{TYPE_META[type].icon}{TYPE_META[type].label}</button>)}</div></fieldset>
        <label className="block text-[11px] font-bold text-slate-500">備註（選填）<span className="relative block"><textarea maxLength={200} value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 pb-5 text-sm text-[#111A4A] outline-none focus:border-brand-300" /><span className="pointer-events-none absolute bottom-1.5 right-2 text-[9px] font-medium text-slate-400">{form.notes.length}/200</span></span></label>
      </div>
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      <button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] py-3 font-bold text-white shadow-[0_10px_24px_rgba(91,61,245,0.22)] transition hover:brightness-105">儲存</button>
    </form>
  </div>;
};

export default ItineraryItemForm;
