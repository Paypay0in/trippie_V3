import React, { useState } from 'react';
import { Copy, Layers } from 'lucide-react';
import { DuplicatePair, describeDuplicate } from '../services/duplicateReceipts';

/**
 * 「我覺得你可以跳出提示頁面 說這幾筆可能是一樣的」.
 *
 * A shop gives you a till receipt and the card terminal gives you a slip, and
 * both end up in the same batch — two bills for one purchase, inflating the
 * trip's total and, on a shared ledger, what somebody else owes.
 *
 * Shown rather than applied quietly. Merging is ticked by default, because the
 * traveller photographing a pocketful of paper really does have duplicates in
 * it; but ten receipts silently becoming eight, with nothing said, is its own
 * kind of wrong.
 */

interface Props {
  pairs: DuplicatePair[];
  /** The indexes the reader chose to merge. */
  onResolve: (mergeIndexes: number[]) => void;
}

const money = (amount: number, currency: string) =>
  `${Math.round(amount).toLocaleString()} ${currency}`;

const DuplicateReceiptPrompt: React.FC<Props> = ({ pairs, onResolve }) => {
  // Everything on: this is the case it was built for. Taking one off is a tap.
  const [merging, setMerging] = useState<number[]>(() => pairs.map((_, index) => index));

  const toggle = (index: number) =>
    setMerging(current =>
      current.includes(index) ? current.filter(at => at !== index) : [...current, index]);

  return (
    <div
      role="dialog"
      aria-label="可能重複的收據"
      data-testid="duplicate-receipt-prompt"
      className="fixed inset-0 z-[95] flex flex-col justify-end bg-black/45"
    >
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white pb-8 md:mx-auto md:max-w-2xl">
        <div className="px-5 pb-3 pt-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Copy size={18} />
          </span>
          <h2 className="mt-3 text-lg font-black text-[#11183d]">
            有 {pairs.length} 組可能是同一筆
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            店家票據和信用卡簽單常是同一筆消費的兩張紙。勾起來的會合併成一筆，照片都會留著。
          </p>
        </div>

        <ul className="divide-y divide-slate-100">
          {pairs.map((pair, index) => {
            const chosen = merging.includes(index);
            return (
              <li key={`${pair.keep.id}-${pair.drop.id}`} className="px-5 py-4">
                <button
                  type="button"
                  data-testid={`duplicate-pair-${index}`}
                  aria-pressed={chosen}
                  onClick={() => toggle(index)}
                  className={`w-full rounded-2xl border p-3 text-left ${
                    chosen ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-500">
                      {describeDuplicate(pair)}
                    </span>
                    <span className={`text-[11px] font-black ${chosen ? 'text-violet-700' : 'text-slate-400'}`}>
                      {chosen ? '合併為一筆' : '兩筆都保留'}
                    </span>
                  </span>

                  <span className="mt-2 block rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-black text-[#11183d]">
                        {pair.keep.description}
                      </span>
                      <span className="shrink-0 text-xs font-black text-[#11183d]">
                        {money(pair.keep.amount, pair.keep.currency)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
                      {pair.keep.date} · {pair.againstExisting ? '帳本裡已經有這筆' : '保留這張'}
                    </span>
                  </span>

                  <span className="mt-1.5 block rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-slate-500">
                        {pair.drop.description}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {money(pair.drop.amount, pair.drop.currency)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
                      {pair.drop.date} · {chosen ? '併進上面那筆' : '另外記一筆'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-5 pt-2">
          <button
            type="button"
            data-testid="confirm-duplicates"
            onClick={() => onResolve(merging)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-sm font-black text-white"
          >
            <Layers size={16} />
            {merging.length > 0 ? `合併 ${merging.length} 組並匯入` : '全部分開記，直接匯入'}
          </button>
          {/*
            No cancel. The receipts are read either way; the only question this
            screen asks is how many bills they become, and closing it without
            answering would leave the import half done.
          */}
          <button
            type="button"
            data-testid="keep-all-separate"
            onClick={() => onResolve([])}
            className="mt-2 w-full py-2 text-xs font-bold text-slate-400"
          >
            都不是重複的，全部分開記
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateReceiptPrompt;
