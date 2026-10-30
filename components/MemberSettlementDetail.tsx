import React from 'react';
import { useTranslation } from 'react-i18next';
import { categoryLabel, displayLocaleFrom } from '../services/categoryDisplay';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Users, X } from 'lucide-react';
import { Expense, TripMember } from '../types';
import { getCategoryIcon } from '../constants';
import { buildMemberPositions, describeExpense, settlementExpenses, settlementImbalances, unknownParticipants } from '../services/memberSettlementDetail';

/**
 * 成員結算明細 — everybody's position on one screen.
 *
 * 「除了劃紅線區塊消除，其他請 100% 依這個介面設計還原分帳明細頁面」. Two travellers
 * reading two mirror-image screens can disagree about who owes whom; one table
 * naming all of them, with the bills underneath it, cannot.
 */

interface Props {
  tripName: string;
  dateRange: string;
  coverImage?: string;
  expenses: Expense[];
  members: TripMember[];
  ownerMemberId?: string;
  currency?: string;
  onBack?: () => void;
  onClose?: () => void;
  onAddExpense?: () => void;
  onOpenExpense?: (expense: Expense) => void;
}

const money = (value: number, currency: string) =>
  `${currency === 'TWD' ? 'NT$' : currency} ${Math.round(Math.abs(value)).toLocaleString()}`;

/** A stable colour per member, so the same person reads the same everywhere. */
const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-slate-200 text-slate-700',
  'bg-orange-100 text-orange-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
];

const MemberSettlementDetail: React.FC<Props> = ({
  tripName,
  dateRange,
  coverImage,
  expenses,
  members,
  ownerMemberId,
  currency = 'TWD',
  onBack,
  onClose,
  onAddExpense,
  onOpenExpense,
}) => {
  const { t, i18n } = useTranslation();
  const displayLocale = displayLocaleFrom(i18n.language);
  const positions = React.useMemo(
    () => buildMemberPositions(expenses, members, ownerMemberId),
    [expenses, members, ownerMemberId],
  );
  /*
    Money on these bills belonging to somebody with no row in the table.

    The rows below are keyed by member, so a participant the member list does
    not hold has their share projected away — and 「everybody's net sums to
    zero」 quietly stops holding with nothing on screen to explain it. The
    imbalance notice cannot cover this: each bill's two sides add up exactly,
    and the money is lost afterwards.
  */
  const orphaned = React.useMemo(
    () => unknownParticipants(expenses, members, ownerMemberId),
    [expenses, members, ownerMemberId],
  );
  /*
    Everyone's position is computed from every bill — a bill someone paid for
    themselves nets to zero, so including it changes nothing and leaving it out
    would risk changing something. The list below is the narrower question:
    which bills put one person in debt to another.
  */
  const shared = React.useMemo(
    () => settlementExpenses(expenses, members, ownerMemberId),
    [expenses, members, ownerMemberId],
  );
  /*
    「為何這兩個數字不一樣」 — 應付 NT$894 against 應收 NT$890.

    Everybody's net must sum to zero. It cannot when one bill's 「who paid」
    and 「who owes」 disagree, and the calculator permits that on purpose: it
    will not silently rewrite somebody's figures. That is the right call and
    it told nobody, so the page showed two numbers that could not both be
    true and said nothing about it.
  */
  const imbalances = React.useMemo(
    () => settlementImbalances(expenses, ownerMemberId),
    [expenses, ownerMemberId],
  );
  const toneOf = (memberId: string) =>
    AVATAR_TONES[Math.max(0, members.findIndex(member => member.id === memberId)) % AVATAR_TONES.length];

  return (
    <section className="space-y-4 rounded-[28px] bg-[#f6f7fb] p-4 text-[#11183d]">
      <header className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t('common.back')} className="rounded-full p-2 hover:bg-white">
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="flex-1 text-xl font-black tracking-tight">{t('settle.memberDetailTitle')}</h1>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-full p-2 text-slate-400 hover:bg-white">
            <X size={20} />
          </button>
        )}
      </header>

      {/* The trip this is about, so a shared screenshot carries its own context. */}
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {coverImage && <img src={coverImage} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-black">{tripName}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-400">{dateRange}</p>
        </div>
      </div>

      {orphaned.length > 0 && (
        <div
          data-testid="settlement-orphaned-share"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-black text-amber-700">{t('settle.orphanedTitle')}</p>
          <ul className="mt-2 space-y-1">
            {orphaned.map(({ memberId, net }) => (
              <li key={memberId} className="text-[12px] text-amber-700">
                {t(net > 0 ? 'settle.orphanedReceivable' : 'settle.orphanedPayable', {
                  amount: money(net, currency),
                })}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-5 text-amber-600">{t('settle.orphanedHint')}</p>
        </div>
      )}

      {imbalances.length > 0 && (
        <div
          data-testid="settlement-imbalance"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-black text-amber-700">{t('settle.imbalanceTitle')}</p>
          <ul className="mt-2 space-y-2">
            {imbalances.map(({ expense, paid, owed, difference }) => (
              <li key={expense.id}>
                <button
                  type="button"
                  data-testid={`settlement-imbalance-${expense.id}`}
                  onClick={() => onOpenExpense?.(expense)}
                  className="w-full text-left text-[12px] text-amber-700"
                >
                  <span className="font-bold underline">{expense.description || t('settle.unnamedExpense')}</span>
                  <span className="ml-1 text-amber-600">
                    {t('settle.imbalanceDetail', {
                      paid: money(paid, currency),
                      owed: money(owed, currency),
                      difference: money(Math.abs(difference), currency),
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Never repaired automatically: whose number is wrong is his to say. */}
          <p className="mt-2 text-[11px] text-amber-600">{t('settle.imbalanceHint')}</p>
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
        <div className="flex items-center justify-between">
          <h2 className="font-black">{t('settle.memberTotals')}</h2>
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
            {t('settle.currencyLabel', { currency })} <ChevronDown size={13} />
          </span>
        </div>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(members.length, 3)}, minmax(0, 1fr))` }}>
          {positions.map(({ member, net, transfers }) => {
            const owed = net > 0.5;
            const owing = net < -0.5;
            return (
              <div key={member.id} data-testid={`member-${member.id}`} className="min-w-0 text-center">
                <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${toneOf(member.id)}`}>
                  {member.name.charAt(0)}
                </span>
                <p className="mt-1.5 truncate text-sm font-black">{member.name}</p>
                <p className={`mt-0.5 text-[11px] font-bold ${owed ? 'text-emerald-600' : owing ? 'text-rose-500' : 'text-slate-400'}`}>
                  {owed ? t('settle.receivable') : owing ? t('settle.payable') : t('settle.settledUp')}
                </p>
                <p className={`text-sm font-black ${owed ? 'text-emerald-600' : owing ? 'text-rose-500' : 'text-slate-400'}`}>
                  {money(net, currency)}
                </p>
                <div className={`mt-2 space-y-1 rounded-xl p-2 text-[11px] font-bold ${owed ? 'bg-emerald-50' : owing ? 'bg-rose-50' : 'bg-slate-50'}`}>
                  {transfers.length === 0 && <p className="text-slate-400">—</p>}
                  {/*
                    A counterparty with no row in the member list is named as
                    absent, never dropped: the obligation belongs to the member
                    standing here, and deleting the row is how this panel came
                    to contradict the orphan notice above it.
                  */}
                  {transfers.map(transfer => {
                    const who = transfer.member?.name || t('settle.absentTraveller');
                    return (
                      <p
                        key={transfer.memberId}
                        data-testid={`transfer-${member.id}-${transfer.memberId}`}
                        data-absent={transfer.member ? undefined : 'true'}
                        className="truncate text-slate-600"
                      >
                        {owed
                          ? <>{who} <span className="text-slate-400">→</span> <span className="text-emerald-600">{money(transfer.amount, currency)}</span></>
                          : <>{t('settle.payTo', { name: who })} <span className="text-slate-400">→</span> <span className="text-rose-500">{money(transfer.amount, currency)}</span></>}
                      </p>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
        <div className="flex items-center justify-between">
          <h2 className="font-black">{t('settle.relatedExpenses')}</h2>
          {onAddExpense && (
            <button
              type="button"
              onClick={onAddExpense}
              className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-[#11183d]"
            >
              <Plus size={13} /> {t('settle.addExpense')}
            </button>
          )}
        </div>

        {shared.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">{t('settle.noSharedExpenses')}</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {shared.map(expense => {
              const { payer, owedBy, perHead } = describeExpense(expense, members, ownerMemberId);
              const Icon = getCategoryIcon(expense.category);
              return (
                <button
                  key={expense.id}
                  type="button"
                  onClick={() => onOpenExpense?.(expense)}
                  data-testid={`expense-${expense.id}`}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneOf(payer?.id || '')}`}>
                    {expense.receiptPhotos?.length
                      ? <img src={expense.receiptPhotos[0]} alt={t('settle.receiptAlt')} className="h-full w-full rounded-full object-cover" />
                      : <Icon size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-black">
                      <span className="truncate">{categoryLabel(expense.category, displayLocale)}</span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-400">{expense.date.replace(/-/g, '/')}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{expense.description}</p>
                    {payer && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${toneOf(payer.id)}`}>{payer.name.charAt(0)}</span>
                        {t('settle.paidFirst', { name: payer.name })}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right">
                    <p className="text-sm font-black">{money(expense.twdAmount, currency)}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{t('settle.owedByNames', { names: owedBy.map(member => member.name).join(t('settle.listSeparator')) })}</p>
                    {perHead !== undefined && (
                      <p className="text-[11px] font-bold text-rose-500">{t('settle.perHeadAmount', { amount: money(perHead, currency) })}</p>
                    )}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-slate-300" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {members.length === 0 && (
        <p className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
          <Users size={14} /> {t('settle.noCompanions')}
        </p>
      )}
    </section>
  );
};

export default MemberSettlementDetail;
