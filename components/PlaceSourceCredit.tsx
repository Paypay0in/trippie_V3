import React from 'react';
import { Bookmark, ChevronRight } from 'lucide-react';
import { PlaceCredit } from '../services/collectionCredits';

/**
 * 「來自 Ann 的東京咖啡地圖・收藏於 2024/03/10」.
 *
 * The visible end of everything the attribution work was for. A place that
 * reached this traveller because somebody else found it says so, on the
 * place, wherever it is read.
 *
 * It says less rather than saying something wrong. A creator whose name could
 * not be fetched is 「某位旅人」 — never a guess, and never the reader's own
 * name, which is what a credit resolved from the wrong id would print. A
 * collection that has been unpublished loses its title and its link and
 * keeps the person: the source stops being readable, the credit does not.
 */

interface Props {
  credit: PlaceCredit;
  /** Absent and the credit is text. Present and the source can be opened. */
  onOpenSource?: (collectionId: string) => void;
}

const asDate = (value: string): string => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}/${String(at.getMonth() + 1).padStart(2, '0')}/${String(at.getDate()).padStart(2, '0')}`;
};

const PlaceSourceCredit: React.FC<Props> = ({ credit, onOpenSource }) => {
  const who = credit.creatorName || '某位旅人';
  const savedOn = asDate(credit.savedAt);
  /* 「X 的 Y」 only where Y is known; otherwise 「來自 X 的收藏」. */
  const line = credit.collectionTitle
    ? `來自 ${who} 的${credit.collectionTitle}`
    : `來自 ${who} 的收藏`;
  const openable = Boolean(credit.collectionTitle && credit.collectionId && onOpenSource);

  const body = (
    <>
      <Bookmark size={12} className="mt-0.5 shrink-0 text-[#5b3df5]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-[#11183d]">{line}</span>
        {savedOn && <span className="block text-[11px] text-slate-400">收藏於 {savedOn}</span>}
      </span>
      {openable && <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-300" />}
    </>
  );

  if (!openable) {
    return (
      <div
        data-testid="place-source-credit"
        className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2"
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="place-source-credit"
      onClick={() => onOpenSource?.(credit.collectionId as string)}
      className="flex w-full items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2 text-left"
    >
      {body}
    </button>
  );
};

export default PlaceSourceCredit;
