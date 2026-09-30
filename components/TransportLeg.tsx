import React, { useEffect, useState } from 'react';
import { Bus, Car, Footprints, ChevronDown, MapPinned, AlertTriangle } from 'lucide-react';
import { fetchRouteLeg, RouteLeg, TravelMode, TRAVEL_MODE_LABELS } from '../services/routesService';

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
}

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
 */
const TransportLeg: React.FC<Props> = ({ origin, destination, availableMinutes, departureTime }) => {
  const [mode, setMode] = useState<TravelMode>('TRANSIT');
  const [leg, setLeg] = useState<RouteLeg | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

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
  const needed = leg?.available ? minutesOf(leg.durationSeconds) : undefined;
  // Only ever a statement of two numbers. Rescheduling the day off the back of
  // it is a separate decision and is not taken here.
  const tooTight = needed !== undefined && availableMinutes !== undefined && availableMinutes < needed;

  return (
    <div data-testid="transport-leg" className="ml-[62px] rounded-2xl border border-[#eceaf5] bg-white/80 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f0edff] text-[#5b3df5]"><Icon size={14} /></span>
        <span className="min-w-0 flex-1 text-[11px] font-black leading-4 text-[#11183d]">
          {loading ? '計算交通中…'
            : error ? error
            : leg?.available ? `約 ${needed} 分 · ${TRAVEL_MODE_LABELS[mode]}${summarize(leg) ? ` · ${summarize(leg)}` : ''}`
            : `這個地區查不到${TRAVEL_MODE_LABELS[mode]}路線`}
        </span>
        {leg?.available && (leg.steps?.length || 0) > 0 && (
          <button type="button" aria-label="交通方式說明" aria-expanded={open} onClick={() => setOpen(current => !current)} className="shrink-0 rounded-lg p-1 text-slate-400">
            <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
          </button>
        )}
      </div>

      {tooTight && (
        <div data-testid="transport-too-tight" className="mt-1.5 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold leading-4 text-amber-700">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">這段只留了 {availableMinutes} 分鐘，實際要 {needed} 分鐘。</span>
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
              onClick={() => { setMode(option); setOpen(false); }}
              className={`flex min-h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-black transition ${mode === option ? 'bg-[#5b3df5] text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <OptionIcon size={11} />{TRAVEL_MODE_LABELS[option]}
            </button>
          );
        })}
        <a
          href={`https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=${mode === 'TRANSIT' ? 'transit' : mode === 'DRIVE' ? 'driving' : 'walking'}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex min-h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-black text-[#5b3df5]"
        >
          <MapPinned size={11} />地圖
        </a>
      </div>

      {open && leg?.available && (
        <ol className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
          {(leg.steps || []).map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-[10px] leading-4 text-slate-600">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#5b3df5]">
                {step.travelMode === 'WALK' ? <Footprints size={11} /> : <Bus size={11} />}
              </span>
              <span className="min-w-0 flex-1">
                {step.travelMode === 'WALK'
                  ? `步行 ${minutesOf(step.durationSeconds)} 分`
                  : (
                    <>
                      <b className="font-black text-[#11183d]">{step.lineName || '大眾運輸'}</b>
                      {step.departureStop && step.arrivalStop && <> · {step.departureStop} → {step.arrivalStop}</>}
                      {step.stopCount ? <> · {step.stopCount} 站</> : null}
                      <> · {minutesOf(step.durationSeconds)} 分</>
                    </>
                  )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default TransportLeg;
