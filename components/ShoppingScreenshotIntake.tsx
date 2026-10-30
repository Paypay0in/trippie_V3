import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, Image as ImageIcon, Loader2, Pencil, ShoppingBag, Sparkles } from 'lucide-react';
import { ShoppingItem } from '../types';
import { readAndDownscale, SHOPPING_THUMB } from '../services/postPhotos';
import { findProductImage } from '../services/productImageService';
import {
  candidateDetail,
  candidateToShoppingItem,
  readShoppingFromImage,
  ShoppingCandidate,
} from '../services/shoppingFromScreenshots';

/**
 * Screenshots in, shopping list out.
 *
 * 「上傳截圖 → AI 辨識整理 → 加入購物清單」. The three steps are one screen
 * rather than three, because they are one errand: a traveller who has just
 * picked eight pictures does not want to be navigated.
 *
 * Nothing is written until it is ticked. The model is guessing at the size and
 * the shop far more often than at the name, so everything it is unsure of is
 * marked 待確認 and every row is shown, selected and edited by hand — the same
 * rule `ScreenshotItineraryIntake` works to.
 */

/** Ten at once, like the itinerary intake. Beyond that it is a scrape. */
const MAX_SCREENSHOTS = 10;

interface Props {
  phase: ShoppingItem['phase'];
  makeId: () => string;
  /** Adds the ticked rows. The caller owns the merge and the persistence. */
  onAdd: (items: ShoppingItem[]) => void;
}

const ShoppingScreenshotIntake: React.FC<Props> = ({ phase, makeId, onAdd }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  /*
    A separate input, because 拍照 and 從相簿選擇 differ only by `capture` and
    an input cannot change its mind about that once it is open.
  */
  const cameraRef = useRef<HTMLInputElement>(null);
  /** Which row is being corrected. 「調整不正確的內容」. */
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [found, setFound] = useState<ShoppingCandidate[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [shots, setShots] = useState(0);

  const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });

  const handleFiles = async (files: File[]) => {
    setError('');
    setFound([]);
    setChosen(new Set());
    setBusy(true);
    const batch = files.slice(0, MAX_SCREENSHOTS);
    setShots(batch.length);
    setProgress({ done: 0, total: batch.length });

    const collected: ShoppingCandidate[] = [];
    const failures: string[] = [];

    try {
      for (const [index, file] of batch.entries()) {
        try {
          /*
            「要找圖片」 — the picture every row from this screenshot carries.
            Downscaled hard: it is shown at 40px on a list row and lives in
            localStorage, which a full device has already proven is not free.
            A failure to make a thumbnail never costs the reading.
          */
          const thumb = await readAndDownscale(file, SHOPPING_THUMB).catch(() => undefined);
          const read = await readShoppingFromImage({
            base64Data: await readAsBase64(file),
            mimeType: file.type,
            seed: `shot${index}`,
            photo: thumb,
          });
          /*
            The same bottle screenshotted twice is one bottle. Across the batch
            as well as within one picture — a list saved in a chat thread and
            again in a post is the common case, not the edge.
          */
          read.forEach(candidate => {
            const key = candidate.name.trim().toLocaleLowerCase();
            if (collected.some(seen => seen.name.trim().toLocaleLowerCase() === key)) return;
            collected.push(candidate);
          });
        } catch (failure) {
          failures.push((failure as Error)?.message || t('shopping.screenshotIntake.oneUnreadable'));
        }
        setProgress({ done: index + 1, total: batch.length });
      }

      setFound(collected);
      // Everything found is ticked: the traveller chose these pictures, and
      // unticking three is less work than ticking six.
      setChosen(new Set(collected.map(candidate => candidate.id)));
      if (collected.length === 0) {
        setError(failures[0] || t('shopping.screenshotIntake.nothingFound'));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  /*
    Corrections, before anything is written. 「請確認以下結果，並調整不正確的
    內容」 — the model misreads a size or a shop often enough that a list which
    can only be accepted or rejected wastes the eight pictures it just read.
  */
  const edit = (id: string, patch: Partial<ShoppingCandidate>) =>
    setFound(current => current.map(row => (row.id === id ? { ...row, ...patch } : row)));

  const toggle = (id: string) => setChosen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [findingImages, setFindingImages] = useState(false);

  /*
    A product photograph for every row, looked up as they are added.

    「即使有截圖也不好用」 — a 小紅書 post photographed on a phone shows where
    the thing was seen, not what it looks like: captions across it, three
    other products beside it, somebody's thumb. On a shelf, hunting one
    bottle, that is nearly useless.

    Looked up together rather than one at a time when somebody presses a
    button per row, because adding eight things and then pressing eight
    buttons is the errand this screen exists to remove.

    Every lookup is allowed to fail on its own: the screenshot stays as the
    fallback, so a product nothing could be found for keeps the only record
    of where it came from.
  */
  const add = async () => {
    const picked = found.filter(candidate => chosen.has(candidate.id));
    if (picked.length === 0) return;

    setFindingImages(true);
    const images = await Promise.all(picked.map(candidate =>
      findProductImage({ name: candidate.name, brand: candidate.brand }).catch(() => null),
    ));
    setFindingImages(false);

    onAdd(picked.map((candidate, at) =>
      candidateToShoppingItem(candidate, phase, makeId, images[at])));
    setFound([]);
    setChosen(new Set());
    setShots(0);
  };

  return (
    <div data-testid="shopping-screenshot-intake" className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="shopping-screenshot-input"
        onChange={event => { void handleFiles(Array.from(event.target.files || [])); }}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="shopping-screenshot-camera-input"
        onChange={event => { void handleFiles(Array.from(event.target.files || [])); }}
        className="hidden"
      />

      {found.length === 0 ? (
        <>
          <div className="flex items-center gap-2 text-[11px] font-black text-[#5b3df5]">
            <Sparkles size={13} />{t('shopping.screenshotIntake.title')}
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            {t('shopping.screenshotIntake.blurb', { max: MAX_SCREENSHOTS })}
          </p>
          <button
            type="button"
            data-testid="shopping-screenshot-pick"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-xs font-black text-white disabled:opacity-60"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" />{t('itinerary.screenshotIntake.readingProgress', { done: progress.done, total: progress.total })}</>
              : <><ImageIcon size={14} />{t('shopping.screenshotIntake.pickPhotos')}</>}
          </button>

          {/*
            拍照 and 從相簿選擇, which are the same input with and without
            `capture`. 從連結匯入 and 從其他 App 分享 are not here: a link needs
            a page fetched and read, and a share target needs the app
            installed as a PWA with a manifest entry — both are real features
            rather than buttons, and a tile that opens nothing is the dead tap
            this app keeps deleting.
          */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="shopping-screenshot-camera"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white text-[11px] font-black text-[#5b3df5] disabled:opacity-60"
            >
              <Camera size={13} />{t('shopping.screenshotIntake.camera')}
            </button>
            <button
              type="button"
              data-testid="shopping-screenshot-album"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white text-[11px] font-black text-[#5b3df5] disabled:opacity-60"
            >
              <ImageIcon size={13} />{t('shopping.screenshotIntake.album')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-[11px] font-black text-[#5b3df5]">
            <Sparkles size={13} />
            {t('shopping.screenshotIntake.foundCount', { shots, found: found.length })}
          </div>
          {/*
            Said before the list, not after it. The model is guessing at the
            size and the shop far more often than at the name, and a reader
            who has been told that reads the 待確認 marks as information
            rather than as clutter.
          */}
          <p className="mt-1 text-[10px] leading-4 text-slate-500">{t('shopping.screenshotIntake.confirmBlurb')}</p>

          <div className="mt-2 space-y-1.5">
            {found.map(candidate => (
              <div
                key={candidate.id}
                className={`rounded-xl border p-2 ${
                  chosen.has(candidate.id) ? 'border-violet-200 bg-white' : 'border-slate-100 bg-white/60 opacity-60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    data-testid={`shopping-candidate-${candidate.id}`}
                    aria-pressed={chosen.has(candidate.id)}
                    onClick={() => toggle(candidate.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                      chosen.has(candidate.id) ? 'bg-[#5b3df5] text-white' : 'border border-slate-300'
                    }`}>
                      {chosen.has(candidate.id) && <Check size={11} />}
                    </span>
                    {candidate.photo && (
                      <img
                        src={candidate.photo}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-black text-[#11183d]">{candidate.name}</span>
                      {candidateDetail(candidate) && (
                        <span className="mt-0.5 block text-[10px] text-slate-500">
                          {candidateDetail(candidate)}
                          <span className="ml-1 text-slate-400">{t('shopping.screenshotIntake.unconfirmed')}</span>
                        </span>
                      )}
                      <span className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                        {/* i18n-data: the category and shop are model-returned text about the traveller's screenshot, not product copy. */}
                        {candidate.category && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 font-bold text-violet-600">{candidate.category}</span>
                        )}
                        {candidate.shop && <span>{t('shopping.screenshotIntake.atShopUnconfirmed', { shop: candidate.shop })}</span>}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('shopping.screenshotIntake.editNamed', { name: candidate.name })}
                    data-testid={`shopping-candidate-edit-${candidate.id}`}
                    onClick={() => setEditing(editing === candidate.id ? null : candidate.id)}
                    className="shrink-0 p-1 text-slate-400"
                  >
                    <Pencil size={13} />
                  </button>
                </div>

                {/*
                  Corrected before anything is written. 「請確認以下結果，並調整
                  不正確的內容」 — a reading that can only be accepted or
                  rejected wastes the eight pictures it just read when one
                  field is wrong.
                */}
                {editing === candidate.id && (
                  <div data-testid={`shopping-candidate-fields-${candidate.id}`} className="mt-2 space-y-1.5">
                    {([
                      ['name', 'shopping.screenshotIntake.fieldName'],
                      ['brand', 'shopping.screenshotIntake.fieldBrand'],
                      ['spec', 'shopping.screenshotIntake.fieldSpec'],
                      ['shop', 'shopping.screenshotIntake.fieldShop'],
                    ] as const).map(([field, labelKey]) => (
                      <label key={field} className="block">
                        <span className="block text-[10px] font-bold text-slate-400">{t(labelKey)}</span>
                        <input
                          value={candidate[field] ?? ''}
                          aria-label={`${candidate.name} ${t(labelKey)}`}
                          data-testid={`shopping-candidate-${field}-${candidate.id}`}
                          onChange={event => edit(candidate.id, { [field]: event.target.value } as Partial<ShoppingCandidate>)}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-[#11183d] outline-none"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span data-testid="shopping-candidates-count" className="text-[11px] font-bold text-slate-500">
              {t('shopping.screenshotIntake.selectedCount', { n: chosen.size })}
            </span>
          </div>

          <button
            type="button"
            data-testid="shopping-candidates-add"
            disabled={chosen.size === 0 || findingImages}
            onClick={() => { void add(); }}
            className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-xs font-black text-white disabled:bg-slate-200 disabled:bg-none disabled:text-slate-400"
          >
            <ShoppingBag size={14} />
            {findingImages
              ? t('shopping.screenshotIntake.findingImages')
              : t('shopping.screenshotIntake.addToList', { n: chosen.size })}
          </button>
        </>
      )}

      {error && <p className="mt-1.5 text-[10px] font-bold text-amber-600">{error}</p>}
    </div>
  );
};

export default ShoppingScreenshotIntake;
