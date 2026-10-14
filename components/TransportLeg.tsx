import React, { useEffect, useState } from 'react';
import { Bus, Car, Footprints, ChevronRight, MapPinned, AlertTriangle, X } from 'lucide-react';
import { OVERLAY } from '../constants/layers';
import { naverRouteUrl } from '../services/naverMapLinks';
import { fetchRouteLeg, RouteLeg, TravelMode, TRAVEL_MODE_LABELS } from '../services/routesService';
import { isSameSpot, noRouteDetail, noRouteSummary } from '../services/transportLegWording';
import { defaultTravelMode, transitIsUnavailable, transitUnavailableHint, transitUnavailableReason } from '../services/transitCoverage';

interface Props {
  origin: { latitude: number; longitude: number; title: string };
  destination: { latitude: number; longitude: number; title: string };
  /**
   * Minutes the plan leaves for this leg: from the end of the previous item to
   * the start of the next. Undefined when either time is missing.
   */
  availableMinutes?: number;
  /** When the traveller is expected to set off, so transit answers for that hour. */
  departureTime?: string;
  /**
   * Where this leg is. Only used to explain an absent route: in South Korea
   * Google publishes no driving or walking directions at all, which is a legal
   * restriction rather than a gap in the data, and the traveller should be sent
   * to Naver or Kakao instead of pressing the button again.
   */
  destinationCountry?: string;
  /**
   * Pushes the next item — and everything after it on that day — back far
   * enough that this journey fits. Offered only when the plan leaves less time
   * than the journey takes, and only ever run on an explicit tap: the day is
   * the traveller's, and the number is a provider's estimate.
   *
   * Returns false when the write was refused, e.g. a fixed event in the way.
   */
  onPushBackNext?: (journeyMinutes: number) => boolean;
}

/** Whether this is the one country whose missing routes have a known reason. */
const isKorea = (country?: string): boolean =>
  /韓國|南韓|韓国|korea|^kr$/i.test((country || '').trim());

const MODES: TravelMode[] = ['TRANSIT', 'DRIVE', 'WALK'];

const MODE_ICONS: Record<TravelMode, React.ComponentType<{ size?: number; className?: string }>> = {
  TRANSIT: Bus,
  DRIVE: Car,
  WALK: Footprints,
};

const minutesOf = (seconds?: number): number => Math.max(1, Math.round((seconds || 0) / 60));

/** 「搭 1003 · 27 站」 — the one line worth reading without opening anything. */
const summarize = (leg: RouteLeg): string => {
  const rides = (leg.steps || []).filter(step => step.travelMode === 'TRANSIT');
  if (rides.length === 0) return '';
  const first = rides[0];
  const tail = rides.length > 1 ? ` 等 ${rides.length} 段` : '';
  return `${first.lineName ? `${first.lineName} ` : ''}${first.stopCount ? `${first.stopCount} 站` : ''}${tail}`.trim();
};

/**
 * How you get from one place on the plan to the next.
 *
 * Transit by default, because that is what works where this app is used: South
 * Korea publishes no Google driving or walking routes, so a default of 車程
 * would be blank everywhere that matters. The other modes are one tap away and
 * each answers for itself — a mode with no route says so rather than quietly
 * showing another mode's number.
 *
 * Japan is the exception in the other direction — the Routes API carries no
 * Japanese transit at all — so the default there is driving. See
 * `defaultTravelMode`.
 */
const TransportLeg: React.FC<Props> = ({ origin, destination, availableMinutes, departureTime, destinationCountry, onPushBackNext }) => {
  /*
    Opening on 大眾運輸 where the provider has no transit data guarantees the
    first thing the traveller sees is a failure, on every leg of the trip.
    See `defaultTravelMode`.
  */
  const [mode, setMode] = useState<TravelMode>(() => defaultTravelMode(destinationCountry));
  const [leg, setLeg] = useState<RouteLeg | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  /** Set when a push-back was refused, so the tap is not silently ignored. */
  const [pushBackError, setPushBackError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setLeg(null);
    fetchRouteLeg(origin, destination, mode, departureTime)
      .then(result => { if (!cancelled) setLeg(result); })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : '路線服務暫時無法使用。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [origin.latitude, origin.longitude, destination.latitude, destination.longitude, mode, departureTime]);

  const Icon = MODE_ICONS[mode];
  const googleMapUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=${mode === 'TRANSIT' ? 'transit' : mode === 'DRIVE' ? 'driving' : 'walking'}`;
  /*
    In Korea this opens NAVER instead, and that is the point of the whole
    feature: this card is where somebody standing between two stops actually
    presses 「在地圖開啟」.

    It already knew. `isKorea` has been here all along to explain why Google
    returns no driving or walking route — a legal restriction, not missing
    data — and the comment on that prop says to send the traveller to Naver.
    It could say so and not do it.

    Null when either end has no coordinates, and then the Google link stands:
    a route with one real end opens NAVER on something plausible and wrong,
    which is the failure we watched happen on a phone.
  */
  const naverUrl = isKorea(destinationCountry)
    ? naverRouteUrl(
        { latitude: origin.latitude, longitude: origin.longitude, name: origin.title },
        { latitude: destination.latitude, longitude: destination.longitude, name: destination.title },
        mode === 'TRANSIT' ? 'transit' : mode === 'DRIVE' ? 'drive' : 'walk',
      )
    : null;
  const mapUrl = naverUrl || googleMapUrl;
  /*
    「要去調整說法」 — 「這個地區查不到…路線」 was said of two cards that were both
    Taoyuan airport. Whether the two ends are the same spot is the difference
    between a lookup that failed and a journey that does not exist.
  */
  const sameSpot = isSameSpot(origin, destination);
  /** The one line on the plan, repeated at the top of the sheet. */
  const summaryLine = loading ? '計算交通中…'
    : error ? error
    : leg?.available ? `約 ${minutesOf(leg.durationSeconds)} 分 · ${TRAVEL_MODE_LABELS[mode]}${summarize(leg) ? ` · ${summarize(leg)}` : ''}`
    : isKorea(destinationCountry)
      ? `🚫 因法規限制，Google 地圖無法以「${TRAVEL_MODE_LABELS[mode]}」查詢`
      : mode === 'TRANSIT' && transitIsUnavailable(destinationCountry)
        ? '這個國家的大眾運輸查不到班次'
        : noRouteSummary(TRAVEL_MODE_LABELS[mode], sameSpot);
  // Nothing to open while the answer is still being fetched or the request
  // failed outright; a refused mode still opens, because the sheet is where the
  // reason and the alternative live.
  const canOpen = Boolean(leg) && !loading;
  const needed = leg?.available ? minutesOf(leg.durationSeconds) : undefined;
  // Only ever a statement of two numbers. Rescheduling the day off the back of
  // it is a separate decision and is not taken here.
  const tooTight = needed !== undefined && availableMinutes !== undefined && availableMinutes < needed;

  return (
    <div data-testid="transport-leg" className="ml-[62px] rounded-2xl border border-[#eceaf5] bg-white/80 px-3 py-2">
      <button
        type="button"
        aria-label="交通方式說明"
        disabled={!canOpen}
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 text-left disabled:cursor-default"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f0edff] text-[#5b3df5]"><Icon size={14} /></span>
        <span className="min-w-0 flex-1 text-[11px] font-black leading-4 text-[#11183d]">
          {summaryLine}
        </span>
        {canOpen && <ChevronRight size={14} className="shrink-0 text-slate-300" />}
      </button>

      {/* Pressing the button again will not help, so the next step is named. */}
      {leg && !leg.available && isKorea(destinationCountry) && (
        <div className="mt-1.5 text-[10px] font-bold leading-4 text-slate-400">
          當地人用 Naver Map 或 KakaoMap，這兩款查得到。
        </div>
      )}
      {/*
        The answer, one tap away, where the dead end used to be.

        「我點擊了查看地圖 … 就會有大眾運輸的資訊」 — and he is right: Google Maps
        has Japan's timetables under agreements the Routes API does not carry,
        so the thing this card cannot compute is sitting behind a link this
        card already knew how to build. Naming it and not offering it was the
        mistake; a sentence telling somebody to go and look it up elsewhere is
        worse than the button that takes them there.

        Transit travelmode explicitly, because that is the question that failed.
      */}
      {leg && !leg.available && mode === 'TRANSIT' && transitIsUnavailable(destinationCountry) && (
        <a
          data-testid="transit-unsupported-hint"
          href={googleMapUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-[#f0edff] px-2.5 py-2 text-[10px] font-black leading-4 text-[#5b3df5]"
        >
          <MapPinned size={13} className="shrink-0" />
          <span className="min-w-0 flex-1">用 Google 地圖查這段的大眾運輸</span>
          <ChevronRight size={12} className="shrink-0" />
        </a>
      )}
      {leg && !leg.available && mode === 'TRANSIT' && transitIsUnavailable(destinationCountry) && (
        <p className="mt-1 text-[10px] font-bold leading-4 text-slate-400">
          {transitUnavailableHint(destinationCountry)}
        </p>
      )}

      {tooTight && (
        <div data-testid="transport-too-tight" className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5">
          <div className="flex items-start gap-1 text-[10px] font-bold leading-4 text-amber-700">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">這段只留了 {availableMinutes} 分鐘，實際要 {needed} 分鐘。</span>
          </div>
          {onPushBackNext && (
            <button
              type="button"
              onClick={() => {
                setPushBackError('');
                if (!onPushBackNext(needed!)) setPushBackError('這一天有固定行程擋著，沒有自動順延。請手動調整。');
              }}
              className="mt-1.5 min-h-8 w-full rounded-lg bg-white text-[10px] font-black text-amber-700 shadow-sm"
            >
              順延後面的行程
            </button>
          )}
          {pushBackError && <p className="mt-1 text-[10px] font-bold leading-4 text-amber-700">{pushBackError}</p>}
        </div>
      )}

      {/* The modes, always all three: which ones have no route here is itself
          worth knowing, and hiding them would make the absence look like a bug. */}
      <div className="mt-1.5 flex gap-1.5">
        {MODES.map(option => {
          const OptionIcon = MODE_ICONS[option];
          return (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={`flex min-h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-black transition ${mode === option ? 'bg-[#5b3df5] text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <OptionIcon size={11} />{TRAVEL_MODE_LABELS[option]}
            </button>
          );
        })}
      </div>

      {/*
        The detail is a sheet, not an expanded row: a full journey is a stack of
        lines, stops and walks that pushes the rest of the day off the screen
        when it opens inline, and the traveller reading it has stopped reading
        the plan and started reading the journey.
      */}
      {open && (
        <div
          data-testid="transport-sheet"
          className={`fixed inset-0 ${OVERLAY.modal} flex items-end justify-center bg-slate-950/40 p-0 md:items-center md:p-6`}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="交通方式"
            onClick={event => event.stopPropagation()}
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-sm md:rounded-3xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f0edff] text-[#5b3df5]"><Icon size={19} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black leading-tight text-[#111A4A]">{origin.title} → {destination.title}</h2>
                <p className="mt-0.5 text-[11px] font-bold text-slate-500">{summaryLine}</p>
              </div>
              <button type="button" aria-label="關閉" onClick={() => setOpen(false)} className="shrink-0 rounded-xl p-1 text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Switchable here too: comparing modes is the reason this is open. */}
            <div className="mt-4 flex gap-1.5">
              {MODES.map(option => {
                const OptionIcon = MODE_ICONS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => setMode(option)}
                    className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl text-[11px] font-black transition ${mode === option ? 'bg-[#5b3df5] text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    <OptionIcon size={12} />{TRAVEL_MODE_LABELS[option]}
                  </button>
                );
              })}
            </div>

            {leg?.available ? (
              <ol className="mt-4 space-y-3">
                {(leg.steps || []).map((step, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#f6f5ff] text-[#5b3df5]">
                      {step.travelMode === 'WALK' ? <Footprints size={13} /> : <Bus size={13} />}
                    </span>
                    <span className="min-w-0 flex-1 text-xs leading-5 text-slate-600">
                      {step.travelMode === 'WALK'
                        ? <b className="font-black text-[#11183d]">步行 {minutesOf(step.durationSeconds)} 分</b>
                        : (
                          <>
                            <b className="font-black text-[#11183d]">{step.lineName || '大眾運輸'}</b>
                            <span className="ml-1.5 text-[11px] font-bold text-slate-400">{minutesOf(step.durationSeconds)} 分</span>
                            {step.departureStop && step.arrivalStop && (
                              <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{step.departureStop} → {step.arrivalStop}</span>
                            )}
                            {step.stopCount ? <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">搭 {step.stopCount} 站</span> : null}
                          </>
                        )}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-700">
                {isKorea(destinationCountry)
                  ? '🚫 因法規限制，Google 地圖無法以這個交通方式查詢。當地人用 Naver Map 或 KakaoMap，這兩款查得到。'
                  : mode === 'TRANSIT' && transitIsUnavailable(destinationCountry)
                    ? transitUnavailableReason(destinationCountry)
                    : noRouteDetail(TRAVEL_MODE_LABELS[mode], sameSpot)}
              </p>
            )}

            {leg?.distanceMeters ? (
              <p className="mt-3 text-[11px] font-bold text-slate-400">全程約 {(leg.distanceMeters / 1000).toFixed(1)} 公里</p>
            ) : null}

            {/* The label names the app it opens, because 「在地圖開啟」 on a
                button that launches NAVER is a small surprise at the exact
                moment somebody is trying to leave. */}
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="transport-map-link"
              className={`mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-black text-white ${
                naverUrl ? 'bg-[#03c75a]' : 'bg-gradient-to-r from-blue-600 to-violet-600'
              }`}
            >
              <MapPinned size={15} />{naverUrl ? '在 NAVER 地圖開啟' : '在地圖開啟'}
            </a>

            {/* Google still routes transit in Korea; only driving and walking
                are withheld. Keeping it reachable costs one line and is the
                「choose another provider」 the ticket asks for. */}
            {naverUrl && (
              <a
                href={googleMapUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="transport-google-link"
                className="mt-2 flex min-h-11 w-full items-center justify-center text-xs font-black text-slate-500"
              >
                改用 Google 地圖
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TransportLeg;
