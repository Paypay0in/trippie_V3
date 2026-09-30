import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlightAirport, FlightAnchor, TripFlightMode } from '../types';
import { Plane, PlaneTakeoff, PlaneLanding, Settings2, Clock, MapPin, X, Check, Camera, Loader2, AlertTriangle } from 'lucide-react';
import { formatAirportLabel, searchAirports } from '../services/airportDirectory';
import { applyFlightToDraft, legsToApply, ParsedFlight } from '../services/flightIntake';
import {
  airportOf,
  flightTimesLabel,
  applyAirport,
  buildFlightAnchorDraft,
  destinationAirportCandidates,
  validateFlightAnchors,
  parseTimeInput,
  formatTimeInput,
  FlightAnchorFieldError,
} from '../services/flightAnchorSetup';

type Props = {
  anchors: FlightAnchor[];
  onChange: (anchors: FlightAnchor[]) => void;
  destination?: string;
  startDate?: string;
  endDate?: string;
  homeAirportIata?: string;
  flightMode?: TripFlightMode;
  onFlightModeChange?: (mode: TripFlightMode) => void;
};

const dateLabel = (value: string) => (value ? value.replace(/-/g, '/') : '日期未設定');
const legLabel = (direction: FlightAnchor['direction']) => (direction === 'RETURN' ? '回程' : '去程');

/** Airport field with search/autocomplete over the curated directory. */
function AirportField({
  label,
  anchorId,
  side,
  value,
  suggestions,
  invalid,
  onSelect,
}: {
  label: string;
  anchorId: string;
  side: 'departure' | 'arrival';
  value: FlightAirport | undefined;
  suggestions: FlightAirport[];
  invalid: boolean;
  onSelect: (airport: FlightAirport | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => (query.trim() ? searchAirports(query) : suggestions), [query, suggestions]);
  const testId = `${side}-airport-${anchorId}`;

  return (
    <div className="relative mt-2">
      <p className="mb-1 text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p>
      {value && !open ? (
        <button
          type="button"
          data-testid={`${testId}-selected`}
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-[#e5e5ef] bg-white px-3 py-2 text-left"
        >
          <MapPin size={13} className="shrink-0 text-[#6b4df6]" />
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#111A4A]">{formatAirportLabel(value)}</span>
        </button>
      ) : (
        <label
          className={`flex items-center gap-2 rounded-xl border bg-white px-3 ${invalid ? 'border-rose-300' : 'border-[#e5e5ef]'}`}
        >
          <MapPin size={13} className="text-slate-400" />
          <input
            aria-label={label}
            data-testid={testId}
            placeholder="搜尋城市或機場代碼"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={event => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            className="min-w-0 flex-1 bg-transparent py-2 text-xs text-slate-600 outline-none"
          />
          {value && (
            <button
              type="button"
              aria-label={`清除${label}`}
              onClick={() => {
                onSelect(undefined);
                setQuery('');
              }}
              className="text-slate-300"
            >
              <X size={13} />
            </button>
          )}
        </label>
      )}
      {open && results.length > 0 && (
        <ul
          data-testid={`${testId}-options`}
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#e8e7f4] bg-white shadow-[0_14px_30px_rgba(17,26,74,.12)]"
        >
          {results.map(airport => (
            <li key={airport.iataCode}>
              <button
                type="button"
                data-testid={`${testId}-option-${airport.iataCode}`}
                onClick={() => {
                  onSelect(airport);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#f7f5ff]"
              >
                <span className="mt-0.5 rounded-md bg-[#f0edff] px-1.5 py-0.5 text-[10px] font-black text-[#5b3df5]">
                  {airport.iataCode}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-[#111A4A]">{airport.name}</span>
                  <span className="block truncate text-[10px] text-slate-400">
                    {airport.city} · {airport.country}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


/**
 * Departure time entry.
 *
 * Deliberately NOT `<input type="time">`: on Safari/macOS that control renders
 * the digits the user typed while never firing input/change and leaving
 * `.value` as '' for a React-controlled field, so the entered time is
 * unreachable. A plain text field parsed through `parseTimeInput` behaves
 * identically on every browser and keeps one canonical `HH:mm`.
 */
function TimeField({
  label,
  anchorId,
  value,
  invalid,
  onCommit,
}: {
  label: string;
  anchorId: string;
  value: string;
  invalid: boolean;
  onCommit: (canonical: string) => void;
}) {
  const [text, setText] = useState(value);

  // Follow the canonical value when it changes elsewhere (reopen, prefill),
  // but never fight the user mid-entry.
  useEffect(() => {
    setText(current => (parseTimeInput(current) === value ? current : value));
  }, [value]);

  return (
    <label
      className={`flex items-center gap-1.5 rounded-xl border bg-white px-2 ${invalid ? 'border-rose-300' : 'border-[#e5e5ef]'} text-slate-400`}
    >
      <Clock size={13} />
      <input
        aria-label={label}
        data-time-anchor={anchorId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        maxLength={5}
        value={text}
        onChange={event => {
          const next = formatTimeInput(event.target.value);
          setText(next);
          // Commit only a complete, in-range time; a partial entry keeps the
          // canonical field empty so validation stays honest.
          onCommit(parseTimeInput(next) || '');
        }}
        className="min-w-0 bg-transparent py-2 text-xs text-slate-600 outline-none"
      />
    </label>
  );
}

export default function FlightAnchorsForm({
  anchors,
  onChange,
  destination,
  startDate,
  endDate,
  homeAirportIata,
  flightMode = 'ROUND_TRIP',
  onFlightModeChange,
}: Props) {
  const context = useMemo(
    () => ({ destination, startDate, endDate, homeAirportIata }),
    [destination, startDate, endDate, homeAirportIata],
  );
  const [editing, setEditing] = useState(anchors.length === 0);
  const [draft, setDraft] = useState<FlightAnchor[]>(() => buildFlightAnchorDraft(anchors, context, flightMode));
  /**
   * Validation is DERIVED from the live draft, never snapshotted.
   *
   * A frozen error list is how a field could show a red border and
   * 「請選擇去程出發時間」 while the draft already held 12:30: the snapshot was
   * taken at the failed save and nothing recomputed it. Deriving means a valid
   * time clears its own error on the same keystroke, with no second save.
   *
   * Errors stay hidden until the first save attempt, so an untouched form does
   * not open covered in red.
   */
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(buildFlightAnchorDraft(anchors, context, flightMode));
  }, [anchors, context, flightMode, editing]);

  const destinationCandidates = useMemo(() => destinationAirportCandidates(destination), [destination]);
  const errors = useMemo<FlightAnchorFieldError[]>(
    () => (hasAttemptedSave ? validateFlightAnchors(draft) : []),
    [hasAttemptedSave, draft],
  );

  const update = (id: string, changes: Partial<FlightAnchor>) =>
    setDraft(items => items.map(item => (item.id === id ? { ...item, ...changes } : item)));

  /**
   * Selecting an outbound airport re-runs the prefill so the return leg can
   * mirror it — but only into fields the user has not filled in themselves.
   */
  const selectAirport = (id: string, side: 'departure' | 'arrival', airport: FlightAirport | undefined) =>
    setDraft(items => {
      const next = items.map(item => (item.id === id ? applyAirport(item, side, airport) : item));
      const target = next.find(item => item.id === id);
      return target?.direction === 'OUTBOUND' ? buildFlightAnchorDraft(next, context, flightMode) : next;
    });

  const setMode = (mode: TripFlightMode) => {
    onFlightModeChange?.(mode);
    setDraft(items => buildFlightAnchorDraft(items, context, mode));
  };

  const save = () => {
    setHasAttemptedSave(true);
    // Validate the same draft the inputs render from — one source of truth.
    if (validateFlightAnchors(draft).length > 0) return;
    onChange(draft);
    setHasAttemptedSave(false);
    setEditing(false);
  };

  // Upload stays alongside manual entry rather than replacing it. A boarding
  // pass can be blurry, cropped, or a photo of a screen, and a flight is the
  // one thing on a trip that cannot be approximately right — so the parse fills
  // the draft for the traveller to confirm, never the saved anchors directly.
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadDirection = useRef<FlightAnchor['direction']>('OUTBOUND');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanNote, setScanNote] = useState('');

  const scanTicket = async (file: File, direction: FlightAnchor['direction']) => {
    setScanError('');
    setScanNote('');
    setScanning(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/flights/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type, tripStartDate: startDate, tripEndDate: endDate }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setScanError(body?.error || '辨識失敗，請手動輸入。');
        return;
      }
      const legs = await response.json() as { OUTBOUND?: ParsedFlight; RETURN?: ParsedFlight };

      // A round-trip confirmation carries both legs, so both are applied. In
      // 單程 mode only the outbound exists to receive anything; a return read
      // from the image is kept out rather than silently discarded elsewhere.
      // Decided before the state update, never inside it. React runs an
      // updater on its own schedule, so a list the updater builds is still
      // empty when the next line reads it — which sent every successful parse
      // down the failure branch.
      const applicable = legsToApply(legs, flightMode);

      if (applicable.length === 0) {
        setScanError('這張截圖看不出航班資訊，請手動輸入。');
        return;
      }

      setDraft(current =>
        applicable.reduce<FlightAnchor[]>(
          (draftSoFar, [leg, flight]) => applyFlightToDraft(draftSoFar, flight, leg),
          current,
        ),
      );

      const filled = applicable.map(([leg]) => (leg === 'RETURN' ? '回程' : '去程'));
      const uncertain = applicable.some(([, flight]) => flight.isUncertain);
      setScanNote(
        uncertain
          ? `已填入${filled.join('、')}，但截圖辨識不完全，請逐欄核對。`
          : `已填入${filled.join('、')}，請確認後儲存。`,
      );
    } catch {
      setScanError('辨識失敗，請手動輸入。');
    } finally {
      setScanning(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const cancel = () => {
    setDraft(buildFlightAnchorDraft(anchors, context, flightMode));
    setHasAttemptedSave(false);
    setEditing(false);
  };

  const errorFor = (anchorId: string, field: FlightAnchorFieldError['field']) =>
    errors.find(error => error.anchorId === anchorId && error.field === field);

  const visibleDirections: FlightAnchor['direction'][] =
    flightMode === 'ONE_WAY' ? ['OUTBOUND'] : ['OUTBOUND', 'RETURN'];

  if (!editing) {
    return (
      <section className="rounded-[28px] border border-[#e8e7f4] bg-white p-5 shadow-[0_14px_34px_rgba(17,26,74,.07)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f0edff] text-[#5b3df5]">
              <Plane size={19} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#8b3dff]">FLIGHT ANCHORS</p>
              <h2 className="mt-1 font-black text-[#111A4A]">航班資訊</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(buildFlightAnchorDraft(anchors, context, flightMode));
              setEditing(true);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-3 py-2 text-xs font-black text-[#5b3df5]"
          >
            <Settings2 size={14} />
            編輯
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visibleDirections.map(direction => {
            const item = anchors.find(anchor => anchor.direction === direction);
            const departure = item ? airportOf(item, 'departure') : undefined;
            const arrival = item ? airportOf(item, 'arrival') : undefined;
            const times = flightTimesLabel(item ?? {});
            return (
              <div
                key={direction}
                data-testid={`flight-summary-${direction}`}
                className="rounded-2xl border border-[#ececf5] bg-[#fbfaff] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-black text-[#111A4A]">
                    {direction === 'RETURN' ? (
                      <PlaneLanding size={16} className="text-[#6b4df6]" />
                    ) : (
                      <PlaneTakeoff size={16} className="text-[#6b4df6]" />
                    )}
                    {legLabel(direction)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${item ? 'bg-[#eeeaff] text-[#5b3df5]' : 'bg-white text-slate-400'}`}
                  >
                    {item ? '已儲存' : '尚未設定'}
                  </span>
                </div>
                {item ? (
                  <>
                    {/*
                      Both times, because the arrival is what the rest of the
                      day is built from — clearing the airport, the ride to the
                      hotel, check-in — and the card showing only a departure
                      made an unset arrival look identical to a set one.
                    */}
                    <p className="mt-3 text-sm font-black text-[#111A4A]">
                      {dateLabel(item.departureDate)} · {times.departure}
                      {times.arrival ? (
                        <>
                          {' → '}{times.arrival}
                          {times.dayOffset > 0 && (
                            <span className="ml-0.5 align-super text-[10px] text-[#6b4df6]">+{times.dayOffset}</span>
                          )}
                        </>
                      ) : (
                        <span className="ml-1.5 text-[11px] font-bold text-amber-600">抵達時間未填</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {departure ? formatAirportLabel(departure) : item.departureAirport}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {arrival ? formatAirportLabel(arrival) : item.arrivalAirport || '抵達機場未設定'}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      抵達機場目標：起飛前 {item.airportArrivalBufferMinutes || 120} 分鐘
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">新增{legLabel(direction)}航班資訊</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-[#e8e7f4] bg-white p-5 shadow-[0_14px_34px_rgba(17,26,74,.07)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#8b3dff]">FLIGHT ANCHORS</p>
          <h2 className="mt-1 font-black text-[#111A4A]">航班資訊</h2>
          <p className="mt-1 text-xs text-slate-400">儲存後會自動更新行程中的航班錨點。</p>
        </div>
        <button
          type="button"
          onClick={cancel}
          aria-label="取消"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e8e7f4] text-slate-400"
        >
          <X size={17} />
        </button>
      </div>

      {onFlightModeChange && (
        <div role="radiogroup" aria-label="航班類型" className="mb-4 inline-flex rounded-2xl bg-[#f5f3ff] p-1">
          {(['ROUND_TRIP', 'ONE_WAY'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={flightMode === mode}
              onClick={() => setMode(mode)}
              className={`min-h-10 rounded-xl px-4 text-xs font-black ${
                flightMode === mode ? 'bg-white text-[#5b3df5] shadow-sm' : 'text-slate-400'
              }`}
            >
              {mode === 'ROUND_TRIP' ? '往返' : '單程'}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 rounded-[20px] border border-dashed border-[#d9d5f5] bg-[#fbfaff] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-slate-500">有機票或登機證截圖？直接上傳</p>
          <button
            type="button"
            disabled={scanning}
            onClick={() => {
              uploadDirection.current = 'OUTBOUND';
              fileInput.current?.click();
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-3 py-2 text-xs font-black text-[#5b3df5] disabled:opacity-50"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            {scanning ? '辨識中' : '上傳截圖'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void scanTicket(file, uploadDirection.current);
          }}
        />
        {scanError && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-rose-600">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {scanError}
          </p>
        )}
        {scanNote && <p className="mt-2 text-[11px] font-bold text-[#5b3df5]">{scanNote}</p>}
      </div>

      <div className="space-y-3">
        {draft.map(anchor => {
          const dateError = errorFor(anchor.id, 'departureDate');
          const timeError = errorFor(anchor.id, 'departureTime');
          return (
            <div
              key={anchor.id}
              data-testid={`flight-card-${anchor.direction}`}
              className="rounded-[20px] border border-[#ececf5] bg-[#fbfaff] p-4"
            >
              <div className="mb-3 flex items-center justify-between text-xs font-black text-[#111A4A]">
                <span className="flex items-center gap-2">
                  {anchor.direction === 'RETURN' ? (
                    <PlaneLanding size={16} className="text-[#6b4df6]" />
                  ) : (
                    <PlaneTakeoff size={16} className="text-[#6b4df6]" />
                  )}
                  {legLabel(anchor.direction)}航班
                </span>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-400">編輯中</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex items-center gap-1.5 rounded-xl border bg-white px-2 text-slate-400 ${dateError ? 'border-rose-300' : 'border-[#e5e5ef]'}`}
                >
                  <Clock size={13} />
                  <input
                    aria-label={`${legLabel(anchor.direction)}出發日期`}
                    type="date"
                    value={anchor.departureDate}
                    onChange={event => update(anchor.id, { departureDate: event.target.value })}
                    className="min-w-0 bg-transparent py-2 text-xs text-slate-600"
                  />
                </label>
                <TimeField
                  label={`${legLabel(anchor.direction)}出發時間`}
                  anchorId={anchor.id}
                  value={anchor.departureTime}
                  invalid={Boolean(timeError)}
                  onCommit={canonical => update(anchor.id, { departureTime: canonical })}
                />
              </div>
              <AirportField
                label={`${legLabel(anchor.direction)}出發機場`}
                anchorId={anchor.id}
                side="departure"
                value={airportOf(anchor, 'departure')}
                suggestions={anchor.direction === 'RETURN' ? destinationCandidates : []}
                invalid={Boolean(errorFor(anchor.id, 'departureAirport'))}
                onSelect={airport => selectAirport(anchor.id, 'departure', airport)}
              />
              <AirportField
                label={`${legLabel(anchor.direction)}抵達機場`}
                anchorId={anchor.id}
                side="arrival"
                value={airportOf(anchor, 'arrival')}
                suggestions={anchor.direction === 'OUTBOUND' ? destinationCandidates : []}
                invalid={Boolean(errorFor(anchor.id, 'arrivalAirport'))}
                onSelect={airport => selectAirport(anchor.id, 'arrival', airport)}
              />

              {/*
                Landing time, which the form had no way to hold.
                
                Everything downstream of arriving is built on it — when the
                traveller clears the airport, how long the ride to the hotel
                takes, what time check-in should be. Without a field, those
                quietly did nothing on every flight entered by hand, and there
                was nowhere to see or correct what a boarding pass had read.
                
                Optional on purpose: a departure is what makes an anchor, and
                requiring an arrival would block saving a flight the traveller
                only half knows.
              */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1.5 rounded-xl border border-[#e5e5ef] bg-white px-2 text-slate-400">
                  <PlaneLanding size={13} />
                  <input
                    aria-label={`${legLabel(anchor.direction)}抵達日期`}
                    type="date"
                    value={anchor.arrivalDate || anchor.departureDate || ''}
                    onChange={event => update(anchor.id, { arrivalDate: event.target.value })}
                    className="min-w-0 bg-transparent py-2 text-xs text-slate-600"
                  />
                </label>
                <TimeField
                  label={`${legLabel(anchor.direction)}抵達時間`}
                  anchorId={`${anchor.id}-arrival`}
                  value={anchor.arrivalTime || ''}
                  invalid={false}
                  onCommit={canonical => update(anchor.id, { arrivalTime: canonical })}
                />
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                填了抵達時間，才會自動推算出關時間、機場到住宿的交通，以及入住時間。
              </p>
            </div>
          );
        })}
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1">
          {errors.map(error => (
            <li key={`${error.anchorId}-${error.field}`} className="text-xs font-bold text-rose-500">
              {error.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={save}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#2f5bff] to-[#7b3ff2] px-4 text-sm font-black text-white shadow-[0_10px_20px_rgba(91,61,245,.2)]"
        >
          <Check size={15} />
          儲存航班
        </button>
        <button
          type="button"
          onClick={cancel}
          className="min-h-12 rounded-2xl border border-[#e8e7f4] px-5 text-sm font-bold text-[#5b3df5]"
        >
          取消
        </button>
      </div>
    </section>
  );
}
