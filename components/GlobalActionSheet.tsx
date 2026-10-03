import React from 'react';
import { OVERLAY } from '../constants/layers';

export type GlobalActionContext = 'community' | 'travel' | 'wallet';

interface Props {
  context: GlobalActionContext;
  onClose: () => void;
  /** Joining a trip someone else owns, from the one menu that is always there. */
  onJoinTrip: () => void;
  onCreatePost: () => void;
  onCreateTrip: () => void;
  /** Opens the trip's bookshelf. Navigation, and labelled as such. */
  onOpenBookshelf: () => void;
  onAiImport: () => void;
  onAddExpense: () => void;
  /**
   * Adds an itinerary item to the open trip.
   *
   * 「新增行程要點哪一個」 — none of them, was the answer: the menu offered five
   * ways to start or join a trip and no way to do the thing somebody mid-trip
   * actually wants. Omitted when no trip is open, where there is nothing to
   * add an item to.
   */
  onAddItineraryItem?: () => void;
}

const GlobalActionSheet: React.FC<Props> = ({ context, onClose, onJoinTrip, onCreatePost, onCreateTrip, onOpenBookshelf, onAiImport, onAddExpense, onAddItineraryItem }) => {
  const actions = context === 'community'
    ? [['發布旅行貼文', onCreatePost], ['分享一趟旅程', onClose], ['從相簿建立', onClose], ['儲存為草稿', onCreatePost]]
    : context === 'travel'
      /*
        What someone can actually do from here.

        「新增行程要點哪一個」 — the honest answer was 「none of them」. 新增地點 and
        新增筆記 both ran `setViewMode('bookshelf')`: two different labels, the
        same navigation, and neither added anything. There is no add-place or
        add-note feature behind them to reach. So the lie is gone and the one
        entry that remains says what it does.

        新增行程 leads when a trip is open, because that is the thing a traveller
        in the middle of one wants. 加入旅程 leads otherwise: someone who was
        invited has nothing else here they want, since every other action builds
        a trip of their own and the one they were asked to join is somebody
        else's.
      */
      ? [
          ...(onAddItineraryItem ? [['新增行程', onAddItineraryItem] as [string, () => void]] : []),
          ['加入旅程', onJoinTrip],
          ['新增旅程', onCreateTrip],
          ['旅行書架', onOpenBookshelf],
          ['AI 匯入', onAiImport],
        ]
      : [['新增支出', onAddExpense]];
  return <div className={`fixed inset-0 ${OVERLAY.modal} flex items-end justify-center bg-slate-950/35 p-4`} onClick={onClose}>
    <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-200" />
      <h2 className="mb-4 text-lg font-black text-[#11183d]">快速操作</h2>
      <div className="grid gap-3 sm:grid-cols-2">{actions.map(([label, handler]) => <button key={label as string} type="button" onClick={handler as () => void} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-left text-sm font-black text-[#11183d] hover:bg-violet-50">{label as string}</button>)}</div>
    </div>
  </div>;
};

export default GlobalActionSheet;
