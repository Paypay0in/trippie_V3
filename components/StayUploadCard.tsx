import React, { useMemo, useRef, useState } from 'react';
import { BedDouble, Camera, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { ItineraryItem } from '../types';
import { ParsedStay, normalizeParsedStay, stayToItineraryItems } from '../services/stayIntake';
import { FlightArrivalPoint } from '../services/flightDerivedItems';
import { linkStayItems, stayPlaceQuery } from '../services/stayPlaceLink';
import { resolvePlace } from '../services/placeService';

interface Props {
  itinerary: ItineraryItem[];
  /** Landing times, so a check-in defaults to when they are actually there. */
  flightArrivals?: FlightArrivalPoint[];
  /** Biases the hotel lookup to the country they are travelling to. */
  destinationCountry?: string;
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
const StayUploadCard: React.FC<Props> = ({ itinerary, flightArrivals = [], destinationCountry, onAddItems, onRemoveItem }) => {
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
   * Adds the booking's own cards, and nothing else.
   *
   * The airport transfer used to be created here, which meant it was computed
   * once and never again: a landing time entered afterwards changed nothing.
   * It is derived from the flights and the stays instead, so it follows both.
   */
  const addStay = async (stay: ParsedStay) => {
    const items = stayToItineraryItems(stay, makeId, flightArrivals) as ItineraryItem[];

    /*
      Link the booking to the place it is, before it lands on the itinerary.

      A hotel card with an address but no `placeId` is invisible to everything
      downstream — no photo, no map, and no travel time into or out of the place
      they sleep, which made every leg touching it read 「其中一個地點還沒連結
      地圖，無法計算交通時間」.

      Best effort by design: if the lookup fails the booking is still added,
      unlinked, exactly as before. A room booking that does not reach the
      itinerary is a worse outcome than one without a photo.
    */
    const query = stayPlaceQuery(stay.hotelName, stay.address);
    if (!query) { onAddItems(items); return; }
    try {
      onAddItems(linkStayItems(items, await resolvePlace(query, destinationCountry)));
    } catch {
      onAddItems(items);
    }
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
