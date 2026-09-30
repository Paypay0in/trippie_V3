import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, ChevronLeft, Clock, ExternalLink, Handshake, MapPinned, Sparkles } from 'lucide-react';
import { ItineraryItem } from '../types';
import {
  ActivityPlanProposal,
  CHARACTERISTIC_LABELS,
  PlanCharacteristic,
  planToItineraryItems,
} from '../services/activityPlanProposal';
import { tripHasStarted } from '../services/planPreparationCoverage';
import { BURDEN_LABELS, dayTripIsRealistic, travelTimeLabel } from '../services/planLogistics';
import { TripDay, pinnedConflictDates } from '../services/tripFreeDays';
import { addLocalDays, localToday } from '../services/localDate';

/**
 * The screen that helps someone decide.
 *
 * Two or three plans, compared on the things a decision actually turns on:
 * how long, how far, what it costs, what the tradeoff is. Everything else —
 * the hour-by-hour shape, what needs preparing — waits until a plan is chosen,
 * because a wall of checkboxes presented before the choice is made is what
 * turned this block into a research dump.
 *
 * Nothing here is applied to the itinerary without a second, explicit press.
 * Choosing a plan opens it; the traveller picks the day, sees any clash with
 * something they pinned, and confirms.
 */

interface Props {
  intro?: string;
  options: ActivityPlanProposal[];
  grounded: boolean;
  sources: Array<{ title?: string; url?: string }>;
  /** Every day of the trip, with what is already on it. */
  days: TripDay[];
  onSelect?: (plan: ActivityPlanProposal) => void;
  onDismiss?: (plan: ActivityPlanProposal) => void;
  /** Applies the plan, after the traveller has confirmed the day. */
  onAddToItinerary: (plan: ActivityPlanProposal, items: ItineraryItem[], date: string) => void;
  /** Sends a preparation task to the human-assistance flow. */
  onRequestHelp?: (taskName: string) => void;
  /** Adds a preparation task to the pre-trip checklist. */
  onAddPreparation?: (taskNames: string[]) => void;
  /**
   * The trip's first day, compared against this device's date to tell whether
   * preparation that can only happen at home is still possible. Judged here
   * rather than on the server: the question is what day it is where the
   * traveller is standing.
   */
  tripStartDate?: string;
  /**
   * Asks for a revised version of one plan, in the traveller's own words.
   * Absent means the screen offers no revision at all.
   */
  onRevise?: (plan: ActivityPlanProposal, feedback: string) => void;
  /** True while a revision is in flight. */
  isRevising?: boolean;
  /** Puts an earlier version back on screen. */
  onRestoreOriginal?: (plan: ActivityPlanProposal) => void;
}

const generateItemId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The next few weeks, for a trip that has no dates on it yet. */
const nextDates = (count: number): string[] => {
  const today = localToday();
  return Array.from({ length: count }, (_, offset) => addLocalDays(today, offset));
};

const Tag: React.FC<{ children: React.ReactNode; tone?: 'violet' | 'slate' }> = ({ children, tone = 'slate' }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
      tone === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
    }`}
  >
    {children}
  </span>
);

const budgetLine = (plan: ActivityPlanProposal): string => {
  // A remembered price and a looked-up one are indistinguishable once rendered,
  // and the traveller budgets against whichever appears. So: the plan's own
  // budget only when research verified it, then the venue's price band from the
  // map service, and only then an admission that we do not know.
  if (plan.budgetConfidence === 'verified' && plan.budget) {
    const { min, max, currency } = plan.budget;
    return `${currency} ${min.toLocaleString()}–${max.toLocaleString()} / 人`;
  }
  const venue = plan.venuePrice;
  if (venue?.currency && (venue.start || venue.end)) {
    if (venue.start && venue.end) {
      return `${venue.currency} ${venue.start.toLocaleString()}–${venue.end.toLocaleString()}`;
    }
    return `${venue.currency} ${(venue.start || venue.end)!.toLocaleString()} ${venue.start ? '起' : '以下'}`;
  }
  return '價格需確認';
};

/** Says what the figure covers, so a venue band is never read as a plan total. */
const budgetNote = (plan: ActivityPlanProposal): string => {
  if (plan.budgetConfidence === 'verified' && plan.budget) return '整個方案的估計花費';
  if (plan.venuePrice?.currency && (plan.venuePrice.start || plan.venuePrice.end)) {
    return `${plan.venuePrice.venueName || '主要場館'}的價位，不含交通與其他花費`;
  }
  return '';
};

const ActivityPlanCards: React.FC<Props> = ({
  intro,
  options,
  grounded,
  sources,
  days,
  onSelect,
  onDismiss,
  onAddToItinerary,
  onRequestHelp,
  onAddPreparation,
  tripStartDate,
  onRevise,
  isRevising,
  onRestoreOriginal,
}) => {
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [chosenDate, setChosenDate] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [originalPlan, setOriginalPlan] = useState<ActivityPlanProposal | null>(null);
  const upcomingDates = React.useMemo(() => nextDates(30), []);

  const openPlan = options.find(plan => plan.id === openPlanId) || null;
  // Read from this device, not the server: the server's clock is in a data
  // centre, and what matters is the date where the traveller is standing.
  const tooLateForDepartureTasks = Boolean(
    openPlan?.preparation.some(task => task.beforeDeparture)
    && tripHasStarted(new Date().toLocaleDateString('sv-SE'), tripStartDate),
  );
  const conflicts = openPlan && chosenDate ? pinnedConflictDates(days, chosenDate, openPlan.durationDays) : [];

  if (options.length === 0) return null;

  if (openPlan) {
    return (
      <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4">
        <button
          type="button"
          onClick={() => {
            setOpenPlanId(null);
            setChosenDate('');
          }}
          className="mb-3 flex items-center gap-1 text-[11px] font-bold text-slate-500"
        >
          <ChevronLeft size={14} />回到方案比較
        </button>

        <div className="text-sm font-black text-[#11183d]">{openPlan.title}</div>
        <p className="mt-1 text-xs leading-5 text-slate-600">{openPlan.whyItFits}</p>

        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-black text-[#11183d]">行程安排</div>
          {openPlan.items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex gap-2 text-[11px] text-slate-600">
              <span className="w-20 shrink-0 font-bold text-slate-400">第 {item.dayOffset + 1} 天 {item.time}</span>
              <span className="min-w-0 flex-1">
                {item.title}
                {item.placeName && <span className="text-slate-400">・{item.placeName}</span>}
                {item.notes && <span className="mt-0.5 block text-[10px] text-slate-400">{item.notes}</span>}
              </span>
            </div>
          ))}
        </div>

        {openPlan.preparation.length > 0 && (
          /* Only now. Licences, insurance and rental rules shown before the
             traveller has chosen what to do are noise they scroll past. */
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <div className="text-[11px] font-black text-[#11183d]">這個方案需要準備</div>
            {tooLateForDepartureTasks && (
              /* Said once, about the plan, before the list — by the time
                 someone reads down to the item itself they have already
                 started picturing the day. */
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
                這個方案有需要出發前在國內辦好的手續，旅程已經開始了，可能來不及。
              </p>
            )}
            <div className="mt-2 space-y-2">
              {openPlan.preparation.map(task => (
                <div key={task.name} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[11px] text-slate-700">
                    □ {task.name}
                    {task.beforeDeparture && (
                      <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-black text-slate-600">出發前</span>
                    )}
                  </span>
                  {task.canBeHumanAssisted && onRequestHelp && (
                    <button
                      type="button"
                      onClick={() => onRequestHelp(task.name)}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 text-[10px] font-black text-blue-700"
                    >
                      <Handshake size={11} />加入協助任務
                    </button>
                  )}
                </div>
              ))}
            </div>
            {onAddPreparation && (
              <button
                type="button"
                onClick={() => onAddPreparation(openPlan.preparation.map(task => task.name))}
                className="mt-2 text-[11px] font-black text-violet-700"
              >
                全部加入待辦清單
              </button>
            )}
          </div>
        )}

        {onRevise && (
          /* The gap between "almost" and "no". Without this the only answers
             to a plan that is nearly right are to take it whole or throw it
             away and ask again, losing the parts that were fine. */
          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="text-[11px] font-black text-[#11183d]">想改哪裡？</div>
            <textarea
              value={revisionNote}
              onChange={event => setRevisionNote(event.target.value)}
              rows={2}
              placeholder="例如：想在城之島多留一點時間、不想開車、第一天早一點出發"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-700 outline-none focus:border-violet-300"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={!revisionNote.trim() || isRevising}
                onClick={() => {
                  const note = revisionNote.trim();
                  if (!note) return;
                  // Kept so the traveller can go back. A second version being
                  // worse than the first is ordinary, and losing the first
                  // would make asking for a change a gamble.
                  if (!originalPlan) setOriginalPlan(openPlan);
                  onRevise(openPlan, note);
                  setRevisionNote('');
                }}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-[11px] font-black text-white disabled:opacity-40"
              >
                <Sparkles size={12} />{isRevising ? '修改中…' : '請 AI 改一版'}
              </button>
              {originalPlan && onRestoreOriginal && (
                <button
                  type="button"
                  onClick={() => {
                    onRestoreOriginal(originalPlan);
                    setOriginalPlan(null);
                  }}
                  className="min-h-9 text-[11px] font-bold text-slate-500 underline underline-offset-2"
                >
                  回到原本那版
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="text-[11px] font-black text-[#11183d]">安排在哪一天</label>
            {days.length > 0 && (
              <span className="text-[10px] font-bold text-slate-400">
                這趟旅程 {days[0].date} ~ {days[days.length - 1].date}
              </span>
            )}
          </div>
          {/* Always a dropdown. Typing a date is work the app can do for the
              traveller, and a free field invites a day outside the trip. */}
          <select
            value={chosenDate}
            onChange={event => setChosenDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-violet-300"
          >
            {days.length > 0
              ? days.map((day, index) => (
                  <option key={day.date} value={day.date}>
                    第 {index + 1} 天・{day.date}
                    {day.hasPinned ? '（有固定行程）' : day.isFree ? '（空著）' : `（已有 ${day.itemCount} 項）`}
                  </option>
                ))
              : /* The trip has no dates yet, so there are no trip days to
                   offer. The next few weeks keep this a choice rather than a
                   dead control, and the note below says what is missing. */
                upcomingDates.map(date => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
          </select>
          {days.length === 0 && (
            <p className="mt-1 text-[10px] text-slate-400">這趟旅程還沒設定日期，先選一天，設定日期後可以再調整。</p>
          )}
          {days.length > 0 && openPlan.durationDays > 1 && (
            <p className="mt-1 text-[10px] text-slate-400">
              這個方案需要 {openPlan.durationDays} 天，會從選定的日期往後排。
            </p>
          )}
        </div>

        {conflicts.length > 0 && (
          /* Named, never resolved quietly. 📌 means the AI may not move it, so
             what gives is the traveller's call, not ours. */
          <div className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-4 text-amber-800">
              {conflicts.join('、')} 已有你固定住的行程。這個方案會佔掉 {openPlan.durationDays} 天，加入後兩者會在同一天，需要你自己決定取捨。
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={!chosenDate}
          onClick={() =>
            onAddToItinerary(
              openPlan,
              planToItineraryItems(openPlan, { startDate: chosenDate, generateId: generateItemId }),
              chosenDate,
            )
          }
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 text-sm font-black text-white disabled:opacity-40"
        >
          加入行程<ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {intro && <p className="text-xs leading-5 text-slate-700">{intro}</p>}

      {options.map(plan => {
        const unrealistic = !dayTripIsRealistic(plan.logistics.travelMinutesEachWay, plan.durationDays);
        return (
          <div key={plan.id} className="rounded-2xl border border-violet-100 bg-white p-4">
            <div className="text-sm font-black text-[#11183d]">{plan.title}</div>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plan.characteristics.map(characteristic => (
                <Tag key={characteristic} tone="violet">
                  {CHARACTERISTIC_LABELS[characteristic as PlanCharacteristic] || characteristic}
                </Tag>
              ))}
              <Tag>{plan.durationDays} 天</Tag>
              {plan.logistics.burden && <Tag>{BURDEN_LABELS[plan.logistics.burden]}</Tag>}
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-600">{plan.whyItFits}</p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Clock size={12} className="shrink-0 text-slate-400" />
                {/* Measured by the routing service, or absent. Never estimated. */}
                <span className="min-w-0 truncate">{travelTimeLabel(plan.logistics.travelMinutesEachWay) || '交通時間需確認'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <CalendarDays size={12} className="shrink-0 text-slate-400" />
                <span className="min-w-0 truncate">{budgetLine(plan)}</span>
              </div>
            </div>

            {budgetNote(plan) && (
              <div className="mt-1 text-[10px] text-slate-400">{budgetNote(plan)}</div>
            )}

            {plan.tradeoff && (
              <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-600">取捨：{plan.tradeoff}</p>
            )}

            {unrealistic && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                來回交通就超過六小時，當天往返會很趕。
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpenPlanId(plan.id);
                  // Pre-select the first day that could actually take it: free
                  // days first, and never one holding something pinned.
                  const fits = days.filter(day => !day.hasPinned);
                  setChosenDate((fits.find(day => day.isFree) || fits[0] || days[0])?.date || upcomingDates[0] || '');
                  onSelect?.(plan);
                }}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-black text-white"
              >
                看這個方案<ArrowRight size={14} />
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(plan)}
                  className="min-h-11 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-500"
                >
                  不考慮
                </button>
              )}
            </div>
          </div>
        );
      })}

      {!grounded && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-700">
          這次沒有連上搜尋，以下方案來自模型既有的認識，可能已經過時。是否開放、價格與是否需預約請自行再確認。
        </p>
      )}

      {sources.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400">查到的資料來源</div>
          {sources.map(source => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-9 items-center justify-between gap-2 rounded-lg bg-white px-2.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-100"
            >
              <span className="min-w-0 truncate">{source.title || source.url}</span>
              <ExternalLink size={12} className="shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityPlanCards;
