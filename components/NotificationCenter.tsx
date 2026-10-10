import React from 'react';
import { MessageCircleQuestion, CheckCircle2, X, BellOff } from 'lucide-react';
import { DisputeNotice, describeNotice } from '../services/disputeInbox';

/**
 * 「以後有任何通知都顯示訊息在這」.
 *
 * The bell on the community header was decoration — no handler, nothing behind
 * it. Meanwhile the one real notification the app produces, a question about a
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

const NotificationCenter: React.FC<Props> = ({ notices, onOpen, onClose }) => (
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
      of something that belongs to the whole screen; this belongs to the control
      that opened it, and should look like it came from there. Inset from both
      edges — 「邊框要稍微內縮」 — so the page it floats over stays visible around
      it, which is the other half of saying where it came from.

      The top offset clears the header the bell sits in, safe area included, so
      it opens below the bell on a phone with an island and on one without.
    */}
    <div
      className="absolute left-3 right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] max-h-[70vh] overflow-y-auto rounded-[1.75rem] border border-slate-200/80 bg-white pb-6 shadow-[0_24px_60px_rgba(30,41,90,.22)] md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2"
      onClick={event => event.stopPropagation()}
    >
      <div className="sticky top-0 flex items-center justify-between rounded-t-[1.75rem] border-b border-slate-100 bg-white px-5 pb-3 pt-5">
        <h2 className="text-lg font-black text-[#11183d]">通知</h2>
        <button
          type="button"
          aria-label="關閉通知"
          data-testid="close-notifications"
          onClick={onClose}
          className="rounded-full p-2 text-slate-400"
        >
          <X size={18} />
        </button>
      </div>

      {notices.length === 0 ? (
        /*
          An empty list says so. A sheet that opens onto nothing reads as a
          screen that failed to load.
        */
        <div
          data-testid="notifications-empty"
          className="flex flex-col items-center justify-center px-6 py-16 text-center"
        >
          <BellOff size={28} className="text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-400">目前沒有新通知</p>
          <p className="mt-1 text-xs text-slate-400">旅伴對帳目提出的疑問會出現在這裡</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notices.map(notice => {
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
                      The question itself, not only that there is one — often it
                      can be answered without opening anything.
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
    </div>
  </div>
);

export default NotificationCenter;
