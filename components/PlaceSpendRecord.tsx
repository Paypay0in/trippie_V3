import React, { useMemo, useState } from 'react';
import { CircleDollarSign, NotebookPen } from 'lucide-react';
import { SpendAtPlace } from '../services/spendAtPlace';
import { currencySymbol } from '../services/currencySymbols';

/**
 * 當天消費紀錄 — what was actually ordered here, and what it came to.
 *
 * 「照片與當初記帳的備註，還有實際的結帳細目！」 and then 「我預期點擊下去應該是這
 * 樣 請100%還原」. The ledger already holds all of it: the lines read off the
 * receipt, the money the till charged, and the rate that day.
 *
 * Both monies on every line, because the receipt is in one and the traveller
 * thinks in the other, and converting in your head at ¥1 = NT$0.22 while
 * standing in a restaurant is not a thing anybody does.
 *
 * The rate is printed under the total rather than used silently. It is the
 * rate recorded for that day — see `Expense.exchangeRate` — so two bills a
 * week apart are allowed to disagree, and the reader can see why.
 *
 * One day at a time, chosen, when there is more than one. Summing two visits
 * into a single 合計 would answer a question nobody asked: 「上次在這裡花了多
 * 少」 is about a visit.
 */

interface Props {
  spend: SpendAtPlace[];
}

const NO_LINES = '這筆沒有留下結帳細目。';

/** 2026-10-20 → 2026/10/20 */
const readableDate = (date: string): string => date.replace(/-/g, '/');

const twd = (value: number): string => `NT$ ${Math.round(value).toLocaleString()}`;

const PlaceSpendRecord: React.FC<Props> = ({ spend }) => {
  const dates = useMemo(
    () => Array.from(new Set(spend.map(entry => entry.date))),
    [spend],
  );
  const [day, setDay] = useState(dates[0] ?? '');
  const chosen = dates.includes(day) ? day : dates[0];
  const bills = spend.filter(entry => entry.date === chosen);

  if (spend.length === 0) return null;

  /*
    The totals are the bills' own amounts added up, never the printed lines'.
    A receipt's lines routinely miss service, tax and the discount at the
    bottom, so a 合計 derived from them would disagree with what was paid.
  */
  const totalTwd = bills.reduce((sum, entry) => sum + (Number.isFinite(entry.twdAmount) ? entry.twdAmount : 0), 0);
  const currencies = new Set(bills.map(entry => entry.currency).filter(Boolean));
  const currency = currencies.size === 1 ? [...currencies][0] : undefined;
  const totalOriginal = currency
    ? bills.reduce((sum, entry) => sum + (entry.amountOriginal ?? 0), 0)
    : 0;
  const rate = bills.find(entry => entry.exchangeRate)?.exchangeRate;
  const symbol = currency ? currencySymbol(currency) : '';

  const inOriginal = (value: number): string => `${symbol}${Math.round(value).toLocaleString()}`;

  return (
    <div data-testid="place-spend-record" className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-black text-[#11183d]">
          <CircleDollarSign size={15} className="text-[#5b3df5]" />當天消費紀錄
        </span>
        {dates.length > 1 ? (
          <select
            value={chosen}
            onChange={event => setDay(event.target.value)}
            data-testid="place-spend-day"
            className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-[#11183d]"
          >
            {dates.map(date => (
              <option key={date} value={date}>{readableDate(date)}</option>
            ))}
          </select>
        ) : (
          <span className="rounded-xl border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-600">
            {readableDate(chosen)}
          </span>
        )}
      </div>

      <div className="mt-2 overflow-hidden rounded-2xl border border-slate-100">
        {bills.map(bill => (
          <div key={bill.expenseId} data-testid={`place-spend-bill-${bill.expenseId}`}>
            {/*
              Only shown when there is more than one bill that day: a single
              receipt's shop name is already the title of the card above.
            */}
            {bills.length > 1 && (
              <p className="bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-500">
                {bill.merchant || bill.description}
              </p>
            )}

            {bill.items?.length ? bill.items.map((line, position) => (
              <div
                key={`${bill.expenseId}-${position}`}
                className="flex items-start gap-2.5 border-b border-slate-100 px-3 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#11183d]">
                    {line.translatedName || line.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {line.quantity && line.quantity > 0 ? `${line.quantity} 份` : '1 份'}
                  </span>
                </span>
                {typeof line.amount === 'number' && (
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black text-[#11183d]">{inOriginal(line.amount)}</span>
                    {rate && (
                      <span className="mt-0.5 block text-[11px] text-slate-400">約 {twd(line.amount * rate)}</span>
                    )}
                  </span>
                )}
              </div>
            )) : (
              <p className="px-3 py-2.5 text-[11px] text-slate-400">{NO_LINES}</p>
            )}

            {/*
              The line the traveller wrote on this bill, kept with it.

              「點擊下去沒有看到我在記帳的帳目中寫的備註」 — and a block that only
              appears when there is something in it cannot be told apart from
              one that lost what it held. Said either way, under its own
              heading, so 「我沒寫」 and 「寫了但沒出現」 look different.
            */}
            <div
              data-testid={`place-spend-note-${bill.expenseId}`}
              className="border-t border-slate-100 bg-emerald-50/50 px-3 py-2"
            >
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700">
                <NotebookPen size={10} />記帳時寫的備註
              </span>
              {bill.note
                ? <p className="mt-1 text-[11px] leading-5 text-emerald-900">{bill.note}</p>
                : <p className="mt-1 text-[11px] leading-5 text-slate-400">這筆記帳沒有寫備註。</p>}
            </div>

            {bill.photos?.length ? (
              <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2">
                {bill.photos.map((photo, position) => (
                  <img
                    key={`${bill.expenseId}-photo-${position}`}
                    src={photo}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}

        <div className="flex items-end justify-between gap-2 bg-slate-50 px-3 py-2.5">
          <span>
            <span className="block text-sm font-black text-[#11183d]">合計</span>
            {rate && currency && (
              <span data-testid="place-spend-rate" className="mt-0.5 block text-[10px] text-slate-400">
                當日匯率 {symbol}1 = NT$ {Number(rate.toFixed(4))}
              </span>
            )}
          </span>
          <span className="shrink-0 text-right">
            {currency && totalOriginal > 0 && (
              <span className="block text-base font-black text-[#11183d]">{inOriginal(totalOriginal)}</span>
            )}
            <span className="mt-0.5 block text-sm font-black text-[#5b3df5]">
              {currency && totalOriginal > 0 ? '約 ' : ''}{twd(totalTwd)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default PlaceSpendRecord;
