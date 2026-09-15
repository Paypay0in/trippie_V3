import React from 'react';
import { OVERLAY } from '../constants/layers';

export type GlobalActionContext = 'community' | 'travel' | 'wallet';

interface Props {
  context: GlobalActionContext;
  onClose: () => void;
  onCreatePost: () => void;
  onCreateTrip: () => void;
  onAddPlace: () => void;
  onAddNote: () => void;
  onAiImport: () => void;
  onAddExpense: () => void;
}

const GlobalActionSheet: React.FC<Props> = ({ context, onClose, onCreatePost, onCreateTrip, onAddPlace, onAddNote, onAiImport, onAddExpense }) => {
  const actions = context === 'community'
    ? [['發布旅行貼文', onCreatePost], ['分享一趟旅程', onClose], ['從相簿建立', onClose], ['儲存為草稿', onCreatePost]]
    : context === 'travel'
      ? [['新增旅程', onCreateTrip], ['新增地點', onAddPlace], ['新增筆記', onAddNote], ['AI 匯入', onAiImport]]
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
