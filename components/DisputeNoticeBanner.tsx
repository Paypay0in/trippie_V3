import React from 'react';
import { MessageCircleQuestion, CheckCircle2, X } from 'lucide-react';
import { DisputeNotice, describeNotice } from '../services/disputeInbox';

/**
 * 「我提出疑問後，希望對方要收到疑問的通知📢」.
 *
 * At the top of the ledger, where the person being asked already goes. A
 * question about money is work waiting on somebody, so it sits above the list
 * rather than inside one row of it — the badge on the row was the thing nobody
 * saw.
 *
 * Tapping opens the expense it concerns. A notice that cannot be acted on from
 * where it is shown just moves the search somewhere else.
 */

interface Props {
  notices: DisputeNotice[];
  onOpen: (notice: DisputeNotice) => void;
  onDismiss: (notice: DisputeNotice) => void;
}

const DisputeNoticeBanner: React.FC<Props> = ({ notices, onOpen, onDismiss }) => {
  if (notices.length === 0) return null;

  return (
    <div data-testid="dispute-notices" className="mb-3 space-y-1.5">
      {notices.map(notice => {
        const waiting = notice.kind === 'awaiting_my_answer';
        return (
          <div
            key={notice.id}
            data-testid={`dispute-notice-${notice.disputeId}`}
            className={`flex items-start gap-2 rounded-2xl px-3 py-2.5 ring-1 ${
              waiting ? 'bg-amber-50 ring-amber-100' : 'bg-emerald-50 ring-emerald-100'
            }`}
          >
            <span className={`mt-0.5 shrink-0 ${waiting ? 'text-amber-600' : 'text-emerald-600'}`}>
              {waiting ? <MessageCircleQuestion size={15} /> : <CheckCircle2 size={15} />}
            </span>
            <button
              type="button"
              onClick={() => onOpen(notice)}
              data-testid={`open-dispute-${notice.disputeId}`}
              className="min-w-0 flex-1 text-left"
            >
              <span className={`block text-[11px] font-black ${waiting ? 'text-amber-900' : 'text-emerald-900'}`}>
                {describeNotice(notice)}
              </span>
              {/*
                The question itself, not only that there is one. 「Gina 問了一個
                問題」 sends somebody hunting; 「這筆我沒有喝到」 can often be
                answered on the spot.
              */}
              <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-600">
                「{notice.message}」
              </span>
              <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
                {waiting ? '點一下回覆' : '點一下查看'}
              </span>
            </button>
            <button
              type="button"
              aria-label="知道了"
              data-testid={`dismiss-dispute-${notice.disputeId}`}
              onClick={() => onDismiss(notice)}
              className="shrink-0 rounded-lg p-1 text-slate-400"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default DisputeNoticeBanner;
