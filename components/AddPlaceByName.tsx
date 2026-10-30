import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  /**
   * What to put in the box when it opens.
   *
   * A receipt already carries the shop's name and the address it printed;
   * retyping them to look up the place they describe is work the screen can
   * do. The list of candidates still appears — a silent binding is what this
   * component has always refused, and a receipt that resolved to the wrong
   * shop would be worse than one that resolved to none.
   */
  defaultQuery?: string;
  /** Run the search as soon as it opens, when the query came from a record. */
  searchOnOpen?: boolean;
}

const AddPlaceByName: React.FC<Props> = ({
  context, onAdd, label, defaultQuery = '', searchOnOpen = false,
}) => {
  const { t } = useTranslation();
  // A default argument is evaluated before `t` exists, and a module-scope
  // constant would freeze the language at import; resolved here instead.
  const buttonLabel = label ?? t('placePicker.addManually');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
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
  const runSearch = async (override?: string) => {
    const typed = (override ?? query).trim();
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
        setError(t('placePicker.linkWouldNotExpand'));
        return;
      }

      if (input.kind === 'position') {
        // A pin with no name. Nothing to search for, and a guessed name would
        // be worse than saying so.
        setResults([]);
        setError(t('placePicker.linkHasNoName'));
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
          ? t('placePicker.linkNameNotFound')
          : t('saved.rebindNoResults'));
      }
    } catch {
      setError(t('saved.rebindFailed'));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (candidate: PlaceCandidate) => {
    setBusy(true);
    try {
      const resolved = await resolveCandidate(candidate);
      if (!resolved) { setError(t('saved.candidateUnreadable')); return; }
      onAdd(resolved);
      setOpen(false);
      setQuery('');
      setResults([]);
    } catch {
      setError(t('saved.candidateUnreadable'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="open-add-place"
        onClick={() => {
          setOpen(true);
          setError('');
          if (searchOnOpen && defaultQuery.trim()) void runSearch(defaultQuery);
        }}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50/50 px-3 text-xs font-black text-[#5b3df5]"
      >
        <Plus size={14} />{buttonLabel}
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
          placeholder={t('placePicker.manualInputPlaceholder')}
          aria-label={buttonLabel}
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
          {busy ? t('saved.searching') : t('saved.search')}
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
        {t('common.cancel')}
      </button>
    </div>
  );
};

export default AddPlaceByName;
