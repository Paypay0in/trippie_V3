import React from 'react';
import { Copy, Globe, Link2, Lock, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SavedCollection, SavedTravelInspiration, ShareVisibility } from '../types';
import { isPublished, shareLinkFor } from '../services/collectionLifecycle';
import { ownNotes, publishableItems } from '../services/collectionPublish';

/**
 * 分享設定 and 預覽公開版本, in one sheet.
 *
 * Two screens in the Founder's mock and one component, because they are the
 * same decision seen twice: the preview is not a mock-up of what publishing
 * would do, it is the publisher's own output rendered. 「預覽公開版本」 is
 * worthless if the preview and the publish can disagree, so both read
 * `publishableItems` and nothing here re-implements a rule.
 *
 * Nothing is published by opening this. The switches and the visibility are
 * held locally until 發布 is pressed, so a tap on 公開 does not quietly put a
 * list on the internet while somebody is still reading the options.
 */

interface Props {
  collection: SavedCollection;
  /** The owner's saved places, in the order they will be published. */
  places: SavedTravelInspiration[];
  /** Where this app is served from, for building the link. */
  origin: string;
  onClose: () => void;
  /** Publishes at this visibility with these switches. */
  onPublish: (collection: SavedCollection) => void;
  /** Takes it back. The places stay; the link stops answering. */
  onUnpublish: (collection: SavedCollection) => void;
}

const CHOICES: Array<{
  value: ShareVisibility;
  label: string;
  detail: string;
  icon: React.ReactNode;
}> = [
  { value: 'public', label: '公開', detail: '任何人都可以查看收藏', icon: <Globe size={15} /> },
  { value: 'link', label: '僅連結', detail: '知道連結的人可以查看', icon: <Link2 size={15} /> },
  { value: 'private', label: '私人', detail: '只有我可以查看', icon: <Lock size={15} /> },
];

const CollectionShareSheet: React.FC<Props> = ({
  collection,
  places,
  origin,
  onClose,
  onPublish,
  onUnpublish,
}) => {
  const [visibility, setVisibility] = React.useState<ShareVisibility>(collection.visibility);
  const [sharesOwnNotes, setSharesOwnNotes] = React.useState(collection.sharesOwnNotes !== false);
  const [sharesPhotos, setSharesPhotos] = React.useState(collection.sharesPhotos !== false);
  const [sharesPlaceDetails, setSharesPlaceDetails] = React.useState(collection.sharesPlaceDetails !== false);
  const [previewing, setPreviewing] = React.useState(false);

  /*
    What publishing would produce, from the same function that publishes.
    Recomputed as the switches move, so the preview answers for the settings
    on screen rather than for the ones last saved.
  */
  const draft: SavedCollection = {
    ...collection, visibility, sharesOwnNotes, sharesPhotos, sharesPlaceDetails,
  };
  const items = React.useMemo(
    () => publishableItems(places, draft, (() => { let n = 0; return () => `preview-${n += 1}`; })()),
    [places, collection.id, collection.ownerId, sharesOwnNotes, sharesPhotos, sharesPlaceDetails],
  );

  /*
    How many notes are the owner's, against how many the places carry.

    Said out loud because it is the rule most likely to surprise: a place
    saved from somebody's post carries *their* sentence about it, and that
    sentence is theirs to publish. Seeing 「12 則裡有 3 則是你寫的」 is the
    difference between a feature and a disappointment.
  */
  const noteCount = places.reduce((sum, place) => sum + (place.notes?.length ?? 0), 0);
  const ownCount = places.reduce(
    (sum, place) => sum + ownNotes(place.notes ?? [], collection.ownerId).length,
    0,
  );

  const link = shareLinkFor({ ...draft, publishedAt: collection.publishedAt ?? 'preview' }, origin);
  const live = isPublished(collection);

  const toggle = (
    id: string,
    label: string,
    value: boolean,
    set: (next: boolean) => void,
    hint?: string,
  ) => (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      data-testid={`collection-switch-${id}`}
      onClick={() => set(!value)}
      className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-[#11183d]">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-[#5b3df5]' : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );

  return (
    <div className="space-y-4" data-testid="collection-share-sheet">
      <div className="rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
        <h2 className="text-lg font-black text-[#11183d]">分享設定</h2>
        <p className="mt-0.5 text-[12px] text-slate-400">{collection.title}・{places.length} 個地點</p>

        <h3 className="mt-4 text-[13px] font-black text-[#11183d]">公開範圍</h3>
        <div className="mt-2 space-y-2">
          {CHOICES.map(choice => (
            <button
              key={choice.value}
              type="button"
              data-testid={`collection-visibility-${choice.value}`}
              aria-pressed={visibility === choice.value}
              onClick={() => setVisibility(choice.value)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ${
                visibility === choice.value
                  ? 'bg-violet-50 text-[#5b3df5] ring-violet-300'
                  : 'bg-white text-slate-600 ring-slate-200'
              }`}
            >
              {choice.icon}
              <span className="min-w-0">
                <span className="block text-[13px] font-black">{choice.label}</span>
                <span className="block text-[11px] text-slate-400">{choice.detail}</span>
              </span>
            </button>
          ))}
        </div>

        <h3 className="mt-4 text-[13px] font-black text-[#11183d]">公開內容</h3>
        <div className="divide-y divide-slate-100">
          {toggle('notes', '我撰寫的心得筆記', sharesOwnNotes, setSharesOwnNotes,
            noteCount > ownCount
              ? `這些地點共有 ${noteCount} 則筆記，其中 ${ownCount} 則是你寫的。別人寫的不會公開。`
              : undefined)}
          {toggle('photos', '照片（我上傳的）', sharesPhotos, setSharesPhotos)}
          {toggle('details', '餐廳與景點資訊', sharesPlaceDetails, setSharesPlaceDetails,
            '地址、座標、分類。關掉之後地點名稱和城市仍然看得到。')}
        </div>
      </div>

      {previewing && (
        <div className="rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]" data-testid="collection-preview">
          <h2 className="text-[15px] font-black text-[#11183d]">預覽公開版本</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">這就是別人會看到的內容，一字不差。</p>
          <ul className="mt-3 space-y-2">
            {items.map(item => (
              <li key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[13px] font-bold text-[#11183d]">{item.placeName}</p>
                <p className="text-[11px] text-slate-400">
                  {[item.city, item.country, item.formattedAddress].filter(Boolean).join('・') || '—'}
                </p>
                {item.notes.map(note => (
                  <p key={note.id} className="mt-1 text-[11px] text-slate-500">{note.text}</p>
                ))}
              </li>
            ))}
          </ul>
          {items.length === 0 && (
            <p className="mt-2 text-[12px] text-slate-400">這個收藏集還沒有地點可以公開。</p>
          )}
        </div>
      )}

      {live && link && (
        <div className="rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]" data-testid="collection-live-link">
          <p className="text-[13px] font-black text-[#11183d]">已公開</p>
          <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <QRCodeSVG value={link} size={132} level="M" includeMargin={false} />
          </div>
          <div className="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{link}</div>
          <div className="mt-2 flex gap-2">
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                type="button"
                data-testid="collection-share-link"
                onClick={() => { void navigator.share({ url: link, text: collection.title }).catch(() => undefined); }}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-xs font-black text-white"
              >
                <Share2 size={14} />分享
              </button>
            )}
            <button
              type="button"
              data-testid="collection-copy-link"
              onClick={() => { void navigator.clipboard?.writeText(link).catch(() => undefined); }}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-white text-xs font-black text-[#5b3df5] ring-1 ring-violet-200"
            >
              <Copy size={14} />複製
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="collection-preview-toggle"
          onClick={() => setPreviewing(current => !current)}
          className="min-h-12 flex-1 rounded-xl bg-white text-[13px] font-black text-[#5b3df5] ring-1 ring-violet-200"
        >
          {previewing ? '收起預覽' : '預覽公開版本'}
        </button>
        {visibility === 'private' ? (
          <button
            type="button"
            data-testid="collection-unpublish"
            disabled={!live}
            onClick={() => { onUnpublish(collection); onClose(); }}
            className="min-h-12 flex-1 rounded-xl bg-slate-100 text-[13px] font-black text-slate-500 disabled:opacity-50"
          >
            {live ? '取消公開' : '目前是私人'}
          </button>
        ) : (
          <button
            type="button"
            data-testid="collection-publish"
            onClick={() => { onPublish(draft); onClose(); }}
            className="min-h-12 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white"
          >
            {live ? '更新公開內容' : '發布'}
          </button>
        )}
      </div>
    </div>
  );
};

export default CollectionShareSheet;
