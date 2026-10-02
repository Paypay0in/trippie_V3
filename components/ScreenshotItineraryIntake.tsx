import React, { useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Image as ImageIcon, Loader2 } from 'lucide-react';
import { ItineraryItem } from '../types';
import { ItinerarySlice, sliceToItineraryItem } from '../services/itineraryImageSlices';
import { readItinerarySlicesFromImage } from '../services/itineraryImageIntake';

/**
 * A screenshot, cut into things you can put on the itinerary.
 *
 * 「這邊加一個可以上傳截圖的區塊。讓他讀取截圖中的旅行資訊，切片之後讓用戶可以加入
 * 行程」. Trips get planned in other people's apps, and the work of moving them
 * into Trippie is retyping — which is the reason it does not get done.
 *
 * Nothing is written until the traveller ticks it. The model reads a picture,
 * and a picture read wrongly that silently became six itinerary cards would be
 * worse than no feature: every slice is shown, selected, and placed by hand.
 */

interface Props {
  /** Trip dates, for the day each chosen slice lands on. */
  dates: string[];
  /** Pre-selected day, usually the one being viewed. */
  defaultDate?: string;
  destination?: string;
  destinationCountry?: string;
  /** Appends the chosen cards; the caller owns persistence and sync. */
  onAddItems: (items: ItineraryItem[]) => void;
}

const TYPE_LABELS: Record<ItinerarySlice['type'], string> = {
  place: '景點',
  food: '美食',
  hotel: '住宿',
  activity: '活動',
  transport: '交通',
  tip: '提醒',
};

const makeId = () => `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const ScreenshotItineraryIntake: React.FC<Props> = ({
  dates,
  defaultDate,
  destination,
  destinationCountry,
  onAddItems,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slices, setSlices] = useState<ItinerarySlice[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [date, setDate] = useState(defaultDate || dates[0] || '');
  const [added, setAdded] = useState(0);

  const handleFile = async (file: File) => {
    setError('');
    setAdded(0);
    setBusy(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const found = await readItinerarySlicesFromImage({
        base64Data,
        mimeType: file.type,
        destination,
        destinationCountry,
      });
      setSlices(found);
      // Everything on, because the traveller chose this screenshot on purpose.
      // Taking one off is one tap; ticking six is six.
      setChosen(found.map(slice => slice.id));
    } catch (caught) {
      setSlices([]);
      setChosen([]);
      setError(caught instanceof Error ? caught.message : '現在無法辨識截圖，請稍後再試。');
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const add = () => {
    const picked = slices.filter(slice => chosen.includes(slice.id));
    if (picked.length === 0) return;
    onAddItems(picked.map(slice => sliceToItineraryItem(slice, makeId, date || undefined)));
    setAdded(picked.length);
    setSlices([]);
    setChosen([]);
  };

  return (
    <section data-testid="screenshot-intake" className="rounded-[22px] border border-[#e8e7f4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0edff] text-[#5b3df5]">
            <ImageIcon size={17} />
          </span>
          <div>
            <h3 className="font-black text-[#11183d]">從截圖加入行程</h3>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
              社群貼文、部落格、朋友傳的清單都可以
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-3 text-xs font-black text-[#5b3df5] disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {busy ? '辨識中' : '上傳截圖'}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        aria-label="上傳旅行截圖"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {added > 0 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          <Check size={14} /> 已加入 {added} 個行程，可以到時間軸調整時間與順序。
        </p>
      )}

      {slices.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-[#11183d]">讀到 {slices.length} 個可以加入的項目</p>
            {dates.length > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                加到
                <select
                  aria-label="加入哪一天"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  className="rounded-lg border border-[#e4e2f2] bg-white px-2 py-1 text-[11px] font-black text-[#11183d]"
                >
                  {/* 「先放著，之後再排」 is a real answer: a place with no day yet
                      sits in the undated bucket rather than on a guessed one. */}
                  <option value="">先不指定日期</option>
                  {dates.map((tripDate, index) => (
                    <option key={tripDate} value={tripDate}>
                      Day {index + 1}・{tripDate.slice(5).replace('-', '/')}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <ul className="mt-2.5 space-y-2">
            {slices.map(slice => {
              const picked = chosen.includes(slice.id);
              return (
                <li key={slice.id}>
                  <button
                    type="button"
                    data-testid={`slice-${slice.id}`}
                    aria-pressed={picked}
                    onClick={() => setChosen(current =>
                      current.includes(slice.id)
                        ? current.filter(id => id !== slice.id)
                        : [...current, slice.id])}
                    className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                      picked ? 'border-[#c9bdff] bg-[#f7f5ff]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      picked ? 'border-[#5b3df5] bg-[#5b3df5] text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {picked && <Check size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-black text-[#11183d]">{slice.title}</span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">
                          {TYPE_LABELS[slice.type]}
                        </span>
                        {slice.suggestedStartTime && (
                          <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-black text-violet-600">
                            {slice.suggestedStartTime}
                          </span>
                        )}
                      </span>
                      {slice.summary && (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{slice.summary}</span>
                      )}
                      {slice.notes.length > 0 && (
                        <span className="mt-1 block space-y-0.5">
                          {slice.notes.map((note, index) => (
                            <span key={index} className="block text-[11px] leading-relaxed text-slate-400">・{note.text}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={add}
            disabled={chosen.length === 0}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 py-3 text-sm font-black text-white disabled:opacity-40"
          >
            加入 {chosen.length} 個到行程
          </button>
          <p className="mt-1.5 text-center text-[10px] font-medium text-slate-400">
            截圖讀到的是名稱與筆記，地圖位置會在行程裡再連結
          </p>
        </div>
      )}
    </section>
  );
};

export default ScreenshotItineraryIntake;
