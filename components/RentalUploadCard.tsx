import React, { useRef, useState } from 'react';
import { CarFront, Loader2, Trash2, Upload } from 'lucide-react';
import { ParsedRental, formatRentalSpan, rentalDays } from '../services/rentalIntake';

/**
 * 租車資訊 — car hire, read off its confirmation.
 *
 * 「可以在安排行程那加上租車訂單等 啥的 讓用戶可以上傳資訊」.
 *
 * It sits beside 航班資訊 and 住宿資訊 because it is the third thing already
 * booked before a day is planned around it, and because of what it settles:
 * 「是租兩天的車等 但旅行有五天」. A brief can say a car exists; only the
 * confirmation says which days, and this card shows those days back so the
 * traveller can see the three the car covers and the two it does not.
 *
 * Nothing is planned from it here. It records, and the planner asks later.
 */

interface Props {
  rentals: ParsedRental[];
  /** The caller owns persistence and sync, as it does for stays. */
  onAdd: (rental: ParsedRental) => void;
  onRemove: (index: number) => void;
}

const RentalUploadCard: React.FC<Props> = ({ rentals, onAdd, onRemove }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

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

      const response = await fetch('/api/rentals/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type }),
      });

      if (!response.ok) {
        // The server words these for the traveller, and whether to retry is
        // the whole of what they need.
        const body = await response.json().catch(() => ({}));
        setError(body?.error || '辨識失敗，請手動輸入。');
        return;
      }

      onAdd(await response.json() as ParsedRental);
    } catch {
      setError('辨識失敗，請手動輸入。');
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section
      id="rental-card"
      data-testid="rental-card"
      className="rounded-[28px] border border-[#e8e7f4] bg-white p-5 shadow-[0_14px_34px_rgba(17,26,74,.07)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f0edff] text-[#5b3df5]">
            <CarFront size={19} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#8b3dff]">CAR RENTAL</p>
            <h2 className="mt-1 font-black text-[#111A4A]">租車資訊</h2>
          </div>
        </div>
        {rentals.length > 0 && (
          <button
            type="button"
            data-testid="rental-upload-more"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#5b3df5] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}上傳
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="rental-file"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && (
        <p data-testid="rental-error" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </p>
      )}

      {rentals.length === 0 ? (
        <button
          type="button"
          data-testid="rental-upload"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="mt-4 flex min-h-[5.5rem] w-full flex-col items-center justify-center gap-1 rounded-[20px] border border-dashed border-[#d9d5f5] bg-[#fbfaff] px-4 disabled:opacity-50"
        >
          {busy
            ? <Loader2 size={20} className="animate-spin text-[#5b3df5]" />
            : <Upload size={20} className="text-[#5b3df5]" />}
          <span className="text-sm font-black text-[#5b3df5]">上傳租車訂單</span>
          <span className="text-[11px] text-slate-400">自動讀出租車公司、取車與還車時間</span>
        </button>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rentals.map((rental, index) => {
            const days = rentalDays(rental);
            return (
              <li
                key={`${rental.company}-${rental.pickUpDate || index}`}
                data-testid={`rental-${index}`}
                className="rounded-[20px] border border-[#ecebf5] bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#111A4A]">{rental.company}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-[#6b4df6]">
                      {formatRentalSpan(rental)}
                    </p>
                    {rental.pickUpLocation && (
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        取車：{rental.pickUpLocation}
                        {rental.dropOffLocation ? `・還車：${rental.dropOffLocation}` : ''}
                      </p>
                    )}
                    {rental.carDescription && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{rental.carDescription}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={`rental-remove-${index}`}
                    onClick={() => onRemove(index)}
                    aria-label={`移除 ${rental.company}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/*
                  The days the keys are actually in their hand.

                  This is the whole reason the card exists: 「是租兩天的車等 但旅行
                  有五天」. Showing the covered days means the traveller can see
                  which ones they are, instead of the app deciding that five
                  days are drivable because two of them are.
                */}
                {days.length > 0 && (
                  <p data-testid={`rental-days-${index}`} className="mt-2 rounded-lg bg-[#f6f5ff] px-2.5 py-1.5 text-[11px] font-bold text-[#5b3df5]">
                    這 {days.length} 天有車
                  </p>
                )}
                {rental.isUncertain && (
                  <p className="mt-2 text-[11px] font-bold text-amber-600">
                    這張訂單有些欄位讀不清楚，請確認日期。
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RentalUploadCard;
