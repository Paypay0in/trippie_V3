import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * A preparation section this trip probably does not need, kept one tap away.
 *
 * 「租車與航班資訊 應該是用戶在建立旅程時有點選才需要出現」 — so a trip that
 * said 火車 does not open with a boarding-pass form. But the section is
 * collapsed, never removed: 松山→澎湖 is a domestic flight and somebody who
 * picked 火車 in March can book a plane in April. A hidden field is a layout
 * decision; a deleted one throws away a fact the traveller has.
 *
 * Expanded state is local and per-mount on purpose. It is a disclosure, not a
 * preference — nothing about opening a form once says the trip has changed
 * what it is, and persisting it would quietly undo the Founder's ask.
 */
const OptionalPlanSection: React.FC<{ label: string; testId: string; children: React.ReactNode }> = ({
  label,
  testId,
  children,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (open) return <>{children}</>;

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => setOpen(true)}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white px-4 text-xs font-black text-slate-500 shadow-sm"
    >
      {t('plan.sectionStillNeeded', { section: label })}
      <ChevronDown size={14} />
    </button>
  );
};

export default OptionalPlanSection;
