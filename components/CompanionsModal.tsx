
import React, { useState } from 'react';
import { Companion } from '../types';
import { X, UserPlus, Trash2, Users } from 'lucide-react';

interface Props {
  companions: Companion[];
  friends: Companion[];
  onAdd: (name: string) => void;
  onAddFriendToTrip: (friend: Companion) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  /** Display name for the owner row. Optional; callers without it show 我. */
  ownerName?: string;
}

/** Member chip: same vocabulary as the trip roster (owner / member / guest). */
const RoleChip: React.FC<{ tone: 'owner' | 'member' | 'guest'; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const styles = {
    owner: 'bg-slate-100 text-slate-500',
    member: 'bg-violet-100 text-violet-700',
    guest: 'bg-slate-100 text-slate-400',
  }[tone];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${styles}`}>
      {children}
    </span>
  );
};

const Avatar: React.FC<{ name: string; tone: 'owner' | 'member' | 'guest' }> = ({ name, tone }) => {
  const styles = {
    owner: 'bg-violet-600 text-white',
    member: 'bg-violet-100 text-violet-700',
    guest: 'bg-slate-100 text-slate-500',
  }[tone];
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${styles}`}>
      {name.charAt(0)}
    </span>
  );
};

const CompanionsModal: React.FC<Props> = ({ companions, friends, onAdd, onAddFriendToTrip, onRemove, onClose, ownerName }) => {
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName('');
    }
  };

  const availableFriends = friends.filter(f => !companions.some(c => c.id === f.id));
  const ownerLabel = ownerName?.trim() || '我';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(17,24,61,.22)]">
        {/* Header — same shell and close-button style as the other expense modals */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <button onClick={onClose} aria-label="關閉" className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
          <h2 className="flex items-center gap-2 text-xl font-black text-[#11183d]">
            <Users size={20} className="text-violet-600" /> 管理旅伴
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-5 rounded-2xl bg-[#f5f1ff] px-4 py-3 text-xs font-medium leading-relaxed text-slate-600 ring-1 ring-violet-100">
            新增旅伴後，記帳時即可選擇「誰付錢」與「分攤給誰」，系統會自動計算債務。
          </p>

          <form onSubmit={handleSubmit} className="mb-6 flex gap-2.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="輸入旅伴名字（例：Alice）"
              className="h-12 flex-1 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              aria-label="新增旅伴"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,58,237,.3)] transition-colors hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <UserPlus size={20} />
            </button>
          </form>

          <div className="space-y-2.5">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
              <Avatar name={ownerLabel} tone="owner" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">{ownerLabel}</span>
              <RoleChip tone="owner">擁有者</RoleChip>
            </div>

            {companions.map(c => {
              const isLinked = friends.some(f => f.id === c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-violet-200"
                >
                  <Avatar name={c.name} tone={isLinked ? 'member' : 'guest'} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">{c.name}</span>
                  <RoleChip tone={isLinked ? 'member' : 'guest'}>
                    {isLinked ? '已連結好友' : '訪客'}
                  </RoleChip>
                  <button
                    onClick={() => onRemove(c.id)}
                    aria-label={`移除${c.name}`}
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}

            {availableFriends.length > 0 && (
              <div className="pt-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-violet-500" />
                  <span className="text-sm font-black tracking-tight text-[#11183d]">從好友名單加入</span>
                </div>
                <div className="space-y-2.5">
                  {availableFriends.map(f => (
                    <button
                      key={f.id}
                      onClick={() => onAddFriendToTrip(f)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-[#f5f1ff] p-3.5 text-left ring-1 ring-violet-100 transition-colors hover:bg-violet-100/60"
                    >
                      <Avatar name={f.name} tone="member" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">{f.name}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
                        <UserPlus size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanionsModal;
