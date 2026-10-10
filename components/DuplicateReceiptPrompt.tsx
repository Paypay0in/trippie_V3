import React, { useState } from 'react';
import { ChevronDown, Copy, Layers } from 'lucide-react';
import { DuplicatePair, describeDuplicate } from '../services/duplicateReceipts';
import { Expense } from '../types';

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
  /**
   * Where the question is being asked from.
   *
   * 「如果你有疑問的 你把帳圈起來然後要詢問用戶是否合併」 — the same question now
   * gets asked of a ledger that was filled in before any of this existed, where
   * nothing is being imported and saying 「並匯入」 would describe something that
   * is not about to happen.
   */
  context?: 'import' | 'ledger';
}

const money = (amount: number, currency: string) =>
  `${Math.round(amount).toLocaleString()} ${currency}`;

const DuplicateReceiptPrompt: React.FC<Props> = ({ pairs, onResolve, context = 'import' }) => {
  /*
    Ticked for an import, clear for a ledger sweep.

    A pocketful of receipts photographed together really does hold duplicates,
    and the default earns its place. A ledger of 14 matched pairs does not: KRW
    prices are round, so 2,000 buys a coffee and 2,000 buys stomach medicine on
    the same afternoon. 「合併 14 組」 ticked by default puts one tap between the
    traveller and fourteen real records folded into seven.
  */
  const [merging, setMerging] = useState<number[]>(() =>
    context === 'ledger' ? [] : pairs.map((_, index) => index));
  /** Which single row is open: two panels at once is a screen nobody reads. */
  const [opened, setOpened] = useState<string | null>(null);

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
            {context === 'ledger'
              ? '這些是帳本裡金額與日期相同的紀錄，在這個檢查存在之前就記進來了。勾起來的會合併成一筆，照片都會留著。'
              : '店家票據和信用卡簽單常是同一筆消費的兩張紙。勾起來的會合併成一筆，照片都會留著。'}
          </p>
        </div>

        <ul className="divide-y divide-slate-100">
          {pairs.map((pair, index) => {
            const chosen = merging.includes(index);
            /*
              A row you can open.

              「這些可能是同一筆的 要點擊可以觀看」 — two lines reading 口紅 and
              身體乳 for the same 18,000 KRW is exactly the case this screen
              exists to catch, and deciding it needs what is behind each: the
              shop, the products, the photograph. Sending the reader off to the
              ledger to look would abandon the other four decisions.
            */
            const detail = (expense: Expense, side: 'keep' | 'drop') => {
              const key = `${index}:${side}`;
              const open = opened === key;
              const survivor = side === 'keep';
              return (
                <div className={`${survivor ? 'mt-2' : 'mt-1.5'} rounded-xl bg-white ring-1 ring-slate-100`}>
                  <button
                    type="button"
                    data-testid={`duplicate-${side}-${index}`}
                    aria-expanded={open}
                    onClick={() => setOpened(open ? null : key)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`min-w-0 truncate text-sm ${survivor ? 'font-black text-[#11183d]' : 'font-bold text-slate-500'}`}>
                          {expense.description}
                        </span>
                        <span className={`shrink-0 text-xs ${survivor ? 'font-black text-[#11183d]' : 'font-bold text-slate-500'}`}>
                          {money(expense.amount, expense.currency)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
                        {expense.date} · {survivor
                          ? (pair.againstExisting ? '帳本裡已經有這筆' : '保留這張')
                          : (chosen ? '併進上面那筆' : '另外記一筆')}
                      </span>
                    </span>
                    <ChevronDown
                      size={14}
                      className={`mt-0.5 shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {open && (
                    <div data-testid={`duplicate-detail-${side}-${index}`} className="border-t border-slate-100 px-3 py-2.5">
                      {expense.merchant && (
                        <p className="text-[11px] font-black text-[#11183d]">{expense.merchant}</p>
                      )}
                      {expense.merchantAddress && (
                        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{expense.merchantAddress}</p>
                      )}
                      {/*
                        The products are what tell 口紅 and 身體乳 apart. Without
                        them the two rows differ only by a name somebody has to
                        trust.
                      */}
                      {expense.receiptItems?.length ? (
                        <ul className="mt-2 space-y-1">
                          {expense.receiptItems.map((item, at) => (
                            <li key={`${at}-${item.name}`} className="flex items-start justify-between gap-2 text-[11px]">
                              <span className="min-w-0 flex-1 truncate text-slate-600">
                                {item.translatedName || item.name}
                              </span>
                              {Number.isFinite(item.amount as number) && (
                                <span className="shrink-0 font-mono text-slate-400">
                                  {Math.round(item.amount as number).toLocaleString()}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-[10px] text-slate-400">這張沒有讀到商品明細</p>
                      )}
                      {expense.receiptPhotos?.length ? (
                        <img
                          src={expense.receiptPhotos[0]}
                          alt=""
                          className="mt-2 h-28 w-full rounded-lg object-cover"
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <li key={`${pair.keep.id}-${pair.drop.id}`} className="px-5 py-4">
                <div
                  className={`rounded-2xl border p-3 ${
                    chosen ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-slate-500">
                      {describeDuplicate(pair)}
                    </span>
                    {/*
                      The decision is its own control now. The card used to be
                      one big button, which left no way to open a row without
                      also changing the answer.
                    */}
                    <button
                      type="button"
                      data-testid={`duplicate-pair-${index}`}
                      aria-pressed={chosen}
                      onClick={() => toggle(index)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                        chosen ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {chosen ? '合併為一筆' : '兩筆都保留'}
                    </button>
                  </div>

                  {detail(pair.keep, 'keep')}
                  {detail(pair.drop, 'drop')}
                </div>
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
            {merging.length > 0
              ? `合併 ${merging.length} 組`
              : context === 'ledger'
                ? '都不是同一筆，維持原狀'
                : '全部分開記，直接匯入'}
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
