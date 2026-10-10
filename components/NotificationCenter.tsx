import React, { useState } from 'react';
import { MessageCircleQuestion, CheckCircle2, X, Lightbulb } from 'lucide-react';
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

/** When it happened, in the length a list can carry. */
const whenLabel = (at: string): string => {
  const moment = new Date(at);
  if (Number.isNaN(moment.getTime())) return '';
  const minutes = Math.round((Date.now() - moment.getTime()) / 60000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${moment.getMonth() + 1}/${moment.getDate()}`;
};

const NotificationCenter: React.FC<Props> = ({ notices, onOpen, onClose }) => {
  const [category, setCategory] = useState<NoticeCategory>('all');
  const shown = noticesInCategory(notices, category);

  return (
    <div
      role="dialog"
      aria-label="通知"
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
        className="absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] max-h-[76vh] overflow-y-auto rounded-[1.75rem] border border-slate-200/80 bg-white pb-5 shadow-[0_24px_60px_rgba(30,41,90,.22)] md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 rounded-t-[1.75rem] bg-white px-5 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[1.6rem] font-black tracking-tight text-[#11183d]">通知</h2>
            <button
              type="button"
              aria-label="關閉通知"
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
            {NOTICE_CATEGORIES.map(([key, label]) => {
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
                  {label}
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
            <p className="mt-4 text-xl font-black text-[#11183d]">目前沒有新通知</p>
            <p className="mt-2 text-sm font-medium text-slate-400">
              旅伴對帳目提出的疑問會出現在這裡
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              例如分帳確認、行程變更、或航班提醒等
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map(notice => {
              const waiting = notice.kind === 'awaiting_my_answer';
              return (
                <li key={notice.id}>
                  <button
                    type="button"
                    data-testid={`notification-${notice.disputeId}`}
                    onClick={() => onOpen(notice)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left active:bg-slate-50"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        waiting ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {waiting ? <MessageCircleQuestion size={16} /> : <CheckCircle2 size={16} />}
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
                        「{notice.message}」
                      </span>
                      <span className="mt-1 block text-[10px] font-bold text-slate-400">
                        {whenLabel(notice.at)}
                        {whenLabel(notice.at) && ' · '}
                        {waiting ? '點一下回覆' : '點一下查看'}
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
            <span className="block text-sm font-black text-[#11183d]">小提醒</span>
            <span className="mt-0.5 block text-xs font-medium leading-5 text-slate-500">
              當有人新增支出、提出分帳疑問、航班異動或行程變更時，我們會立即通知你！
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
