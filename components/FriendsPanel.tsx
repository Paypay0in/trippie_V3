import React, { useState } from 'react';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { Person } from '../services/friendships';
import { searchIntent } from '../services/friendSearch';

/**
 * 「這裡要有可以加朋友的欄位」.
 *
 * Asked for before the tables exist, so the one thing this must never do is
 * pretend. A lookup that cannot reach its function has two ways to answer:
 * 「查無此人」, which sends somebody off to check their friend's spelling for a
 * problem that is not theirs, or the truth. The truth costs one branch.
 *
 * The field does not search as you type. 「a@」 is a prefix, and a prefix query
 * is a request to list everyone who starts that way — so nothing leaves the
 * phone until there is a whole address, and the button is what sends it.
 */

export interface PendingRequest {
  person: Person;
  /** Whether this account was asked, or did the asking. */
  direction: 'incoming' | 'outgoing';
}

export interface Props {
  myEmail?: string;
  friends: Person[];
  pending: PendingRequest[];
  /** Resolves to the person, null when nobody has that address, or a reason. */
  onLookup: (email: string) => Promise<{ person: Person | null } | { problem: 'setup' | 'error' }>;
  onRequest: (person: Person) => void | Promise<void>;
  onAccept: (person: Person) => void | Promise<void>;
  onRemove: (person: Person) => void | Promise<void>;
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; person: Person }
  | { kind: 'none' }
  | { kind: 'self' }
  | { kind: 'setup' }
  | { kind: 'error' };

const Avatar: React.FC<{ person: Person }> = ({ person }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-support font-black text-violet-700">
    {person.avatarUrl
      ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
      : person.displayName.slice(0, 1)}
  </span>
);

const FriendsPanel: React.FC<Props> = ({
  myEmail, friends, pending, onLookup, onRequest, onAccept, onRemove,
}) => {
  const [typed, setTyped] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const intent = searchIntent(typed, myEmail);

  const look = async () => {
    if (intent === 'self') { setOutcome({ kind: 'self' }); return; }
    if (intent !== 'search') return;
    setOutcome({ kind: 'searching' });
    const result = await onLookup(typed.trim());
    if ('problem' in result) {
      setOutcome({ kind: result.problem === 'setup' ? 'setup' : 'error' });
      return;
    }
    setOutcome(result.person ? { kind: 'found', person: result.person } : { kind: 'none' });
  };

  return (
    <section className="mt-5" data-testid="friends-panel">
      <h2 className="text-section font-semibold tracking-tight">好友</h2>

      <div className="mt-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={typed}
            data-testid="friend-email"
            aria-label="用 Email 找朋友"
            placeholder="輸入對方的 Email"
            onChange={event => { setTyped(event.target.value); setOutcome({ kind: 'idle' }); }}
            onKeyDown={event => { if (event.key === 'Enter') void look(); }}
            className="h-[var(--control-h)] w-full min-w-0 rounded-field border border-hairline bg-white pl-9 pr-3 text-field font-medium text-ink outline-none placeholder:text-slate-300 focus:border-violet-400"
          />
        </div>
        {/*
          Pressing is what sends it. Searching as you type would send 「a」,
          「a@」, 「a@e」 on the way to one address — six prefix queries the
          server then has to answer, whatever its own matching rule says.
        */}
        <button
          type="button"
          data-testid="friend-lookup"
          disabled={intent !== 'search' && intent !== 'self'}
          onClick={() => void look()}
          className="flex h-[var(--control-h)] shrink-0 items-center gap-1.5 rounded-control bg-violet-600 px-4 text-action font-semibold text-white disabled:opacity-40"
        >
          <UserPlus size={16} />尋找
        </button>
      </div>

      {intent === 'incomplete' && (
        <p className="mt-1.5 text-meta text-ink-soft">輸入完整的 Email 才會查詢</p>
      )}

      {outcome.kind === 'searching' && (
        <p className="mt-2 text-support text-ink-soft">搜尋中…</p>
      )}

      {/* 「That's you」 rather than 「no such person」: the account plainly exists. */}
      {outcome.kind === 'self' && (
        <p data-testid="friend-self" className="mt-2 text-support text-ink-soft">這是你自己的帳號。</p>
      )}

      {outcome.kind === 'none' && (
        <p data-testid="friend-none" className="mt-2 text-support text-ink-soft">
          找不到這個 Email 的 Trippie 帳號。
        </p>
      )}

      {/*
        The honest branch. Saying 「查無此人」 here would send him to check his
        friend's spelling for a problem that is not his.
      */}
      {outcome.kind === 'setup' && (
        <p data-testid="friend-setup" className="mt-2 rounded-card bg-amber-50 px-3 py-2 text-support font-medium text-amber-800">
          好友功能的資料表還沒建立，所以現在查不了。這不是你打錯。
        </p>
      )}

      {outcome.kind === 'error' && (
        <p data-testid="friend-error" className="mt-2 text-support font-medium text-rose-600">
          查詢失敗，請稍後再試。
        </p>
      )}

      {outcome.kind === 'found' && (
        <div data-testid="friend-found" className="mt-2 flex items-center gap-3 rounded-card border border-hairline bg-white px-3 py-2.5">
          <Avatar person={outcome.person} />
          <span className="min-w-0 flex-1 truncate text-field font-semibold">{outcome.person.displayName}</span>
          <button
            type="button"
            data-testid="friend-request"
            onClick={() => { void onRequest(outcome.person); setOutcome({ kind: 'idle' }); setTyped(''); }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-violet-600 px-3.5 text-support font-semibold text-white"
          >
            <UserPlus size={15} />邀請
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-4">
          <p className="text-support font-semibold text-ink-soft">邀請中</p>
          <ul className="mt-1.5 space-y-1.5">
            {pending.map(({ person, direction }) => (
              <li
                key={person.id}
                data-testid={`friend-pending-${person.id}`}
                className="flex items-center gap-3 rounded-card border border-hairline bg-white px-3 py-2.5"
              >
                <Avatar person={person} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-field font-semibold">{person.displayName}</span>
                  <span className="block text-meta text-ink-soft">
                    {direction === 'incoming' ? '想加你為好友' : '等待對方回覆'}
                  </span>
                </span>
                {direction === 'incoming' ? (
                  <button
                    type="button"
                    data-testid={`friend-accept-${person.id}`}
                    onClick={() => void onAccept(person)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white"
                    aria-label={`接受 ${person.displayName}`}
                  >
                    <Check size={17} />
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid={`friend-cancel-${person.id}`}
                  onClick={() => void onRemove(person)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400"
                  aria-label={direction === 'incoming' ? `拒絕 ${person.displayName}` : `取消邀請 ${person.displayName}`}
                >
                  <X size={17} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-support font-semibold text-ink-soft">我的好友（{friends.length}）</p>
        {friends.length === 0 ? (
          <p className="mt-1.5 rounded-card border border-dashed border-slate-200 px-3 py-5 text-center text-support text-ink-soft">
            還沒有好友。用上面的 Email 找找看。
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {friends.map(person => (
              <li
                key={person.id}
                data-testid={`friend-${person.id}`}
                className="flex items-center gap-3 rounded-card border border-hairline bg-white px-3 py-2.5"
              >
                <Avatar person={person} />
                <span className="min-w-0 flex-1 truncate text-field font-semibold">{person.displayName}</span>
                <button
                  type="button"
                  data-testid={`friend-remove-${person.id}`}
                  onClick={() => void onRemove(person)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400"
                  aria-label={`移除好友 ${person.displayName}`}
                >
                  <X size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default FriendsPanel;
