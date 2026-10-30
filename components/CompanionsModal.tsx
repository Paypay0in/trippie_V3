
import { OVERLAY } from '../constants/layers';
import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Companion } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Link2, Share2, Trash2, UserPlus, Users, X } from 'lucide-react';

interface Props {
  companions: Companion[];
  friends: Companion[];
  onAdd: (name: string) => void;
  onAddFriendToTrip: (friend: Companion) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  /** Display name for the owner row. Optional; callers without it show 我. */
  ownerName?: string;
  /**
   * Hands this companion a way in.
   *
   * A companion is a name the owner typed; the person it names has no account
   * attached and therefore sees nothing. This is what connects the two, and
   * it claims the existing row rather than adding a second — the roster keeps
   * the shape the owner gave it.
   *
   * Absent when the trip is not shareable yet (offline, or not signed in).
   */
  onInvite?: (companion: Companion) => void;
  /** The companion an invite is currently being prepared for. */
  invitingId?: string | null;
  /** A freshly minted link, shown until it is sent or dismissed. */
  inviteLink?: { companionName: string; url: string } | null;
  onDismissInviteLink?: () => void;
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

const CompanionsModal: React.FC<Props> = ({ companions, friends, onAdd, onAddFriendToTrip, onRemove, onClose, ownerName, onInvite, invitingId, inviteLink, onDismissInviteLink }) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName('');
    }
  };

  const availableFriends = friends.filter(f => !companions.some(c => c.id === f.id));
  const ownerLabel = ownerName?.trim() || t('expense.me');

  return (
    <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 ${OVERLAY.modal} animate-fade-in`}>
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(17,24,61,.22)]">
        {/* Header — same shell and close-button style as the other expense modals */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <button onClick={onClose} aria-label={t('common.close')} className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
          <h2 className="flex items-center gap-2 text-xl font-black text-[#11183d]">
            <Users size={20} className="text-violet-600" /> {t('companions.title')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-5 rounded-2xl bg-[#f5f1ff] px-4 py-3 text-xs font-medium leading-relaxed text-slate-600 ring-1 ring-violet-100">
            {t('companions.blurb')}
          </p>

          <form onSubmit={handleSubmit} className="mb-6 flex gap-2.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('companions.namePlaceholder')}
              className="h-12 flex-1 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              aria-label={t('companions.addAria')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,58,237,.3)] transition-colors hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <UserPlus size={20} />
            </button>
          </form>

          <div className="space-y-2.5">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
              <Avatar name={ownerLabel} tone="owner" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">{ownerLabel}</span>
              <RoleChip tone="owner">{t('companions.owner')}</RoleChip>
            </div>

            {inviteLink && (
              /* On screen, not slipped into the clipboard. Safari drops the
                 user gesture across the await that mints the token, so a
                 silent copy fails on exactly the phones this is for — and a
                 message saying "copied" over an empty clipboard is worse than
                 showing the link. Each button below is its own fresh tap. */
              <div className="rounded-2xl border border-violet-200 bg-[#f7f5ff] p-3.5">
                <div className="text-xs font-black text-[#11183d]">
                  {t('companions.inviteLinkFor', { name: inviteLink.companionName })}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  {t('companions.inviteLinkHint')}
                </p>
                {/*
                  A QR of the link, scanned with the phone's own camera.
                  
                  Not an in-app scanner: the person joining has no trip yet, so
                  there is no screen in this app to put one on, and asking for
                  camera access inside a home-screen web app is the least
                  reliable thing iOS does. Every iPhone reads a QR from the lock
                  screen and offers to open the URL — which lands exactly on the
                  sheet that claims the invite.
                */}
                <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <QRCodeSVG value={inviteLink.url} size={148} level="M" includeMargin={false} />

                  <p className="text-center text-[11px] leading-5 text-slate-500">
                    <Trans i18nKey="companions.scanHint" components={{ b: <span className="font-bold text-slate-600" /> }} />
                  </p>
                </div>
                {/*
                  Said here because iOS makes it unavoidable and invisible. A
                  scanned link always opens Safari — a home-screen web app
                  cannot capture an http URL — and Safari does not share
                  storage with that home-screen app. So joining in Safari and
                  then opening the icon shows an empty app, which reads as the
                  invite having failed when it did not.
                */}
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                  <Trans
                    i18nKey="companions.safariNotice"
                    components={{ b: <span className="font-bold" />, strong: <span className="font-bold" /> }}
                  />
                </p>
                <div className="mt-2 break-all rounded-xl bg-white px-3 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
                  {inviteLink.url}
                </div>
                <div className="mt-2 flex gap-2">
                  {typeof navigator !== 'undefined' && navigator.share && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.share({ url: inviteLink.url, text: t('companions.shareText') }).catch(() => undefined);
                      }}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-xs font-black text-white"
                    >
                      <Share2 size={14} />{t('companions.share')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(inviteLink.url).catch(() => undefined);
                    }}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-white text-xs font-black text-[#5b3df5] ring-1 ring-violet-200"
                  >
                    <Copy size={14} />{t('companions.copy')}
                  </button>
                  <button
                    type="button"
                    onClick={onDismissInviteLink}
                    className="min-h-11 shrink-0 px-3 text-xs font-bold text-slate-500"
                  >
                    {t('companions.collapse')}
                  </button>
                </div>
              </div>
            )}

            {companions.map(c => {
              /*
                Three states, and they were showing as two. A seat whose invite
                has been accepted said 「訪客」 beside an 「邀請」 button — the
                same thing it said before she joined — so the one screen that
                could have answered 「她到底有沒有加入？」 answered no, four
                times, while she was in fact a member each time.

                The repair for that read `type === 'member'` as joined, and
                that is a different fact. 「Gina 跟諮是同一個人」: her seat said
                已加入 with no account behind it at all — `user_id` was null,
                so she was invisible to the friends screen, to the shared
                ledger, and to the cloud.

                Worse, the label took the cure away with it: 邀請 is hidden
                for a seat that has joined, so the only way to attach an
                account to that seat was gone from the one screen that offers
                it. A wrong label is a wrong label; a wrong label that removes
                the fix is a dead end.

                `user_id` is the only thing that means 「there is an account
                here」 — it is what `is_trip_member` reads and what
                `claim_trip_invite` writes. A seat without it is a name, and
                is offered the invite that would change that. The RPC refuses
                to take a seat somebody already holds, so the worst an
                unnecessary invite can do is say so.
              */
              const hasJoined = Boolean(c.userId);
              const isLinked = hasJoined || friends.some(f => f.id === c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-violet-200"
                >
                  <Avatar name={c.name} tone={isLinked ? 'member' : 'guest'} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#11183d]">{c.name}</span>
                  <RoleChip tone={isLinked ? 'member' : 'guest'}>
                    {hasJoined ? t('companions.joined') : isLinked ? t('companions.friendLinked') : t('companions.guest')}
                  </RoleChip>
                  {/* Nobody needs inviting to a trip they are already in. */}
                  {onInvite && !hasJoined && (
                    <button
                      onClick={() => onInvite(c)}
                      disabled={invitingId === c.id}
                      aria-label={t('companions.inviteAria', { name: c.name })}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-[#f3f0ff] px-2.5 text-xs font-black text-[#5b3df5] disabled:opacity-50"
                    >
                      <Link2 size={14} />{invitingId === c.id ? t('companions.generating') : t('companions.invite')}
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(c.id)}
                    aria-label={t('companions.removeAria', { name: c.name })}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
                  <span className="text-sm font-black tracking-tight text-[#11183d]">{t('companions.fromFriends')}</span>
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
