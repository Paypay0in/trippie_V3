import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { ParsedRental } from '../services/rentalIntake';
import { ItinerarySlice } from '../services/itineraryImageSlices';
import { readScreenshot } from '../services/screenshotIntake';

/**
 * 有截圖就丟上來 — one entry, whatever the picture is.
 *
 * 「這格可以提示用戶目前若有什麼旅行靈感的截圖、租車或是訂了什麼旅遊票的截圖都可以
 *   上傳上來 協助安排行程 新增一個上傳截圖的入口」.
 *
 * It sits in the planning card because that is where the traveller is when
 * they realise they have the information: they are being asked what the trip
 * should be, and the answer is already in their camera roll. Making them
 * first work out which of five upload buttons a picture belongs to is the
 * step where it stops being worth doing.
 *
 * The picture is classified and then sent to the parser written for it, so a
 * hire keeps its pickup and drop-off dates instead of becoming a line of text
 * on a slice. See `screenshotIntake`.
 */

interface Props {
  destination?: string;
  destinationCountry?: string;
  /** The hire goes on the trip's 租車資訊 card; the caller owns persistence. */
  onAddRental: (rental: ParsedRental) => void;
  /** Places go to the collection, not onto a day. Returns how many landed. */
  onSavePlaces: (slices: ItinerarySlice[]) => Promise<number> | number;
}

/**
 * The two kinds this entry acts on.
 *
 * A stay and a flight are classified and handed back unparsed. Each has a
 * card that does more than record it — it works out the nights, or the two
 * legs the first night is timed from — and a booking filed here without that
 * lands on the trip with nothing hanging off it. Naming them here means the
 * second model call is never spent on a document this screen would refuse.
 */
const HANDLES = ['rental', 'inspiration'] as const;

const PlanScreenshotIntake: React.FC<Props> = ({
  destination,
  destinationCountry,
  onAddRental,
  onSavePlaces,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    setDone('');
    setBusy(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const result = await readScreenshot({
        base64Data,
        mimeType: file.type,
        destination,
        destinationCountry,
        // A room and a flight are classified and then left alone: see below.
        handles: HANDLES,
      });

      if ('rental' in result) {
        onAddRental(result.rental);
        setDone(`讀到租車訂單：${result.rental.company}，已加到租車資訊。`);
        return;
      }

      /*
        Pointed at the right card rather than half-filed.

        A stay and a flight each have a card that does more than record them —
        it works out the nights, or the two legs and the arrival the first
        night is timed from. Dropping a booking in here without that would
        put a hotel on the trip with nothing hanging off it, and the gap only
        shows up later as a night nobody has a room for.
      */
      if (result.kind === 'stay') {
        setError('這看起來是訂房截圖，用上面的「住宿資訊」上傳，才會算進住幾晚。');
        return;
      }
      if (result.kind === 'flight') {
        setError('這看起來是機票截圖，用上面的「航班資訊」上傳，去回程才會分開放對。');
        return;
      }

      if (!('slices' in result)) return;
      const saved = await onSavePlaces(result.slices);
      setDone(`讀到 ${result.slices.length} 個地點，已存 ${saved} 個到收藏。`);
    } catch (caught) {
      // The server words these; whether retrying helps is the whole of what
      // the traveller needs from them.
      setError(caught instanceof Error ? caught.message : '現在無法辨識截圖，請稍後再試。');
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div data-testid="plan-screenshot-intake" className="mt-2">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="plan-screenshot-file"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <button
        type="button"
        data-testid="plan-screenshot-upload"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 text-sm font-black text-violet-700 disabled:opacity-50"
      >
        {busy
          ? <Loader2 size={16} className="animate-spin" />
          : <ImagePlus size={16} />}
        {busy ? '讀取截圖中…' : '上傳截圖'}
      </button>
      <p className="mt-1.5 text-center text-[11px] leading-4 text-slate-400">
        旅行靈感、租車訂單、訂好的票券截圖都可以，我讀出來幫你排
      </p>

      {error && (
        <p data-testid="plan-screenshot-error" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </p>
      )}
      {done && (
        <p data-testid="plan-screenshot-done" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          {done}
        </p>
      )}
    </div>
  );
};

export default PlanScreenshotIntake;
