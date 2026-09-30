import React, { useMemo, useRef, useState } from 'react';
import { BedDouble, Camera, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { ItineraryItem } from '../types';
import { ParsedStay, normalizeParsedStay, stayToItineraryItems } from '../services/stayIntake';
import { ArrivalPlan, airportTransferItem, departAirportTime, reachHotelTime } from '../services/arrivalPlan';
import { FlightArrivalPoint } from '../services/flightDerivedItems';

interface Props {
  itinerary: ItineraryItem[];
  /** Landing times, so a check-in defaults to when they are actually there. */
  flightArrivals?: FlightArrivalPoint[];
  /** Appends the parsed stay's items; the caller owns persistence and sync. */
  onAddItems: (items: ItineraryItem[]) => void;
  onRemoveItem: (itemId: string) => void;
}

const EMPTY_FORM = {
  hotelName: '',
  checkInDate: '',
  checkOutDate: '',
  checkInTime: '',
  checkOutTime: '',
  address: '',
  confirmationNumber: '',
};

const makeId = () => `stay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A booking confirmation is already a screenshot on the traveller's phone.
 * Asking them to retype the property name, two dates, two times and a
 * reference number is the reason accommodation never gets entered at all.
 *
 * The parsed stay becomes itinerary items rather than a field on the trip,
 * because the itinerary syncs between travellers and the trip object does not
 * — a companion can see the room booking, which is the point of entering it.
 */
const StayUploadCard: React.FC<Props> = ({ itinerary, flightArrivals = [], onAddItems, onRemoveItem }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const stays = useMemo(
    () => itinerary
      .filter(item => item.type === 'HOTEL' && item.fixedEventKind === 'accommodation')
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time)),
    [itinerary],
  );


  /**
   * Turns a parsed booking into the cards it belongs on the itinerary as.
   *
   * When a flight lands the same day, this also asks the server how far the
   * hotel is from that airport and adds the transfer — so the itinerary shows
   * the whole of arriving, not just the moment the wheels touch down. The
   * lookup is best effort: the booking is added either way, because a stay
   * that failed to save over a missing route estimate would be absurd.
   */
  const addStay = async (stay: ParsedStay) => {
    const arrival = flightArrivals.find(entry => entry.date === stay.checkInDate && entry.time);
    const items = stayToItineraryItems(stay, makeId, flightArrivals) as ItineraryItem[];
    if (!arrival) { onAddItems(items); return; }

    let plan: ArrivalPlan = {};
    try {
      const response = await fetch('/api/stays/arrival-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel: [stay.hotelName, stay.address].filter(Boolean).join(' '),
          airport: arrival.airport,
          airportLatitude: arrival.latitude,
          airportLongitude: arrival.longitude,
        }),
      });
      if (response.ok) plan = await response.json() as ArrivalPlan;
    } catch {
      // No route: the transfer card still goes on, without a duration.
    }

    const departTime = departAirportTime(arrival.time);
    const transfer = departTime
      ? [airportTransferItem({
          id: makeId(),
          date: arrival.date,
          departTime,
          airportName: arrival.airport || '機場',
          hotelName: stay.hotelName,
          travelSeconds: plan.travelSeconds,
          mode: plan.mode,
        }) as ItineraryItem]
      : [];

    // Check-in moves to when they actually reach the door, once the journey
    // is known. Without a route it stays at the airport-exit time rather than
    // being shifted by a number nobody can check.
    const reach = stay.checkInTime ? null : reachHotelTime(arrival.time, plan.travelSeconds);
    const withCheckIn = reach
      ? items.map(item => (item.title.startsWith('入住 ') ? { ...item, time: reach } : item))
      : items;

    onAddItems([...transfer, ...withCheckIn]);
  };

  const handleFile = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/stays/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type }),
      });

      if (!response.ok) {
        // The server phrases these for the traveller, so show what it said
        // rather than a generic failure that hides whether to retry.
        const body = await response.json().catch(() => ({}));
        setError(body?.error || '辨識失敗，請手動新增住宿。');
        return;
      }

      await addStay(await response.json() as ParsedStay);
    } catch {
      setError('辨識失敗，請手動新增住宿。');
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section id="stay-card" className="rounded-[28px] border border-[#e8e7f4] bg-white p-5 shadow-[0_14px_34px_rgba(17,26,74,.07)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f0edff] text-[#5b3df5]">
            <BedDouble size={19} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#8b3dff]">STAYS</p>
            <h2 className="mt-1 font-black text-[#111A4A]">住宿資訊</h2>
          </div>
        </div>
        {/*
          The actions live in one place at a time. While the card is empty the
          panel below carries them, where the explanation is; once there is a
          stay to look at, they move up here so the list stays the subject.
        */}
        {stays.length > 0 && !manual && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => { setManual(true); setError(''); }}
              className="inline-flex min-h-11 items-center rounded-xl border border-[#e4e2f2] bg-white px-3 py-2 text-xs font-black text-slate-500"
            >
              手動
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-3 py-2 text-xs font-black text-[#5b3df5] disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {busy ? '辨識中' : '上傳截圖'}
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {manual ? (
        // Manual entry sits beside the upload, not behind it. A screenshot can
        // be unreadable, and some bookings never produce one at all — a
        // friend's spare room, a place booked over the phone.
        <form
          className="mt-4 space-y-3 rounded-[22px] border border-[#ececf5] bg-[#fbfaff] p-4"
          onSubmit={event => {
            event.preventDefault();
            const stay = normalizeParsedStay(form);
            if (!stay) {
              setError('請至少填入住宿名稱。');
              return;
            }
            setError('');
            void addStay(stay);
            setForm(EMPTY_FORM);
            setManual(false);
          }}
        >
          <label className="block">
            <span className="text-[11px] font-black text-slate-500">住宿名稱</span>
            <input
              value={form.hotelName}
              onChange={event => setForm(current => ({ ...current, hotelName: event.target.value }))}
              placeholder="例如：海雲台格蘭飯店"
              className="mt-1 w-full rounded-xl border border-[#e4e2f2] bg-white px-3 py-2.5 text-sm font-bold text-[#111A4A] outline-none focus:border-[#b9adff]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['checkInDate', '入住日期', 'date'],
              ['checkOutDate', '退房日期', 'date'],
              ['checkInTime', '入住時間', 'time'],
              ['checkOutTime', '退房時間', 'time'],
            ] as const).map(([field, label, type]) => (
              <label key={field} className="block">
                <span className="text-[11px] font-black text-slate-500">{label}</span>
                <input
                  type={type}
                  value={form[field]}
                  onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[#e4e2f2] bg-white px-3 py-2.5 text-sm font-bold text-[#111A4A] outline-none focus:border-[#b9adff]"
                />
              </label>
            ))}
          </div>
          {([['address', '地址'], ['confirmationNumber', '訂房編號']] as const).map(([field, label]) => (
            <label key={field} className="block">
              <span className="text-[11px] font-black text-slate-500">{label}</span>
              <input
                value={form[field]}
                onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-[#e4e2f2] bg-white px-3 py-2.5 text-sm font-bold text-[#111A4A] outline-none focus:border-[#b9adff]"
              />
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-xl bg-[#5b3df5] px-4 text-xs font-black text-white"
            >
              加入住宿
            </button>
            <button
              type="button"
              onClick={() => { setManual(false); setForm(EMPTY_FORM); setError(''); }}
              className="min-h-11 rounded-xl border border-[#e4e2f2] bg-white px-4 text-xs font-black text-slate-500"
            >
              取消
            </button>
          </div>
        </form>
      ) : stays.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-[#d9d5f5] bg-[#fbfaff] px-4 py-7 text-center">
          <Camera size={20} className="mx-auto text-[#a99df0]" />
          <p className="mt-2 text-xs font-black text-[#5b3df5]">還沒有住宿資訊</p>
          <p className="mt-1 text-[11px] text-slate-400">自動讀出飯店名稱、入住與退房日期</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#5b3df5] px-4 text-xs font-black text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {busy ? '辨識中' : '上傳截圖'}
            </button>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="min-h-11 rounded-xl border border-[#e4e2f2] bg-white px-4 text-xs font-black text-[#5b3df5]"
            >
              手動輸入
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {stays.map(item => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-[20px] border border-[#edf0f6] bg-[#fbfaff] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#111A4A]">{item.title}</p>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                  {item.date ? `${item.date.slice(5).replace('-', '/')} ${item.time}` : '尚未指定日期'}
                </p>
                {item.notes && (
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">{item.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemoveItem(item.id)}
                aria-label={`刪除 ${item.title}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default StayUploadCard;
