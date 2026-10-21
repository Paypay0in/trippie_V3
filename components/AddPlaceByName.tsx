import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  expandMapsShortLink,
  findPlaceCandidates,
  PlaceCandidate,
  ResolvedCandidate,
  resolveCandidate,
} from '../services/placeCandidates';
import { readMapsInput } from '../services/mapsLinkInput';

/**
 * 手動新增地點 — a name, an address, or a link somebody shared.
 *
 * 「這裡也要可以手動與讀取截圖來加入旅行靈感」. This existed on the trip's
 * planning screen and nowhere else, so the collection — the screen whose whole
 * job is holding saved places — had no way to add one.
 *
 * Lifted out whole rather than copied across. Seventy lines of UI and five
 * pieces of state reproduced on a second screen is how two boxes start
 * answering 「what did you mean by that link」 differently, and this file has
 * spent the last two days undoing exactly that shape.
 */

export interface AddPlaceSearchContext {
  /** The city to bias the search towards, when there is one. */
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface Props {
  context: AddPlaceSearchContext;
  onAdd: (resolved: ResolvedCandidate) => void;
  /** 手動新增地點, unless a screen wants to say it differently. */
  label?: string;
}

const AddPlaceByName: React.FC<Props> = ({ context, onAdd, label = '手動新增地點' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /*
    「我希望他可以即使輸入地址或是 google map 連結都可以帶入」 — and a link is how
    places are actually passed between people. This box used to send whatever
    it was given to autocomplete as a shop name, so a pasted
    `https://maps.app.goo.gl/…` searched for that literal string and found
    nothing at all.

    The results are still a list to choose from rather than a silent binding:
    `placeCandidates` explains why, and a link changes nothing about that —
    what it changes is that the search is given the place's name and the spot
    it sits on instead of a URL.
  */
  const runSearch = async () => {
    const typed = query.trim();
    if (!typed) return;
    setBusy(true);
    setError('');
    try {
      const pasted = readMapsInput(typed);
      // Only the server can follow a short link; see `expandMapsShortLink`.
      const input = pasted.kind === 'shortLink'
        ? readMapsInput(await expandMapsShortLink(pasted.url))
        : pasted;

      if (input.kind === 'shortLink') {
        // Expanded into another short link, i.e. it did not expand at all.
        setResults([]);
        setError('這個連結展不開，請改貼完整網址或直接打店名。');
        return;
      }

      if (input.kind === 'position') {
        // A pin with no name. Nothing to search for, and a guessed name would
        // be worse than saying so.
        setResults([]);
        setError('這個連結只有座標沒有店名，請加上店名再搜尋。');
        return;
      }

      const found = await findPlaceCandidates(input.query, {
        city: context.city,
        country: context.country,
        // The link's own spot wins over the screen's centre: a shared pin is
        // exactly where the place is, and a city is a whole city.
        latitude: input.kind === 'link' && input.latitude !== undefined
          ? input.latitude : context.latitude,
        longitude: input.kind === 'link' && input.longitude !== undefined
          ? input.longitude : context.longitude,
      });
      setResults(found);
      if (found.length === 0) {
        setError(input.kind === 'link'
          ? '這個連結讀得到店名，但查不到對應的地點，換個說法試試。'
          : '找不到這個地點，換個說法試試。');
      }
    } catch {
      setError('現在查不到，請稍後再試。');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (candidate: PlaceCandidate) => {
    setBusy(true);
    try {
      const resolved = await resolveCandidate(candidate);
      if (!resolved) { setError('這個地點的資料讀不到，換一個試試。'); return; }
      onAdd(resolved);
      setOpen(false);
      setQuery('');
      setResults([]);
    } catch {
      setError('這個地點的資料讀不到，換一個試試。');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="open-add-place"
        onClick={() => { setOpen(true); setError(''); }}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50/50 px-3 text-xs font-black text-[#5b3df5]"
      >
        <Plus size={14} />{label}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-2.5">
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void runSearch(); }}
          placeholder="店名、地址，或貼上 Google 地圖連結"
          aria-label={label}
          data-testid="add-place-input"
          className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-bold text-[#11183d] outline-none"
        />
        <button
          type="button"
          data-testid="add-place-search"
          onClick={() => void runSearch()}
          disabled={busy}
          className="shrink-0 rounded-xl bg-[#5b3df5] px-3 text-xs font-black text-white disabled:opacity-50"
        >
          {busy ? '搜尋中' : '搜尋'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] font-bold text-amber-600">{error}</p>}
      {results.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.map(candidate => (
            <button
              type="button"
              key={candidate.placeId}
              data-testid={`add-place-pick-${candidate.placeId}`}
              onClick={() => void choose(candidate)}
              className="block w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left"
            >
              <span className="block text-xs font-black text-[#11183d]">{candidate.name}</span>
              {candidate.detail && <span className="mt-0.5 block text-[10px] text-slate-500">{candidate.detail}</span>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => { setOpen(false); setResults([]); setError(''); }}
        className="mt-2 text-[11px] font-black text-slate-500"
      >
        取消
      </button>
    </div>
  );
};

export default AddPlaceByName;
