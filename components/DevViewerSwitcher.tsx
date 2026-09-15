import React, { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { TripMember } from '../types';
import { ViewerResolutionReason } from '../services/tripRoster';

interface Props {
  roster: TripMember[];
  /** The member id currently in effect (resolved identity, or the override). */
  viewerMemberId: string;
  /** How the real identity was resolved, before any override. */
  resolvedReason: ViewerResolutionReason;
  resolvedMemberId: string;
  /** Null clears the override and returns to the real resolved identity. */
  onOverride: (memberId: string | null) => void;
  overrideMemberId: string | null;
}

const REASON_LABEL: Record<ViewerResolutionReason, string> = {
  'owner-user-match': '登入者就是行程擁有者',
  'member-user-match': '登入者已連結到成員',
  'member-id-match': '成員 id 即登入者 id（掃碼加入）',
  'owner-fallback': '未識別，回退為擁有者',
};

const TYPE_LABEL: Record<TripMember['type'], string> = {
  owner: '擁有者',
  member: '成員',
  guest: '訪客',
};

/**
 * Dev-only viewer switcher.
 *
 * Shared-trip permissions are invisible in single-user mode: the viewer always
 * resolves to the owner, so every ownership check passes. This panel lets a
 * reviewer look at the ledger *as* another member without a second account, so
 * the rules can be checked by hand instead of only in unit tests.
 *
 * The override changes who the UI believes is looking. It does not weaken any
 * check — permission still runs at the action boundary against whichever member
 * is selected here.
 */
const DevViewerSwitcher: React.FC<Props> = ({
  roster,
  viewerMemberId,
  resolvedReason,
  resolvedMemberId,
  onOverride,
  overrideMemberId,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const current = roster.find(member => member.id === viewerMemberId);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-28 right-3 z-[95] flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-2 text-[11px] font-black text-white shadow-lg"
        title="開發用：切換檢視者"
      >
        <Eye size={13} />
        {current?.name || '檢視者'}
        {overrideMemberId && <span className="text-amber-300">●</span>}
      </button>
    );
  }

  return (
    <div className="fixed bottom-28 right-3 z-[95] w-64 rounded-2xl bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-black tracking-wide text-amber-300">
          DEV：以誰的身分檢視
        </span>
        <button type="button" onClick={() => setIsOpen(false)} aria-label="關閉">
          <X size={14} className="text-slate-400" />
        </button>
      </div>

      <div className="mb-2 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] leading-relaxed text-slate-300">
        <div>
          實際解析：
          <span className="font-bold text-white">
            {roster.find(m => m.id === resolvedMemberId)?.name || resolvedMemberId}
          </span>
        </div>
        <div>原因：{REASON_LABEL[resolvedReason]}</div>
      </div>

      <div className="space-y-1">
        {roster.map(member => {
          const isActive = member.id === viewerMemberId;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => onOverride(member.id)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                isActive ? 'bg-violet-500 font-black' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="truncate">{member.name}</span>
              <span className="ml-2 shrink-0 text-[9px] text-slate-300">
                {TYPE_LABEL[member.type]}
              </span>
            </button>
          );
        })}
      </div>

      {overrideMemberId && (
        <button
          type="button"
          onClick={() => onOverride(null)}
          className="mt-2 w-full rounded-lg border border-white/20 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-white/10"
        >
          還原成真實身分
        </button>
      )}

      <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
        僅開發模式可見，不會進入正式版本。
      </p>
    </div>
  );
};

export default DevViewerSwitcher;
