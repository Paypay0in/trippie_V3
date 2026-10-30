import React, { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
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
  /** Why the search did not happen; see `ActivityPlansResult`. */
  ungroundedReason?: 'quota' | 'error';
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

const budgetLine = (plan: ActivityPlanProposal, t: TFunction): string => {
  // A remembered price and a looked-up one are indistinguishable once rendered,
  // and the traveller budgets against whichever appears. So: the plan's own
  // budget only when research verified it, then the venue's price band from the
  // map service, and only then an admission that we do not know.
  if (plan.budgetConfidence === 'verified' && plan.budget) {
    const { min, max, currency } = plan.budget;
    return t('activityPlan.budgetPerPerson', {
      currency,
      min: min.toLocaleString(),
      max: max.toLocaleString(),
    });
  }
  const venue = plan.venuePrice;
  if (venue?.currency && (venue.start || venue.end)) {
    if (venue.start && venue.end) {
      return `${venue.currency} ${venue.start.toLocaleString()}–${venue.end.toLocaleString()}`;
    }
    const amount = (venue.start || venue.end)!.toLocaleString();
    return t(venue.start ? 'activityPlan.budgetFrom' : 'activityPlan.budgetUnder', {
      currency: venue.currency,
      amount,
    });
  }
  return t('activityPlan.budgetUnknown');
};

/** Says what the figure covers, so a venue band is never read as a plan total. */
const budgetNote = (plan: ActivityPlanProposal, t: TFunction): string => {
  if (plan.budgetConfidence === 'verified' && plan.budget) return t('activityPlan.budgetNoteWholePlan');
  if (plan.venuePrice?.currency && (plan.venuePrice.start || plan.venuePrice.end)) {
    return t('activityPlan.budgetNoteVenue', {
      venue: plan.venuePrice.venueName || t('activityPlan.budgetNoteVenueFallback'),
    });
  }
  return '';
};

const ActivityPlanCards: React.FC<Props> = ({
  intro,
  options,
  grounded,
  ungroundedReason,
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
  const { t } = useTranslation();
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
          <ChevronLeft size={14} />{t('activityPlan.backToComparison')}
        </button>

        <div className="text-sm font-black text-[#11183d]">{openPlan.title}</div>
        <p className="mt-1 text-xs leading-5 text-slate-600">{openPlan.whyItFits}</p>

        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-black text-[#11183d]">{t('activityPlan.schedule')}</div>
          {openPlan.items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex gap-2 text-[11px] text-slate-600">
              <span className="w-20 shrink-0 font-bold text-slate-400">
                {t('activityPlan.dayTime', { day: item.dayOffset + 1, time: item.time })}
              </span>
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
            <div className="text-[11px] font-black text-[#11183d]">{t('activityPlan.preparationTitle')}</div>
            {tooLateForDepartureTasks && (
              /* Said once, about the plan, before the list — by the time
                 someone reads down to the item itself they have already
                 started picturing the day. */
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
                {t('activityPlan.tooLateForDeparture')}
              </p>
            )}
            <div className="mt-2 space-y-2">
              {openPlan.preparation.map(task => (
                <div key={task.name} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[11px] text-slate-700">
                    □ {task.name}
                    {task.beforeDeparture && (
                      <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-black text-slate-600">{t('activityPlan.beforeDeparture')}</span>
                    )}
                    {/*
                      「有些觀光列車是提前一個月要預約的」.

                      A different kind of task from the rest of the list.
                      「before you leave」 is still weeks away; 「a month before
                      you leave」 may already be today, and a checkbox cannot
                      say that.
                    */}
                    {typeof task.leadTimeDays === 'number' && (
                      <span className="ml-1 rounded bg-[#f0edff] px-1 py-0.5 text-[9px] font-black text-[#5b3df5]">
                        {t('activityPlan.leadTimeDays', { count: task.leadTimeDays })}
                      </span>
                    )}
                  </span>
                  {task.canBeHumanAssisted && onRequestHelp && (
                    <button
                      type="button"
                      onClick={() => onRequestHelp(task.name)}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 text-[10px] font-black text-blue-700"
                    >
                      <Handshake size={11} />{t('activityPlan.addToHelpTasks')}
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
                {t('activityPlan.addAllToTodo')}
              </button>
            )}
          </div>
        )}

        {onRevise && (
          /* The gap between "almost" and "no". Without this the only answers
             to a plan that is nearly right are to take it whole or throw it
             away and ask again, losing the parts that were fine. */
          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="text-[11px] font-black text-[#11183d]">{t('activityPlan.reviseTitle')}</div>
            <textarea
              value={revisionNote}
              onChange={event => setRevisionNote(event.target.value)}
              rows={2}
              placeholder={t('activityPlan.revisePlaceholder')}
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
                <Sparkles size={12} />{isRevising ? t('activityPlan.revising') : t('activityPlan.reviseCta')}
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
                  {t('activityPlan.restoreOriginal')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="text-[11px] font-black text-[#11183d]">{t('activityPlan.whichDay')}</label>
            {days.length > 0 && (
              <span className="text-[10px] font-bold text-slate-400">
                {t('activityPlan.tripRange', { start: days[0].date, end: days[days.length - 1].date })}
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
                    {t('activityPlan.dayOption', { day: index + 1, date: day.date })}
                    {day.hasPinned
                      ? t('activityPlan.dayHasPinned')
                      : day.isFree
                        ? t('activityPlan.dayFree')
                        : t('activityPlan.dayHasItems', { count: day.itemCount })}
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
            <p className="mt-1 text-[10px] text-slate-400">{t('activityPlan.noTripDatesYet')}</p>
          )}
          {days.length > 0 && openPlan.durationDays > 1 && (
            <p className="mt-1 text-[10px] text-slate-400">
              {t('activityPlan.spansDays', { count: openPlan.durationDays })}
            </p>
          )}
        </div>

        {conflicts.length > 0 && (
          /* Named, never resolved quietly. 📌 means the AI may not move it, so
             what gives is the traveller's call, not ours. */
          <div className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-4 text-amber-800">
              {t('activityPlan.pinnedConflict', {
                dates: conflicts.join(t('common.listSeparator')),
                count: openPlan.durationDays,
              })}
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
          {t('activityPlan.addToItinerary')}<ArrowRight size={16} />
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
              <Tag>{t('activityPlan.durationDays', { count: plan.durationDays })}</Tag>
              {plan.logistics.burden && <Tag>{BURDEN_LABELS[plan.logistics.burden]}</Tag>}
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-600">{plan.whyItFits}</p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Clock size={12} className="shrink-0 text-slate-400" />
                {/* Measured by the routing service, or absent. Never estimated. */}
                <span className="min-w-0 truncate">{travelTimeLabel(plan.logistics.travelMinutesEachWay) || t('activityPlan.travelTimeUnknown')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <CalendarDays size={12} className="shrink-0 text-slate-400" />
                <span className="min-w-0 truncate">{budgetLine(plan, t)}</span>
              </div>
            </div>

            {budgetNote(plan, t) && (
              <div className="mt-1 text-[10px] text-slate-400">{budgetNote(plan, t)}</div>
            )}

            {plan.tradeoff && (
              <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-600">{t('activityPlan.tradeoff', { text: plan.tradeoff })}</p>
            )}

            {/*
              Said for multi-day plans too. A 6-day plan printing 「單程約 29
              小時 21 分」 used to carry no warning at all, because the check
              let every plan longer than a day through before it looked at the
              measured figure.
            */}
            {unrealistic && (
              <p data-testid="plan-travel-warning" className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                {plan.durationDays > 1
                  ? t('activityPlan.travelWarningMultiDay')
                  : t('activityPlan.travelWarningDayTrip')}
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
                {t('activityPlan.viewPlan')}<ArrowRight size={14} />
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(plan)}
                  className="min-h-11 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-500"
                >
                  {t('activityPlan.dismiss')}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/*
        Said with its reason. 「為什麼連不上搜尋」 was asked of a banner that
        could only say it had happened — and a day's allowance running out is
        worth retrying tomorrow, while a failure is worth retrying now.
      */}
      {!grounded && (
        <p data-testid="plan-ungrounded" className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-700">
          {ungroundedReason === 'quota'
            ? t('activityPlan.ungroundedQuota')
            : t('activityPlan.ungroundedError')}
        </p>
      )}

      {sources.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400">{t('activityPlan.sources')}</div>
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
