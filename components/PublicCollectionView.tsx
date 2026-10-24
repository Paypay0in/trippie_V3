import React from 'react';
import { Bookmark, Check, Loader2, X } from 'lucide-react';
import { SavedCollectionItem, SavedTravelInspiration } from '../types';
import { PublicCollection } from '../services/savedCollectionSync';
import { alreadyHeld } from '../services/collectionSave';

/**
 * Somebody else's collection, seen by whoever opened the link.
 *
 * The visitor's half of 收藏集頁面, and 別人儲存整份收藏 with it — one screen,
 * because 「save all」 and 「pick a few」 are the same action with a different
 * selection and splitting them is how one of them ends up keeping provenance
 * the other drops.
 *
 * Read-only about the creator's list. Nothing here can change what they
 * published; a visitor saving a place is making their own copy, which is the
 * whole shape of the approved behaviour.
 */

interface Props {
  /** Absent while it is being fetched. */
  collection?: PublicCollection;
  /** Set when the link does not open onto anything. */
  notFound?: boolean;
  loading?: boolean;
  /** The visitor's own saved places, so a place they already hold says so. */
  held: SavedTravelInspiration[];
  /** Absent means nobody is signed in, and saving needs an account. */
  signedIn?: boolean;
  onSignIn?: () => void;
  onSave: (items: SavedCollectionItem[]) => void;
  onClose: () => void;
}

const PublicCollectionView: React.FC<Props> = ({
  collection,
  notFound,
  loading,
  held,
  signedIn,
  onSignIn,
  onSave,
  onClose,
}) => {
  const [picking, setPicking] = React.useState(false);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [saved, setSaved] = React.useState(false);

  const items = collection?.items ?? [];

  const toggle = (id: string) => setChosen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f7f8fc] px-[var(--screen-pad)] py-6" data-testid="public-collection">
      <button
        type="button"
        aria-label="關閉"
        data-testid="public-collection-close"
        onClick={onClose}
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm"
      >
        <X size={18} />
      </button>
      {children}
    </div>
  );

  if (loading) {
    return shell(
      <p className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-[13px] text-slate-400">
        <Loader2 size={15} className="animate-spin" />讀取中…
      </p>,
    );
  }

  /*
    One sentence for every refusal.

    Private, never published, revoked, or asked for without the token it
    needs all land here, because 「你不能看」 tells a stranger that something
    is there. The server answers them identically too; this only repeats it.
  */
  if (notFound || !collection) {
    return shell(
      <div className="rounded-2xl bg-white p-8 text-center" data-testid="public-collection-missing">
        <p className="text-[14px] font-black text-[#11183d]">找不到這份收藏</p>
        <p className="mt-1 text-[12px] text-slate-400">連結可能已經失效，或對方已經取消公開。</p>
      </div>,
    );
  }

  const selection = picking
    ? items.filter(item => chosen.has(item.id))
    : items;

  return shell(
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_18px_rgba(17,24,61,.05)]">
        {collection.coverUrl && (
          <img src={collection.coverUrl} alt="" className="h-40 w-full object-cover" />
        )}
        <div className="p-4">
          <h1 className="text-xl font-black text-[#11183d]">{collection.title}</h1>
          <p className="mt-0.5 text-[12px] text-slate-400">
            {[collection.city, collection.country].filter(Boolean).join('・')}
            {items.length > 0 && `・${items.length} 個地點`}
          </p>
          {collection.description && (
            <p className="mt-2 text-[12px] leading-5 text-slate-500">{collection.description}</p>
          )}

          {saved ? (
            <p
              data-testid="public-collection-saved"
              className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-emerald-50 py-3 text-[13px] font-black text-emerald-600"
            >
              <Check size={15} />已存進你的收藏
            </p>
          ) : signedIn ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                data-testid="public-collection-save-all"
                onClick={() => {
                  if (picking) { onSave(selection); } else { onSave(items); }
                  setSaved(true);
                }}
                disabled={picking && selection.length === 0}
                className="min-h-12 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white disabled:opacity-50"
              >
                {picking ? `收藏選取的 ${selection.length} 個地點` : '全部收藏'}
              </button>
              <button
                type="button"
                data-testid="public-collection-pick"
                onClick={() => { setPicking(current => !current); setChosen(new Set()); }}
                className="min-h-12 flex-1 rounded-xl bg-white text-[13px] font-black text-[#5b3df5] ring-1 ring-violet-200"
              >
                {picking ? '取消選取' : '選擇收藏'}
              </button>
            </div>
          ) : (
            /*
              A visitor can read without an account and cannot save without
              one: a save has to belong to somebody. Said here rather than
              after they have tapped and lost the selection.
            */
            <button
              type="button"
              data-testid="public-collection-sign-in"
              onClick={() => onSignIn?.()}
              className="mt-3 min-h-12 w-full rounded-xl bg-white text-[13px] font-black text-[#5b3df5] ring-1 ring-violet-200"
            >
              登入後就能把這些地點存進你的收藏
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const mine = alreadyHeld(item, held);
          const ticked = chosen.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`public-collection-item-${item.id}`}
              onClick={() => picking && toggle(item.id)}
              className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left shadow-[0_6px_18px_rgba(17,24,61,.05)] ${
                picking && ticked ? 'bg-violet-50 ring-1 ring-violet-300' : 'bg-white'
              }`}
            >
              {picking && (
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${ticked ? 'bg-[#5b3df5] text-white' : 'bg-slate-100'}`}>
                  {ticked && <Check size={13} />}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black text-[#11183d]">{item.placeName}</span>
                <span className="block text-[11px] text-slate-400">
                  {[item.district, item.city, item.formattedAddress].filter(Boolean).join('・') || '—'}
                </span>
                {item.notes.map(note => (
                  <span key={note.id} className="mt-1 block text-[11px] leading-5 text-slate-500">
                    {note.text}
                  </span>
                ))}
              </span>
              {/* 「已收藏」 — so saving twice does not look like the only option. */}
              {mine && (
                <span
                  data-testid={`public-collection-held-${item.id}`}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-400"
                >
                  <Bookmark size={11} />已收藏
                </span>
              )}
            </button>
          );
        })}
        {items.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-[12px] text-slate-400">
            這份收藏還沒有地點。
          </p>
        )}
      </div>
    </div>,
  );
};

export default PublicCollectionView;
