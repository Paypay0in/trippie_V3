import React from 'react';
import { Camera, Lock, NotebookPen, X } from 'lucide-react';
import { RECEIPT_PHOTO, addPhotos, readAndDownscale, removePhoto } from '../services/postPhotos';

/**
 * 我的紀錄 — what this traveller wants to remember about a place.
 *
 * 「這家店是分帳 因此我沒有原始帳目的紀錄 我就就不能傳圖跟做備注」. The bill
 * belongs to whoever paid it and must not be writable by anybody else; the
 * consequence was that a meal a friend paid for left the person who ate it
 * nowhere to put a photograph.
 *
 * So this is deliberately about the place and not about the money. It exists
 * whether or not there is a bill, whether or not the place was ever on an
 * itinerary, and whoever put the card down.
 *
 * Private, and said so on the screen rather than only in the row policy. A
 * person deciding whether to write something honest about a restaurant their
 * friend chose should not have to guess who can read it.
 */

interface Props {
  text: string;
  photos: string[];
  /** Absent and this is read-only, like every other panel in this app. */
  onSave?: (next: { text: string; photos: string[] }) => void;
}

const MyPlaceRecord: React.FC<Props> = ({ text, photos, onSave }) => {
  const [writing, setWriting] = React.useState(false);
  const [draft, setDraft] = React.useState(text);
  const [shots, setShots] = React.useState(photos);
  const [busy, setBusy] = React.useState(false);

  const empty = !text.trim() && photos.length === 0;

  const begin = () => {
    setDraft(text);
    setShots(photos);
    setWriting(true);
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    try {
      /*
        Downscaled on the way in, at the size receipts already use. These end
        up in a jsonb column and then on somebody's phone; a 4MB photograph
        of a coffee is a cost paid forever for detail nobody will look at.
      */
      const read = await Promise.all(files.map(file => readAndDownscale(file, RECEIPT_PHOTO)));
      setShots(current => addPhotos(current, read).photos);
    } finally {
      setBusy(false);
    }
  };

  if (!writing) {
    return (
      <div className="mt-3" data-testid="my-place-record">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] font-black text-[#5b3df5]">
            <NotebookPen size={12} />我的紀錄
          </span>
          {/* Said on the screen, not only in the row policy. */}
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-400">
            <Lock size={10} />只有你看得到
          </span>
        </div>

        {empty ? (
          <button
            type="button"
            data-testid="my-place-record-start"
            disabled={!onSave}
            onClick={begin}
            className="mt-1.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-violet-200 text-[11px] font-black text-[#5b3df5] disabled:opacity-50"
          >
            <Camera size={12} />寫點什麼、放幾張照片
          </button>
        ) : (
          <button
            type="button"
            data-testid="my-place-record-edit"
            disabled={!onSave}
            onClick={begin}
            className="mt-1.5 w-full rounded-2xl bg-violet-50/60 p-2.5 text-left disabled:opacity-70"
          >
            {photos.length > 0 && (
              <span className="mb-1.5 flex gap-1.5 overflow-x-auto">
                {photos.map(shot => (
                  <img key={shot} src={shot} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ))}
              </span>
            )}
            {text.trim() && (
              <span className="block whitespace-pre-wrap break-words text-[12px] leading-5 text-slate-700">
                {text}
              </span>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-2.5" data-testid="my-place-record-form">
      <span className="flex items-center gap-1 text-[11px] font-black text-[#5b3df5]">
        <NotebookPen size={12} />我的紀錄
      </span>

      {shots.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {shots.map(shot => (
            <span key={shot} className="relative shrink-0">
              <img src={shot} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button
                type="button"
                aria-label="移除照片"
                data-testid={`my-place-record-remove-${shots.indexOf(shot)}`}
                onClick={() => setShots(current => removePhoto(current, shot))}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-500 shadow"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white text-[11px] font-black text-[#5b3df5] ring-1 ring-violet-200">
        <Camera size={12} />{busy ? '處理中…' : '加照片'}
        <input type="file" accept="image/*" multiple className="hidden" onChange={pick} data-testid="my-place-record-photos" />
      </label>

      <textarea
        rows={3}
        maxLength={500}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder="那天吃了什麼、跟誰去的、想記得什麼"
        aria-label="我的紀錄"
        className="mt-2 w-full rounded-xl bg-white px-2.5 py-2 text-[12px] leading-5 outline-none"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid="my-place-record-cancel"
          onClick={() => setWriting(false)}
          className="min-h-10 flex-1 rounded-xl bg-white text-[11px] font-black text-slate-500"
        >
          取消
        </button>
        <button
          type="button"
          data-testid="my-place-record-save"
          onClick={() => { onSave?.({ text: draft.trim(), photos: shots }); setWriting(false); }}
          className="min-h-10 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[11px] font-black text-white"
        >
          {/* Emptied means deleted, which the writer already implements. */}
          {!draft.trim() && shots.length === 0 ? '清除紀錄' : '儲存'}
        </button>
      </div>
    </div>
  );
};

export default MyPlaceRecord;
