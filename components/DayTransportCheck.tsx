import React, { useState } from 'react';
import { AlertTriangle, Check, Route, Loader2 } from 'lucide-react';
import { ItineraryItem } from '../types';
import { fetchRouteLeg } from '../services/routesService';
import { CheckedLeg, checkDayTransport, DayTransportVerdict } from '../services/dayTransportCheck';
import { durationOf } from '../services/itineraryTimeline';
import { TripAreas } from '../services/tripAreas';

/**
 * 「最後再確認行程時，可以一鍵點選AI確認當日行程的交通規劃是否順暢，提供的更改建議
 * 等」.
 *
 * Each leg already answers for itself, where it sits. What nobody could see was
 * the day: four journeys that each look fine, one gap twenty minutes short, and
 * a route that crosses the city and comes back.
 *
 * Only on a tap. Checking every day on open would mean a route request per leg
 * per day on every visit, for a question nobody asked yet.
 */

interface Props {
  date: string;
  /** The day's own timed stops, in the order they run. */
  items: ItineraryItem[];
  areas?: TripAreas;
  destinationCountry?: string;
}

const timeToMinutes = (time?: string): number | undefined => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return undefined;
  const [hours, minutes] = (time as string).split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesLabel = (minutes: number): string =>
  (minutes >= 60 ? `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`.replace(' 0 分', '') : `${minutes} 分`);

const DayTransportCheck: React.FC<Props> = ({ date, items, areas, destinationCountry }) => {
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<DayTransportVerdict | null>(null);
  const [error, setError] = useState('');

  const located = items.filter(item =>
    typeof item.latitude === 'number' && typeof item.longitude === 'number' && timeToMinutes(item.time) !== undefined);

  const run = async () => {
    setBusy(true);
    setError('');
    setVerdict(null);
    try {
      const legs: CheckedLeg[] = [];
      for (let index = 0; index < located.length - 1; index += 1) {
        const from = located[index];
        const to = located[index + 1];
        const leaveMinutes = (timeToMinutes(from.time) as number) + durationOf(from);
        /*
          Asked for the time they actually leave, not for now.

          A transit route at 09:00 and the same route at 21:00 are different
          journeys, and checking tonight's plan against this afternoon's
          timetable would be confidently wrong.
        */
        const departure = new Date(`${date}T${from.time}:00`);
        departure.setMinutes(departure.getMinutes() + durationOf(from));
        const route = await fetchRouteLeg(
          { latitude: from.latitude as number, longitude: from.longitude as number },
          { latitude: to.latitude as number, longitude: to.longitude as number },
          'TRANSIT',
          departure.toISOString(),
        ).catch(() => null);

        const fromArea = areas?.areaOfItem(from.id);
        const toArea = areas?.areaOfItem(to.id);
        legs.push({
          fromId: from.id,
          toId: to.id,
          fromTitle: from.location || from.title,
          toTitle: to.location || to.title,
          gapMinutes: (timeToMinutes(to.time) as number) - leaveMinutes,
          ...(route?.available && route.durationSeconds
            ? { journeyMinutes: Math.max(1, Math.round(route.durationSeconds / 60)) }
            : {}),
          ...(fromArea ? { fromAreaIndex: fromArea.colorIndex, fromAreaLabel: fromArea.label } : {}),
          ...(toArea ? { toAreaIndex: toArea.colorIndex, toAreaLabel: toArea.label } : {}),
        });
      }
      setVerdict(checkDayTransport(legs));
    } catch {
      setError('路線服務暫時無法使用，稍後再試一次。');
    } finally {
      setBusy(false);
    }
  };

  /*
    Nothing to check is said, not hidden.

    A day with one stop has no journeys in it; a button that silently does
    nothing would read as broken.
  */
  if (located.length < 2) return null;

  return (
    <section data-testid="day-transport-check" className="mb-4">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        data-testid="run-transport-check"
        className="flex w-full items-center justify-center gap-1.5 rounded-[18px] border border-[#ded7fb] bg-gradient-to-r from-[#f4f1ff] to-[#f8f4ff] px-3 py-2.5 text-xs font-black text-[#5b3df5] disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
        {busy ? '檢查今天的交通…' : '一鍵檢查今天的交通'}
      </button>

      {error && <p data-testid="transport-check-error" className="mt-2 text-[11px] font-bold text-rose-600">{error}</p>}

      {verdict && (
        <div data-testid="transport-check-result" className="mt-2 space-y-1.5">
          {verdict.smooth ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-2 text-[11px] font-bold leading-5 text-emerald-700">
              <Check size={12} className="mt-0.5 shrink-0" />
              今天的交通接得上，總移動約 {minutesLabel(verdict.travelMinutes)}。
            </p>
          ) : (
            verdict.findings.map((finding, index) => (
              <p
                key={`${finding.kind}-${finding.itemIds.join('-')}-${index}`}
                data-testid={`transport-finding-${finding.kind}`}
                className={`flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold leading-5 ${
                  finding.blocking ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{finding.message}</span>
              </p>
            ))
          )}
          {/*
            Korea publishes no Google driving or walking routes, so a day with
            unanswered legs there has a known reason rather than a fault.
          */}
          {verdict.unknownLegs > 0 && /韓國|南韓|korea/i.test(destinationCountry || '') && (
            <p className="px-1 text-[10px] font-medium leading-4 text-slate-400">
              韓國的路線資料由當地業者提供，部分路段 Google 查不到，可改用 Naver 或 Kakao 地圖確認。
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default DayTransportCheck;
