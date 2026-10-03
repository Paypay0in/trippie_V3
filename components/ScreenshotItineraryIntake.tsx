import React, { useRef, useState } from 'react';
import { AlertTriangle, Bookmark, Camera, Check, Image as ImageIcon, Loader2 } from 'lucide-react';
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
  /**
   * Saves the chosen slices into the trip's collection instead of onto a day.
   *
   * 「跟朋友會先把想去的地方列一個表單 … 最後一鍵讓 AI 閱讀目前行程後 再根據收藏
   * 行程的地址去安排」 — a list of maybes is not an itinerary yet, and forcing
   * each place onto a day as it arrives is the step that makes collecting feel
   * like planning. Omit to offer only the direct add.
   */
  onSaveToCollection?: (slices: ItinerarySlice[]) => Promise<number> | number;
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

/**
 * How many screenshots one go may carry.
 *
 * 「上傳截圖目前只能一次一張 希望變10張」 — a friend's recommendations arrive as a
 * run of screenshots, and uploading them one at a time means waiting out the
 * parse ten times over.
 */
const MAX_SCREENSHOTS = 10;

const ScreenshotItineraryIntake: React.FC<Props> = ({
  dates,
  defaultDate,
  destination,
  destinationCountry,
  onAddItems,
  onSaveToCollection,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slices, setSlices] = useState<ItinerarySlice[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [date, setDate] = useState(defaultDate || dates[0] || '');
  const [added, setAdded] = useState(0);
  const [saved, setSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  /** How far through a batch of screenshots the parse is. */
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });

  const handleFiles = async (files: File[]) => {
    setError('');
    setAdded(0);
    setSaved(0);
    setBusy(true);
    setProgress({ done: 0, total: Math.min(files.length, MAX_SCREENSHOTS) });

    const batch = files.slice(0, MAX_SCREENSHOTS);
    const collected: ItinerarySlice[] = [];
    const failures: string[] = [];

    try {
      for (const file of batch) {
        try {
          const found = await readItinerarySlicesFromImage({
            base64Data: await readAsBase64(file),
            mimeType: file.type,
            destination,
            destinationCountry,
          });
          /*
            Across screenshots as well as within one.

            Two of a friend's screenshots overlap more often than not — the same
            restaurant screenshotted twice, once in the list and once in the
            detail — and ten uploads producing the same place ten times is worse
            than uploading them one at a time.
          */
          found.forEach(slice => {
            const key = `${slice.type}:${slice.title.trim().toLocaleLowerCase()}`;
            if (collected.some(seen => `${seen.type}:${seen.title.trim().toLocaleLowerCase()}` === key)) return;
            collected.push(slice);
          });
        } catch (caught) {
          // One unreadable screenshot does not discard the nine that worked.
          failures.push(caught instanceof Error ? caught.message : '辨識失敗');
        }
        setProgress(current => ({ ...current, done: current.done + 1 }));
      }

      setSlices(collected);
      // Everything on, because the traveller chose these screenshots on purpose.
      // Taking one off is one tap; ticking twenty is twenty.
      setChosen(collected.map(slice => slice.id));
      if (collected.length === 0) {
        setError(failures[0] || '這些截圖看不出可以排進行程的地點，換幾張再試試。');
      } else if (failures.length > 0) {
        setError(`有 ${failures.length} 張沒讀出東西，其餘已列在下面。`);
      }
      if (files.length > MAX_SCREENSHOTS) {
        setError(`一次最多 ${MAX_SCREENSHOTS} 張，已處理前 ${MAX_SCREENSHOTS} 張。`);
      }
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0 });
      // Clearing lets the same files be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const picked = () => slices.filter(slice => chosen.includes(slice.id));

  const add = () => {
    const chosenSlices = picked();
    if (chosenSlices.length === 0) return;
    onAddItems(chosenSlices.map(slice => sliceToItineraryItem(slice, makeId, date || undefined)));
    setAdded(chosenSlices.length);
    setSlices([]);
    setChosen([]);
  };

  /** Into the collection, where the AI can later fit them around the flights. */
  const collect = async () => {
    const chosenSlices = picked();
    if (chosenSlices.length === 0 || !onSaveToCollection) return;
    setSaving(true);
    setError('');
    try {
      setSaved(await onSaveToCollection(chosenSlices));
      setSlices([]);
      setChosen([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '收藏時出了點問題，請再試一次。');
    } finally {
      setSaving(false);
    }
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
              社群貼文、部落格、朋友傳的清單都可以，一次最多 {MAX_SCREENSHOTS} 張
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
          {busy
            ? (progress.total > 1 ? `辨識中 ${progress.done}/${progress.total}` : '辨識中')
            : '上傳截圖'}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        aria-label="上傳旅行截圖"
        className="hidden"
        multiple
        onChange={event => {
          const files = Array.from(event.target.files || []);
          if (files.length > 0) void handleFiles(files);
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

      {saved > 0 && (
        <p data-testid="screenshot-saved-note" className="mt-3 rounded-xl bg-[#f3f0ff] px-3 py-2 text-xs font-bold leading-5 text-[#5b3df5]">
          <Check size={14} className="mr-1 inline" />
          已收藏 {saved} 個地點。想一次排進行程的話，到下面選「補充行程」——AI 會先讀過你目前的安排，再把收藏的地點依地址排進合適的空檔。
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

          {/*
            Two destinations, because they are two different intentions.

            A place you know you are going on Thursday belongs on Thursday. A
            place a friend sent you belongs in the collection until the day it
            fits — 「先把想去的地方列一個表單」 — and the AI fits it later, around
            the flights that are already there.
          */}
          {onSaveToCollection && (
            <button
              type="button"
              onClick={() => void collect()}
              disabled={chosen.length === 0 || saving}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 py-3 text-sm font-black text-white disabled:opacity-40"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />}
              {saving ? '收藏中…' : `收藏 ${chosen.length} 個，稍後讓 AI 排`}
            </button>
          )}

          <button
            type="button"
            onClick={add}
            disabled={chosen.length === 0}
            className={`w-full rounded-xl py-3 text-sm font-black disabled:opacity-40 ${
              onSaveToCollection
                ? 'mt-2 border border-[#d9d5f5] bg-white text-[#5b3df5]'
                : 'mt-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white'
            }`}
          >
            直接加到{date ? '這一天' : '行程'}（{chosen.length}）
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
