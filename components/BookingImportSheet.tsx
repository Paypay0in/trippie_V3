import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BedDouble, Loader2, Plane, X } from 'lucide-react';
import { OVERLAY } from '../constants/layers';
import { ParsedFlight } from '../services/flightIntake';
import { ParsedStay } from '../services/stayIntake';
import {
  DerivedTrip,
  readoutSummary,
  tripFromBookings,
  worthKeeping,
} from '../services/tripFromBookings';

/**
 * 匯入旅程資料・機票・住宿・訂單, finally going where it says.
 *
 * 「這個是要提示用戶上傳機票旅館等住宿」. The tile went to the blank new-trip
 * form — the same place as 新增旅程 beside it — while the readers it promised
 * sat inside trips, usable only by somebody who had already typed in the dates
 * their boarding pass was holding.
 *
 * Two buttons, not one. The two endpoints read for different things, and
 * asking a model 「what kind of document is this」 to pick between them buys a
 * guess where the traveller already knows the answer. 機票 and 訂房 is also
 * what the tile has always said.
 *
 * Nothing is saved until 建立旅程. What was read is shown first, in the
 * traveller's own terms — dates and a city, not field names — because a
 * misread date that becomes a trip is found weeks later, and a misread date on
 * a confirmation screen is found now.
 */

interface Props {
  onCancel: () => void;
  /** Hands over what was read and what it adds up to; the caller saves. */
  onCreate: (trip: DerivedTrip, readout: { flights: ParsedFlight[]; stays: ParsedStay[] }) => void;
  /** 手動建立, for a confirmation nothing can read. */
  onManual: () => void;
}

type Kind = 'flight' | 'stay';

const ENDPOINT: Record<Kind, string> = {
  flight: '/api/flights/parse-image',
  stay: '/api/stays/parse-image',
};

const BookingImportSheet: React.FC<Props> = ({ onCancel, onCreate, onManual }) => {
  const { t } = useTranslation();
  const [flights, setFlights] = useState<ParsedFlight[]>([]);
  const [stays, setStays] = useState<ParsedStay[]>([]);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState('');
  const pending = useRef<Kind>('flight');
  const fileInput = useRef<HTMLInputElement>(null);

  const readout = { flights, stays };
  const derived = tripFromBookings(readout);

  const pick = (kind: Kind) => {
    pending.current = kind;
    setError('');
    fileInput.current?.click();
  };

  const handleFile = async (file: File) => {
    const kind = pending.current;
    setBusy(kind);
    setError('');
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const response = await fetch(ENDPOINT[kind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type }),
      });

      if (!response.ok) {
        // The server words these for the traveller, and whether to retry is
        // the whole of what they need; a generic failure hides it.
        const body = await response.json().catch(() => ({}));
        setError(body?.error || t('bookingImport.unreadable'));
        return;
      }

      const parsed = await response.json();
      if (kind === 'flight') {
        /*
          The flight endpoint answers { OUTBOUND?, RETURN? }, not one flight.

          A booking confirmation normally shows both legs at once — the
          Booking.com page that prompted this fix has TPE→NRT on 10/20 and
          NRT→TPE on 10/24 on the same screen — and the server already reads
          both. Treating the envelope as a single flight pushed an object with
          no dates and no airports into the list, so a screenshot that parsed
          perfectly produced a trip with nothing in it.

          Both legs are taken, and the direction is set from the key rather
          than trusted from the body: the key is what the server decided, and
          a leg that disagrees with its own slot would be filed as a second
          outbound and lose the return date.
        */
        const legs = parsed as { OUTBOUND?: ParsedFlight; RETURN?: ParsedFlight };
        const read: ParsedFlight[] = [];
        for (const direction of ['OUTBOUND', 'RETURN'] as const) {
          const leg = legs[direction];
          if (leg) read.push({ ...leg, direction });
        }
        if (read.length === 0) {
          setError(t('bookingImport.unreadable'));
          return;
        }
        setFlights(current => [...current, ...read]);
      } else {
        setStays(current => [...current, parsed as ParsedStay]);
      }
    } catch {
      setError(t('bookingImport.unreadable'));
    } finally {
      setBusy(null);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const Tile: React.FC<{ kind: Kind; icon: React.ReactNode; label: string; hint: string }> = ({
    kind, icon, label, hint,
  }) => (
    <button
      type="button"
      data-testid={`import-${kind}`}
      disabled={busy !== null}
      onClick={() => pick(kind)}
      className="flex min-h-[5.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-slate-300 bg-white px-3 py-4 disabled:opacity-50"
    >
      {busy === kind ? <Loader2 size={22} className="animate-spin text-violet-600" /> : icon}
      <span className="text-field font-semibold text-ink">{label}</span>
      <span className="text-meta text-ink-soft">{hint}</span>
    </button>
  );

  return (
    <div className={`fixed inset-0 flex items-end justify-center bg-black/50 p-4 sm:items-center ${OVERLAY.sheet}`}>
      <div className="w-full max-w-md rounded-sheet bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-screen-title font-black tracking-tight text-ink">{t('bookingImport.title')}</h2>
            <p className="mt-0.5 text-support text-ink-soft">
              {t('bookingImport.blurb')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('common.close')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="import-file"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <div className="mt-4 flex gap-3">
          <Tile
            kind="flight"
            icon={<Plane size={22} className="text-blue-600" />}
            label={t('bookingImport.flightLabel')}
            hint={t('bookingImport.flightHint')}
          />
          <Tile
            kind="stay"
            icon={<BedDouble size={22} className="text-violet-600" />}
            label={t('bookingImport.stayLabel')}
            hint={t('bookingImport.stayHint')}
          />
        </div>

        {error && (
          <p data-testid="import-error" className="mt-3 rounded-card bg-rose-50 px-3 py-2 text-support font-medium text-rose-700">
            {error}
          </p>
        )}

        {/*
          What was read, before anything is saved. A misread date that becomes
          a trip is found weeks later; the same date on this screen is found
          now, which is the entire reason this step exists.
        */}
        {(flights.length > 0 || stays.length > 0) && (
          <div data-testid="import-readout" className="mt-4 rounded-card border border-hairline bg-[#f7f8fc] p-3.5">
            <p className="text-support font-semibold text-ink">{readoutSummary(readout)}</p>
            <dl className="mt-2 space-y-1 text-support text-ink-soft">
              {derived.destination && (
                <div className="flex gap-2">
                  <dt className="shrink-0">{t('bookingImport.destination')}</dt>
                  <dd className="font-semibold text-ink">{derived.destination}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="shrink-0">{t('bookingImport.dates')}</dt>
                <dd className="font-semibold text-ink" data-testid="import-dates">
                  {derived.startDate
                    ? `${derived.startDate}${derived.endDate ? ` - ${derived.endDate}` : t('bookingImport.returnUnknown')}`
                    : t('bookingImport.noDatesYet')}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-meta text-ink-soft">{t('bookingImport.editableLater')}</p>
          </div>
        )}

        <button
          type="button"
          data-testid="import-create"
          disabled={!worthKeeping(derived) || busy !== null}
          onClick={() => onCreate(derived, readout)}
          className="mt-4 h-[var(--cta-h)] w-full rounded-control bg-violet-600 text-action font-bold text-white disabled:bg-slate-100 disabled:text-ink-soft"
        >
          {t('bookingImport.create')}
        </button>

        {/* Some confirmations are a photo of a screen of a PDF. */}
        <button
          type="button"
          data-testid="import-manual"
          onClick={onManual}
          className="mt-2 h-11 w-full text-action font-semibold text-violet-600"
        >
          {t('bookingImport.manual')}
        </button>
      </div>
    </div>
  );
};

export default BookingImportSheet;
