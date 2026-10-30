import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

/**
 * 已儲存 — what happened, and the two things worth doing next.
 *
 * 「可一鍵儲存，也可挑選部分地點」. The whole thing is saved first and the picking
 * is offered afterwards, deliberately: a visitor who wanted everything is done
 * in one tap, and a visitor who wanted three places has not lost the other
 * thirty-two by tapping. Asking first would make the common case the slow one.
 *
 * It states the number it actually saved and where they came from. 「35 個地點
 * 已加入你的收藏（來自 Ann 的公開收藏）」 — a confirmation that cannot say how
 * much it did is a confirmation nobody can check.
 */

interface Props {
  /** How many places were saved. Stated, never approximated. */
  savedCount: number;
  /** What was saved — 「東京咖啡地圖」. */
  title: string;
  /** Who it came from, kept verbatim: the credit is the point. */
  sourceLabel?: string;
  onKeepBrowsing: () => void;
  onOpenSaved?: () => void;
  /** Offered only when there is a selection worth making. */
  onPickSome?: () => void;
}

const SavedConfirmationSheet: React.FC<Props> = ({
  savedCount, title, sourceLabel, onKeepBrowsing, onOpenSaved, onPickSome,
}) => {
  const { t } = useTranslation();
  return (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-[var(--screen-pad)]" data-testid="saved-confirmation">
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-[0_18px_48px_rgba(17,26,74,.18)]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check size={22} />
      </span>
      <p className="mt-3 text-[15px] font-black text-[#11183d]">{t('saved.confirmation.heading', { title })}</p>
      <p data-testid="saved-confirmation-count" className="mt-1 text-[12px] leading-5 text-slate-400">
        {t('saved.confirmation.count', { count: savedCount })}
        {sourceLabel && <>（{sourceLabel}）</>}
      </p>

      {onPickSome && (
        <button
          type="button"
          data-testid="saved-confirmation-pick"
          onClick={onPickSome}
          className="mt-4 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white"
        >
          {t('saved.confirmation.pickSome')}
        </button>
      )}
      <button
        type="button"
        data-testid="saved-confirmation-continue"
        onClick={onKeepBrowsing}
        className="mt-2 min-h-12 w-full rounded-xl bg-white text-[13px] font-black text-[#11183d] ring-1 ring-slate-200"
      >
        {t('saved.confirmation.keepBrowsing')}
      </button>
      {onOpenSaved && (
        <button
          type="button"
          data-testid="saved-confirmation-open"
          onClick={onOpenSaved}
          className="mt-2 text-[12px] font-bold text-[#5b3df5]"
        >
          {t('saved.confirmation.openSaved')}
        </button>
      )}
    </div>
  </div>
  );
};

export default SavedConfirmationSheet;
