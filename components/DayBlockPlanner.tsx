import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Plus } from 'lucide-react';
import { ItineraryItem } from '../types';
import { AREA_COLORS } from '../constants/areaColors';
import { BLOCK_MINUTES, buildDayTemplate, DaySlot } from '../services/dayTemplate';
import { FixedScheduleEntry } from '../services/itineraryDayFloor';
import { dayAreaSpread, daySpansTooManyAreas } from '../services/dayAreaSpread';
import { TripAreas } from '../services/tripAreas';

/**
 * A day built by filling blocks, instead of by placing times.
 *
 * 「目前行程表會一直跑版 … 一個行程都預設抓 2 小時，讓用戶用下拉式選單的方式來排
 * 行程」, and 「可以接畫面 因為我們根本無法用行程表的這個功能」.
 *
 * Nothing new is stored. A filled block *is* an itinerary item — the same item
 * the timeline below already draws — and an empty block is only a shape that
 * has not been filled yet. A second store of 「the day's blocks」 would be a
 * second thing to sync, a second thing to get out of step with the plan, and a
 * second answer to 「what is at 14:00」.
 */

interface PlaceOption {
  id: string;
  placeName: string;
  /** Which area it is in, for the colour and for sorting the list. */
  areaLabel?: string;
  areaColorIndex?: number;
  /** True when it is already somewhere on this trip's plan. */
  alreadyPlanned?: boolean;
}

interface Props {
  date: string;
  /** The day's timed items, in the order they run. */
  items: ItineraryItem[];
  /** Flights and check-ins, which bound the day rather than filling it. */
  fixedSchedule?: FixedScheduleEntry[];
  /** The traveller's saved places, offered in the dropdowns. */
  places: PlaceOption[];
  areas?: TripAreas;
  /** Fills an empty block. The caller writes the item and owns persistence. */
  onFillBlock: (slot: DaySlot, placeId: string) => void;
  /** Changes how long a placed item runs; everything after it moves with it. */
  onChangeDuration?: (itemId: string, minutes: number) => void;
  /** Items that are fixed and must never be offered a length control. */
  isFixed?: (item: ItineraryItem) => boolean;
}

/** 「一個行程都預設抓 2 小時」, and the lengths worth offering around it. */
const DURATION_CHOICES = [30, 60, 90, 120, 150, 180, 240];

const minutesLabel = (minutes: number): string =>
  (minutes % 60 === 0 ? `${minutes / 60} 小時` : `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`);

const DayBlockPlanner: React.FC<Props> = ({
  date,
  items,
  fixedSchedule = [],
  places,
  areas,
  onFillBlock,
  onChangeDuration,
  isFixed,
}) => {
  /*
    The day starts when the traveller says, and runs to the evening regardless.

    「這個表 不是刪掉行程就會消失 要固定存在」. It used to start at the first item's
    time, so a day whose first item was at 17:00 had no morning at all — and
    deleting that item took its block with it. The table is the day; the items
    are what is in it.
  */
  const [chosenStart, setChosenStart] = useState('');

  /*
    The items, by the clock.

    Placed into whichever block their time falls in rather than by position, so
    a gap in the day is a gap in the table rather than a shift of everything
    after it.
  */
  const occupants = useMemo(
    () => items.map(item => ({
      id: item.id,
      time: item.time,
      durationMinutes: Number.isFinite(item.durationMinutes) ? Number(item.durationMinutes) : undefined,
    })),
    [items],
  );

  const { slots, ranOutOfDay } = useMemo(
    () => buildDayTemplate({ date, dayStart: chosenStart || undefined, fixedSchedule, occupants }),
    [date, chosenStart, fixedSchedule, occupants],
  );

  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const spread = useMemo(() => (areas ? dayAreaSpread(items, areas) : undefined), [items, areas]);

  /*
    Same area first.

    The point of the dropdown is to build a day that stays in one place, so the
    places that would do that are the ones to reach first. Within an area the
    saved order stands: it is the only other ordering the traveller has.
  */
  const optionsFor = (slot: DaySlot): PlaceOption[] => {
    const dayAreas = new Set(spread?.areas.map(area => area.colorIndex) ?? []);
    return [...places].sort((left, right) => {
      const leftNear = left.areaColorIndex !== undefined && dayAreas.has(left.areaColorIndex) ? 0 : 1;
      const rightNear = right.areaColorIndex !== undefined && dayAreas.has(right.areaColorIndex) ? 0 : 1;
      return leftNear - rightNear;
    });
  };

  return (
    <section data-testid="day-block-planner" className="mb-4 rounded-[22px] border border-[#e8e7f4] bg-white p-3">
      {/*
        A time input will not shrink, so everything around it has to be told it
        may.

        「這頁則是沒有滿版」 — this row was flex with no min-w-0 anywhere and no
        width on the control. A type="time" field reports a whole clock as its
        minimum width, so the row could not fit, the card could not fit, and
        the page ended up wider than the phone with its right edge cut off.
        Nothing here looked too wide; one thing simply refused to be narrower.
      */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex shrink-0 items-center gap-1.5 text-sm font-black text-[#11183d]">
          <Clock3 size={14} className="text-[#5b3df5]" />排今天
        </h3>
        {(
          <label className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <span className="shrink-0">幾點出門</span>
            <input
              type="time"
              value={chosenStart}
              onChange={event => setChosenStart(event.target.value)}
              data-testid="day-start-input"
              className="w-[6.5rem] min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-[#11183d]"
            />
          </label>
        )}
      </div>

      {/*
        What the day adds up to, geographically.

        「讓他們能一目瞭然的知道自己選的各項行程是否在同一個區塊」 — the colours on
        each card say where one stop is; this says what they come to together.
      */}
      {spread && spread.areas.length > 0 && (
        <p
          data-testid="day-area-spread"
          className={`mt-2 flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold leading-5 ${
            daySpansTooManyAreas(spread) ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
          }`}
        >
          {daySpansTooManyAreas(spread) && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
          <span>
            今天在 {spread.areas.map(area => area.label).join('、')}
            {spread.areas.length > 1 && ` ${spread.areas.length} 個區`}
            {spread.longestHopKm !== undefined && spread.longestHopKm >= 1 && `・最遠兩點約 ${spread.longestHopKm} 公里`}
          </span>
        </p>
      )}

      {slots.length === 0 ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-500">
          今天的航班佔掉了可以安排的時間。
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {slots.map(slot => {
            const occupant = slot.occupantId ? itemById.get(slot.occupantId) : undefined;
            const area = occupant && areas ? areas.areaOfItem(occupant.id) : undefined;
            const fixed = occupant ? Boolean(isFixed?.(occupant)) : false;

            return (
              <div
                key={slot.id}
                data-testid={`day-block-${slot.index}`}
                className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2"
              >
                <span className="w-[86px] shrink-0">
                  <span className="block text-[11px] font-black text-[#11183d]">
                    {slot.startTime}–{slot.endTime}
                  </span>
                  <span className={`block text-[10px] font-bold ${slot.kind === 'meal' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {slot.label}
                  </span>
                </span>

                {occupant ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {area && (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${AREA_COLORS[area.colorIndex % AREA_COLORS.length].dot}`} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#11183d]">
                      {occupant.location || occupant.title}
                    </span>
                  </span>
                ) : (
                  <>
                  {/* 「欄位可以寫『無』」: an empty block is a stated answer, not a gap. */}
                  <span className="shrink-0 text-[11px] font-bold text-slate-300">無</span>
                  <select
                    data-testid={`fill-block-${slot.index}`}
                    aria-label={`${slot.startTime} ${slot.label}`}
                    value=""
                    onChange={event => { if (event.target.value) onFillBlock(slot, event.target.value); }}
                    className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-violet-50/40 px-2 py-1.5 text-xs font-bold text-[#5b3df5]"
                  >
                    <option value="">＋ 選一個地點</option>
                    {optionsFor(slot).map(place => (
                      <option key={place.id} value={place.id} disabled={place.alreadyPlanned}>
                        {place.areaLabel ? `${place.placeName}（${place.areaLabel}）` : place.placeName}
                        {place.alreadyPlanned ? '・已在行程中' : ''}
                      </option>
                    ))}
                  </select>
                  </>
                )}

                {/*
                  How long it runs — and everything after it moves with it.

                  Never offered on a flight or a check-in: 「航班時間是固定的行程」,
                  and a length control on one is an invitation to break the one
                  thing the day is built around.
                */}
                {occupant && onChangeDuration && !fixed && (
                  <select
                    data-testid={`block-duration-${slot.index}`}
                    aria-label={`${occupant.location || occupant.title} 停留時間`}
                    value={String(slot.durationMinutes)}
                    onChange={event => onChangeDuration(occupant.id, Number(event.target.value))}
                    className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] font-bold text-slate-600"
                  >
                    {Array.from(new Set([...DURATION_CHOICES, slot.durationMinutes]))
                      .sort((left, right) => left - right)
                      .map(minutes => (
                        <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>
                      ))}
                  </select>
                )}
                {occupant && fixed && (
                  <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-500">固定</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ranOutOfDay && (
        <p data-testid="day-ran-out" className="mt-2 flex items-start gap-1.5 text-[11px] font-bold leading-5 text-amber-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          延長之後，後面的時段排不進今天了。
        </p>
      )}

      <p className="mt-2 text-[10px] leading-4 text-slate-400">
        每格預設 {minutesLabel(BLOCK_MINUTES)}，含移動時間。改了長度，後面的時段會自動順延或提前。
      </p>
    </section>
  );
};

export default DayBlockPlanner;
