import React, { useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The closing report on a finished trip — open while money is, folded once it
 * is not.
 *
 * 「我現在看一個已經結束的旅程 點進去都直接是結算金額的頁面 我覺得不太 OK」.
 *
 * 「旅程結束後的總覽 是帳目的」 (2026-10-10) is kept, because a traveller still
 * owed 662 should see it the moment they open the trip and should not have to
 * go looking. What changed is the unstated half of that sentence: it assumed
 * 「finished」 means 「owes somebody something」, and a settled trip kept asking
 * about money nobody was waiting for.
 *
 * Folded, never removed. A settled balance is a number that can change — a
 * late bill, a correction, a companion who disputes a share — so the report is
 * one tap away rather than gone, and the fold says 已結清 so the state is a
 * statement rather than an absence.
 *
 * Not persisted, unlike 排今天: this is derived from the trip's own balance, so
 * remembering a tap would mean a trip that goes back into debt stays folded.
 */
const FinishedTripReport: React.FC<{ settled: boolean; children: React.ReactNode }> = ({
  settled,
  children,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!settled || open) return <>{children}</>;

  return (
    <button
      type="button"
      data-testid="settled-trip-report-disclosure"
      aria-expanded={false}
      onClick={() => setOpen(true)}
      className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-4 text-left shadow-sm"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-black text-[#11183d]">
        <Trophy size={16} className="shrink-0 text-amber-400" />
        <span className="truncate">{t('summary.title')}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-600">
        {t('settle.settledUp')}
        <ChevronDown size={14} className="text-slate-400" />
      </span>
    </button>
  );
};

export default FinishedTripReport;
