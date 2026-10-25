import React from 'react';
import { CalendarDays, MapPinned, X } from 'lucide-react';
import { PublishedTripStop } from '../types';
import { tripDayCount } from '../services/tripPublishing';

/**
 * 加入我的行程 — one place off somebody else's trip, onto a day of your own.
 *
 * 「可將已收藏的地點加入自己的行程」. Three decisions and no more: which trip,
 * which day, and anything the traveller wants to remember about why. The place
 * itself is not editable here — it is somebody else's find, and a sheet that
 * let it be renamed on the way in would be a sheet that quietly severs the
 * credit.
 *
 * A trip with no dates offers no day, rather than a dropdown of guesses. The
 * item lands undated, which is exactly where the planner already puts a place
 * picked off a list.
 */

/**
 * A trip, as far as this sheet is concerned.
 *
 * Four fields, not a whole `Trip`. The sheet needs a name to offer and dates
 * to count days from, and asking for the full record would mean the drafts
 * list and the finished-trip list have to be the same type before either can
 * be offered here — which is a refactor, not a requirement.
 */
export interface TripChoice {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface Props {
  stop: PublishedTripStop;
  /** Where it came from, shown so the credit is visible before it is saved. */
  sourceLabel?: string;
  /** The traveller's own trips. Archived ones are the caller's to filter. */
  trips: TripChoice[];
  onAdd: (choice: { tripId: string; date?: string; remark?: string }) => void;
  onClose: () => void;
}

/** Every calendar day of a trip, so 「Day 3 (4/15)」 can be offered. */
export const tripDayOptions = (trip: TripChoice): Array<{ date: string; label: string }> => {
  const total = tripDayCount(trip);
  if (total === 0) return [];
  const start = Date.parse(`${trip.startDate}T00:00:00Z`);
  return Array.from({ length: total }, (_, index) => {
    const day = new Date(start + index * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    return {
      date,
      label: `Day ${index + 1} (${day.getUTCMonth() + 1}/${day.getUTCDate()})`,
    };
  });
};

const AddStopToTripSheet: React.FC<Props> = ({ stop, sourceLabel, trips, onAdd, onClose }) => {
  const [tripId, setTripId] = React.useState(trips[0]?.id ?? '');
  const [date, setDate] = React.useState('');
  const [remark, setRemark] = React.useState('');

  const chosen = trips.find(trip => trip.id === tripId);
  const days = chosen ? tripDayOptions(chosen) : [];

  /* Changing trip must not leave a day from the previous one selected. */
  React.useEffect(() => { setDate(''); }, [tripId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/30" data-testid="add-stop-sheet">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white px-[var(--screen-pad)] pb-6 pt-4 md:mx-auto md:max-w-2xl md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-[#11183d]">加入我的行程</h2>
          <button
            type="button"
            aria-label="關閉"
            data-testid="add-stop-close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f7f8fc] p-3">
          {stop.photos?.[0]
            ? <img src={stop.photos[0]} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#eef1ff] to-[#f3efff] text-[#6b4df6]">
                <MapPinned size={16} />
              </span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-black text-[#11183d]">{stop.title}</span>
            {stop.location && (
              <span className="block truncate text-[11px] text-slate-400">{stop.location}</span>
            )}
            {/* The credit, visible before it is saved rather than only after. */}
            {sourceLabel && (
              <span
                data-testid="add-stop-source"
                className="mt-0.5 block truncate text-[11px] font-bold text-[#5b3df5]"
              >
                {sourceLabel}
              </span>
            )}
          </span>
        </div>

        {trips.length === 0 ? (
          /*
            Said, rather than a disabled button. 「你還沒有行程」 is an answer;
            a greyed-out 加入行程 is a puzzle.
          */
          <p
            data-testid="add-stop-no-trips"
            className="mt-4 rounded-2xl border border-dashed border-[#dcd9ec] bg-white px-4 py-8 text-center text-xs font-bold text-slate-400"
          >
            你還沒有可以加入的行程。先建立一個行程再回來。
          </p>
        ) : (
          <>
            <label className="mt-4 block text-[12px] font-black text-[#11183d]">
              選擇要加入的行程
              <select
                data-testid="add-stop-trip"
                value={tripId}
                onChange={event => setTripId(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-[#eceaf5] bg-white px-3 text-[13px] font-bold"
              >
                {trips.map(trip => (
                  <option key={trip.id} value={trip.id}>{trip.name}</option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-[12px] font-black text-[#11183d]">
              選擇日期
              {days.length === 0 ? (
                /*
                  A trip with no dates offers no day rather than a dropdown of
                  guesses. The item lands undated, which is where the planner
                  already puts a place picked off a list.
                */
                <p
                  data-testid="add-stop-no-days"
                  className="mt-1.5 rounded-xl bg-[#f7f8fc] px-3 py-3 text-[12px] font-bold text-slate-400"
                >
                  這個行程還沒有日期，會先放在未排入的地點裡。
                </p>
              ) : (
                <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-[#eceaf5] bg-white px-3">
                  <CalendarDays size={15} className="shrink-0 text-slate-300" />
                  <select
                    data-testid="add-stop-date"
                    value={date}
                    onChange={event => setDate(event.target.value)}
                    className="h-11 w-full bg-transparent text-[13px] font-bold"
                  >
                    <option value="">還沒決定哪一天</option>
                    {days.map(day => (
                      <option key={day.date} value={day.date}>{day.label}</option>
                    ))}
                  </select>
                </span>
              )}
            </label>

            <label className="mt-3 block text-[12px] font-black text-[#11183d]">
              備註（可選）
              <textarea
                data-testid="add-stop-remark"
                value={remark}
                onChange={event => setRemark(event.target.value)}
                rows={2}
                placeholder="看起來很棒，想去！"
                className="mt-1.5 w-full rounded-xl border border-[#eceaf5] px-3 py-2 text-[13px] placeholder:text-slate-300"
              />
            </label>

            <button
              type="button"
              data-testid="add-stop-confirm"
              onClick={() => onAdd({
                tripId,
                ...(date ? { date } : {}),
                ...(remark.trim() ? { remark: remark.trim() } : {}),
              })}
              className="mt-4 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white"
            >
              加入行程
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AddStopToTripSheet;
