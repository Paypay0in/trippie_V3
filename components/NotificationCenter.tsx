import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MessageCircleQuestion, CheckCircle2, Receipt, X, Lightbulb } from 'lucide-react';
import { DisputeNotice, describeNotice } from '../services/disputeInbox';
import {
  NOTICE_CATEGORIES,
  NoticeCategory,
  noticesInCategory,
} from '../services/noticeCategories';
import NotificationBellArt from './NotificationBellArt';

/**
 * 「以後有任何通知都顯示訊息在這」.
 *
 * The bell on the header was decoration — no handler, nothing behind it.
 * Meanwhile the one real notification the app produces, a question about a
 * shared bill, appeared only as a banner inside the ledger of one open trip, so
 * the person being asked had to already be where the answer lives.
 *
 * One list, opened from one place, whatever the notice is about. Everything
 * here is addressed to the reader and still unread; dealing with a notice is
 * what removes it, so the list is work rather than a log.
 */

export interface Props {
  notices: DisputeNotice[];
  onOpen: (notice: DisputeNotice) => void;
  onClose: () => void;
}

/**
 * The shelf names, as keys resolved at render.
 *
 * `NOTICE_CATEGORIES` carries its label in the tuple, built once at import —
 * a `t()` there would freeze the shelf names to whichever language loaded
 * first. The key is what travels; the sentence is fetched in the language the
 * reader is in now. 全部 is the one the rest of the app already says.
 */
const FILTER_KEYS: Record<NoticeCategory, string> = {
  all: 'common.all',
  itinerary: 'notifications.filters.itinerary',
  settlement: 'notifications.filters.settlement',
  travel: 'notifications.filters.travel',
  system: 'notifications.filters.system',
};

/** When it happened, in the length a list can carry. */
const whenLabel = (at: string, t: TFunction): string => {
  const moment = new Date(at);
  if (Number.isNaN(moment.getTime())) return '';
  const minutes = Math.round((Date.now() - moment.getTime()) / 60000);
  if (minutes < 1) return t('notifications.justNow');
  if (minutes < 60) return t('notifications.minutesAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', { n: hours });
  return `${moment.getMonth() + 1}/${moment.getDate()}`;
};

const NotificationCenter: React.FC<Props> = ({ notices, onOpen, onClose }) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<NoticeCategory>('all');
  const shown = noticesInCategory(notices, category);

  return (
    <div
      role="dialog"
      aria-label={t('notifications.title')}
      data-testid="notification-center"
      className="fixed inset-0 z-[80] bg-black/40"
      onClick={onClose}
    >
      {/*
        Hung under the bell, not raised from the floor.

        「上移到鈴鐺🔔點擊後就產生 不要在頁腳」. A sheet from the bottom is the shape
        of something that belongs to the whole screen; this belongs to the
        control that opened it, and should look like it came from there. Inset
        from both edges — 「邊框要稍微內縮」 — so the page it floats over stays
        visible around it, which is the other half of saying where it came from.

        The top offset clears the header the bell sits in, safe area included,
        so it opens below the bell on a phone with an island and on one without.
      */}
      <div
        /*
          `overflow-x-hidden` is load-bearing, not tidying.

          「這個通知我覺得邊框有一點被切掉 要調整」. The panel declared only
          `overflow-y-auto`, and CSS computes a `visible` axis to `auto` when
          the other one is not visible — so this became a horizontal scroll
          container nobody asked for. A scroll container clips to its padding
          box with square corners, so the filter row that deliberately bleeds
          to the edge (`-mx-5 … px-5`, the affordance that says it can be
          swiped) was being cut across the rounded corner and over the border.

          Hidden on that axis clips to the border radius instead, so the last
          chip disappears around the curve the way the card's own edge does.
          The row keeps its own `overflow-x-auto` and still scrolls.
        */
        className="absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] max-h-[76vh] overflow-y-auto overflow-x-hidden rounded-[1.75rem] border border-slate-200/80 bg-white pb-5 shadow-[0_24px_60px_rgba(30,41,90,.22)] md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 rounded-t-[1.75rem] bg-white px-5 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[1.6rem] font-black tracking-tight text-[#11183d]">{t('notifications.title')}</h2>
            <button
              type="button"
              aria-label={t('notifications.closeAria')}
              data-testid="close-notifications"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400"
            >
              <X size={22} />
            </button>
          </div>

          {/*
            The shelves. Kept visible when empty — a filter that appears only
            once it has contents cannot answer 「is there anything here?」.
          */}
          <div
            data-testid="notification-filters"
            className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1"
          >
            {NOTICE_CATEGORIES.map(([key]) => {
              const active = key === category;
              const count = noticesInCategory(notices, key).length;
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`notification-filter-${key}`}
                  aria-pressed={active}
                  onClick={() => setCategory(key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                    active
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {t(FILTER_KEYS[key])}
                  {count > 0 && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-violet-600' : 'bg-rose-500'}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {shown.length === 0 ? (
          /*
            An empty list says so. A sheet that opens onto nothing reads as a
            screen that failed to load.
          */
          <div
            data-testid="notifications-empty"
            className="flex flex-col items-center justify-center px-6 pb-2 pt-6 text-center"
          >
            <NotificationBellArt />
            <p className="mt-4 text-xl font-black text-[#11183d]">{t('notifications.emptyTitle')}</p>
            <p className="mt-2 text-sm font-medium text-slate-400">
              {t('notifications.emptyBlurb')}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              {t('notifications.emptyExamples')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map(notice => {
              const waiting = notice.kind === 'awaiting_my_answer';
              // 「若有分帳指給我 要跳通知」 — a bill, not a question, so it is
              // neither the amber 「somebody is waiting on you」 nor the green
              // 「settled」. See `describeNotice`.
              const split = notice.kind === 'split_to_me';
              return (
                <li key={notice.id}>
                  <button
                    type="button"
                    // Keyed on the notice, not the dispute: a split notice is
                    // about the bill itself and carries no dispute id.
                    data-testid={`notification-${notice.disputeId || notice.expenseId}`}
                    onClick={() => onOpen(notice)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left active:bg-slate-50"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        waiting ? 'bg-amber-50 text-amber-600'
                          : split ? 'bg-violet-50 text-violet-600'
                            : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {waiting ? <MessageCircleQuestion size={16} />
                        : split ? <Receipt size={16} />
                          : <CheckCircle2 size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-[#11183d]">
                        {describeNotice(notice)}
                      </span>
                      {/*
                        The question itself, not only that there is one — often
                        it can be answered without opening anything.
                      */}
                      <span className="mt-0.5 block truncate text-xs font-medium text-slate-600">
                        {t('notifications.quoted', { message: notice.message })}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold text-slate-400">
                        {whenLabel(notice.at, t)}
                        {whenLabel(notice.at, t) && ' · '}
                        {waiting ? t('notifications.tapToReply') : t('notifications.tapToView')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/*
          What the bell is for, said once at the bottom.

          Someone opening an empty list is entitled to know whether it is empty
          because nothing happened or because nothing is wired up.
        */}
        <div
          data-testid="notifications-tip"
          className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-violet-50/70 px-4 py-3.5"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-violet-600">
            <Lightbulb size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-[#11183d]">{t('notifications.tipTitle')}</span>
            <span className="mt-0.5 block text-xs font-medium leading-5 text-slate-500">
              {t('notifications.tipBody')}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
