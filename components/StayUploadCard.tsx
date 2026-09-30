import React, { useMemo, useRef, useState } from 'react';
import { BedDouble, Camera, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { ItineraryItem } from '../types';
import { ParsedStay, stayToItineraryItems } from '../services/stayIntake';

interface Props {
  itinerary: ItineraryItem[];
  /** Appends the parsed stay's items; the caller owns persistence and sync. */
  onAddItems: (items: ItineraryItem[]) => void;
  onRemoveItem: (itemId: string) => void;
}

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
const StayUploadCard: React.FC<Props> = ({ itinerary, onAddItems, onRemoveItem }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stays = useMemo(
    () => itinerary
      .filter(item => item.type === 'HOTEL' && item.fixedEventKind === 'accommodation')
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time)),
    [itinerary],
  );

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

      const stay = await response.json() as ParsedStay;
      onAddItems(stayToItineraryItems(stay, makeId) as ItineraryItem[]);
    } catch {
      setError('辨識失敗，請手動新增住宿。');
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section className="rounded-[28px] border border-[#e8e7f4] bg-white p-5 shadow-[0_14px_34px_rgba(17,26,74,.07)]">
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
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-3 py-2 text-xs font-black text-[#5b3df5] disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {busy ? '辨識中' : '上傳訂房截圖'}
        </button>
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

      {stays.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="mt-4 w-full rounded-[22px] border border-dashed border-[#d9d5f5] bg-[#fbfaff] px-4 py-7 text-center disabled:opacity-50"
        >
          <Camera size={20} className="mx-auto text-[#a99df0]" />
          <p className="mt-2 text-xs font-black text-[#5b3df5]">上傳訂房截圖</p>
          <p className="mt-1 text-[11px] text-slate-400">自動讀出飯店名稱、入住與退房日期</p>
        </button>
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
