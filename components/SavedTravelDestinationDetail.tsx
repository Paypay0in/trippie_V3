import React, { useEffect, useMemo, useState } from 'react';
import { OVERLAY } from '../constants/layers';
import { Ellipsis, MapPin, Plus } from 'lucide-react';
import { CommunityPost, SavedExperienceNote, SavedTravelInspiration } from '../types';
import { DestinationImage, fetchDestinationImage } from '../services/destinationImageService';
import { resolveSavedPlaceImage, SavedPlaceImageResult } from '../services/savedPlaceImageService';
import { clusterSavedPlaces } from '../services/placeClusters';
import { AREA_COLORS } from '../constants/areaColors';
import { countryDisplayName } from '../services/countryIdentity';
import { cityDisplayName } from '../services/cityNames';
import { placeWhereLabel } from '../services/placeWhereLabel';
import SavedPlaceCard from './SavedPlaceCard';
import { fetchPlaceBasics, summarizePlaceBasics } from '../services/placeBasicsService';
import { findPlaceCandidates, PlaceCandidate, ResolvedCandidate, resolveCandidate } from '../services/placeCandidates';

type Props = {
  country: string;
  city: string;
  items: SavedTravelInspiration[];
  communityPosts: CommunityPost[];
  onBack: () => void;
  onRemove: (itemId: string) => void;
  onResolveItem: (item: SavedTravelInspiration) => Promise<void>;
  onOpenCommunityPost: (postId?: string) => void;
  /** Opens the existing Create Trip flow with this destination prefilled. */
  onCreateTrip: (country: string, city: string) => void;
  /**
   * Rewrites the notes saved against one place.
   *
   * 「點編輯沒有反應」 — 「編輯收藏內容」 closed the menu and did nothing else. It
   * had the label, the description and the hover state of a working control.
   *
   * Whole list in, whole list out: a note is edited, emptied or added, and the
   * screen that shows them is the one that knows what the traveller just did.
   */
  onUpdateNotes?: (inspirationId: string, notes: SavedExperienceNote[]) => void;
  /**
   * Points a saved place at a different place on the map.
   *
   * 「這在釜山 我無法改」 — everything built to repair these records asked 「is
   * anything missing?」, and a record bound to the wrong place is missing
   * nothing. It had an id, an address and a city, all of Vancouver, so the
   * search that would have fixed it was hidden on the grounds that it was
   * already complete.
   *
   * Being wrong is not a state the app can detect. It is one the traveller can
   * see at a glance, so the way to correct it belongs on every card, not only
   * on the ones that look unfinished.
   */
  onRebindPlace?: (inspirationId: string, resolved: ResolvedCandidate) => void;
};

const PlaceThumbnail: React.FC<{ saved: SavedTravelInspiration; sourcePost?: CommunityPost }> = ({ saved, sourcePost }) => {
  const [imageResult, setImageResult] = useState<SavedPlaceImageResult | null>(sourcePost?.coverImage ? { imageUrl: sourcePost.coverImage, source: 'source_post', query: saved.placeName } : null);
  const [loading, setLoading] = useState(!sourcePost?.coverImage);
  useEffect(() => {
    let active = true;
    if (sourcePost?.coverImage) return () => { active = false; };
    setLoading(true);
    resolveSavedPlaceImage(saved, sourcePost).then(result => { if (active) { setImageResult(result); setLoading(false); } });
    return () => { active = false; };
  }, [saved, sourcePost]);
  const fallback = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=500&q=80';
  const imageUrl = imageResult?.imageUrl || fallback;
  return <div className="shrink-0"><div className="relative h-[112px] w-[112px]">{loading ? <div className="h-full w-full animate-pulse rounded-[14px] bg-slate-100" aria-label="圖片載入中" /> : <img src={imageUrl} alt={saved.placeName} className="h-full w-full rounded-[14px] object-cover" />}</div></div>;
};

/**
 * How many notes a card shows before folding the rest away.
 *
 * 「資訊重複的太多了」 — nine notes on one restaurant, several of them restating
 * the opening hours in a different script, made a card taller than the screen.
 * Four is enough to see what kind of place it is without scrolling past it.
 */
const NOTE_PREVIEW = 4;

const SavedTravelDestinationDetail: React.FC<Props> = ({ country, city, items, communityPosts, onBack, onRemove, onResolveItem, onOpenCommunityPost, onCreateTrip, onUpdateNotes, onRebindPlace }) => {
  /*
    「收藏裡也要分區」 — the same clusterer the planner uses, so an area is one
    area on both screens rather than two screens each inventing their own.
  */
  const { ordered, areaOf } = useMemo(() => {
    const { clusters, unlocated } = clusterSavedPlaces(
      items.map(item => ({
        id: item.id,
        placeName: item.placeName,
        latitude: item.latitude,
        longitude: item.longitude,
        formattedAddress: item.formattedAddress,
        district: item.district,
      })),
      undefined,
      country,
    );

    const byId = new Map<string, { label: string; colorIndex: number }>();
    clusters.forEach(cluster =>
      cluster.places.forEach(place => byId.set(place.id, { label: cluster.label, colorIndex: cluster.colorIndex })));

    // Clustered first, in cluster order; the places with no position last,
    // under their own heading rather than scattered through the areas.
    const placed = clusters.flatMap(cluster =>
      cluster.places.map(place => items.find(item => item.id === place.id)!).filter(Boolean));
    const rest = unlocated.map(place => items.find(item => item.id === place.id)!).filter(Boolean);

    return { ordered: [...placed, ...rest], areaOf: byId };
  }, [items, country]);

  /*
    「點下去要有地圖資訊」 — the card carried a 「⋯」 menu and nothing else, so the
    one thing a saved place is for, going to it, was not on it.

    The same sheet the itinerary and the planner already open. A third design
    for 「what is this place」 would be a third set of navigation buttons to keep
    in step, and the Korean provider rule lives inside this one.
  */
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);
  /** The place whose notes are being rewritten, and the working copy. */
  const [editing, setEditing] = useState<{ id: string; drafts: SavedExperienceNote[] } | null>(null);

  /** The card being re-pointed, what is being searched for, and what came back. */
  const [rebinding, setRebinding] = useState<{ id: string; query: string } | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [rebindBusy, setRebindBusy] = useState(false);
  const [rebindError, setRebindError] = useState('');

  const runRebindSearch = async (item: SavedTravelInspiration, typed: string) => {
    const text = typed.trim();
    if (!text) return;
    setRebindBusy(true);
    setRebindError('');
    try {
      /*
        Searched in the record's own country, not the screen's. A place filed
        under the wrong country is exactly the case being repaired, so the
        country on it is the least trustworthy thing about it — the screen's
        is the one the traveller navigated into.
      */
      const found = await findPlaceCandidates(text, { country });
      setCandidates(found);
      if (found.length === 0) setRebindError('找不到這個地點，換個說法試試。');
    } catch {
      setRebindError('現在查不到，請稍後再試。');
    } finally {
      setRebindBusy(false);
    }
  };

  /*
    What Google already knows about a place nobody wrote anything about.

    「像這樣的旅行筆記 能請AI整理一些小重點嗎，至少寫是什麼餐廳」 — and 「什麼餐廳」
    is a fact Google holds about that exact place id: its category, its rating,
    its price band. The planner has shown this line for months; this screen,
    reading the same records, showed the name and the city and nothing else.

    Not generated. A plausible sentence about a restaurant nobody has checked
    reads exactly like a checked one, which is the reason `placeBasics` was
    written to return only fields Google answered with.

    Only for places with no points of their own: a row that already carries
    what somebody wrote does not need a category line above it.
  */
  const [basicsById, setBasicsById] = useState<Record<string, string>>({});
  const basicsKey = items
    .filter(item => item.notes.length === 0 && item.placeId)
    .map(item => `${item.id}:${item.placeId}`)
    .join('|');

  useEffect(() => {
    if (!basicsKey) return;
    let cancelled = false;
    const wanted = basicsKey.split('|').map(entry => {
      const separator = entry.lastIndexOf(':');
      return { id: entry.slice(0, separator), placeId: entry.slice(separator + 1) };
    });

    void Promise.all(wanted.map(async ({ id, placeId }) => {
      const basics = await fetchPlaceBasics(placeId).catch(() => null);
      const line = summarizePlaceBasics(basics) || basics?.summary || '';
      return line ? [id, line] as const : null;
    })).then(found => {
      if (cancelled) return;
      const resolved = found.filter((entry): entry is readonly [string, string] => entry !== null);
      if (resolved.length > 0) setBasicsById(current => ({ ...current, ...Object.fromEntries(resolved) }));
    });

    return () => { cancelled = true; };
  }, [basicsKey]);

  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  /** Which cards have had their full note list opened. See 「資訊重複的太多了」. */
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SavedTravelInspiration | null>(null);
  const [attemptedResolution, setAttemptedResolution] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const unresolved = items.filter(item => !item.placeId && !attemptedResolution.has(item.id));
    if (!unresolved.length) return;
    setAttemptedResolution(current => new Set([...current, ...unresolved.map(item => item.id)]));
    unresolved.forEach(item => { void onResolveItem(item); });
  }, [items, attemptedResolution, onResolveItem]);

  useEffect(() => {
    let active = true;
    fetchDestinationImage(`${country} ${city}`).then(result => {
      if (active) setImage(result);
    });
    return () => { active = false; };
  }, [country, city]);

  const creatorById = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string }>();
    communityPosts.forEach(post => map.set(post.creatorId, { name: post.authorName, avatar: post.authorAvatar }));
    return map;
  }, [communityPosts]);

  const fallback = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=85';
  const heroImage = image?.imageUrl || fallback;

  return <main className="min-h-screen bg-[#f7f8fc] pb-10 text-[#11183d] md:mx-auto md:max-w-2xl">
    {/*
      The same opt-out as the post detail screen, found by looking for it.

      「滿版不好點」 was reported about one screen; --safe-top-base: 0rem was on
      two. A fault fixed only where it was photographed is a fault still in the
      product, and this one puts a back button under the clock.
    */}
    <header data-safe-top style={{ ["--safe-top-base" as string]: "var(--header-top)" }} className="bg-white px-[var(--screen-pad)] pb-2">
      <button type="button" onClick={onBack} className="-ml-2 flex min-h-11 items-center px-2 text-sm font-black text-violet-600">← 旅行</button>
    </header>
    <section className="relative h-[200px] overflow-hidden">
      <img src={heroImage} alt={`${country}・${city}`} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#11183d]/80 via-transparent to-transparent" />
      <div className="absolute bottom-5 left-5 text-white">
        <h1 className="text-3xl font-black">{countryDisplayName(country)}・{cityDisplayName(city)}</h1>
        <p className="mt-1 text-sm font-semibold text-white/90">{items.length} 則旅行靈感</p>
        <p className="mt-1 text-xs text-white/75">來自你在社群收藏的旅行筆記</p>
      </div>
    </section>
    <section className="px-4 pt-4">
      <button type="button" onClick={() => onCreateTrip(country, city)} className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition active:scale-[.99]">
        <Plus size={17} strokeWidth={3} />建立{cityDisplayName(city)}旅行
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">建立後可在行程規劃中挑選這裡的收藏靈感</p>
    </section>
    <section className="space-y-3 p-4">
      {ordered.map((item, index) => {
        /*
          「收藏裡也要分區」 — the same grouping the planner shows, from the same
          clusterer, so an area is one area on both screens. The heading is
          drawn when the area changes rather than by nesting the list, which
          keeps every card a sibling: they are dragged, removed and opened
          individually.
        */
        const area = areaOf.get(item.id);
        const headingChanged = index === 0 || areaOf.get(ordered[index - 1].id)?.label !== area?.label;
        const areaSize = ordered.filter(entry => areaOf.get(entry.id)?.label === area?.label).length;
        const creator = creatorById.get(item.sourceCreatorId);
        return <React.Fragment key={item.id}>
          {headingChanged && (
            <div data-testid={`saved-area-${area?.label || 'unplaced'}`} className="flex items-center gap-2 pt-1">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${AREA_COLORS[(area?.colorIndex ?? 0) % AREA_COLORS.length].dot}`} />
              <span className="text-xs font-black text-[#11183d]">{area?.label || '還沒定位的地點'}</span>
              <span className="text-[11px] font-bold text-slate-400">{areaSize} 個</span>
            </div>
          )}
          <article className="relative flex gap-3 rounded-[20px] bg-white p-3 shadow-[0_4px_16px_rgba(15,23,42,.06)]">
          <PlaceThumbnail saved={item} sourcePost={communityPosts.find(post => post.id === item.sourcePostId)} />
          <div className="min-w-0 flex-1 pr-5"><h2 className="truncate text-base font-black text-[#11183d]"><button type="button" data-testid={`open-place-${item.id}`} onClick={() => setOpenPlaceId(item.id)} className="text-left">{item.placeName}</button></h2><p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} />{placeWhereLabel(cityDisplayName(item.city), countryDisplayName(item.country))}</p>
          <button type="button" aria-label={`${item.placeName} 更多選項`} onClick={() => setMenuItemId(current => current === item.id ? null : item.id)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50"><Ellipsis size={20} /></button>
          {menuItemId === item.id && <div className="absolute right-3 top-12 z-10 w-48 rounded-2xl border border-slate-100 bg-white p-1.5 text-left shadow-xl">
            <button type="button" data-testid={`edit-notes-${item.id}`} onClick={() => { setEditing({ id: item.id, drafts: item.notes.map(note => ({ ...note })) }); setMenuItemId(null); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-violet-50">編輯收藏內容<span className="mt-0.5 block text-[10px] font-medium text-slate-400">調整這個地點已收藏的旅行經驗</span></button>
            {onRebindPlace && (
              <button
                type="button"
                data-testid={`rebind-${item.id}`}
                onClick={() => {
                  setRebinding({ id: item.id, query: item.placeName });
                  setCandidates([]);
                  setRebindError('');
                  setMenuItemId(null);
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-violet-50"
              >
                重新對應地圖地點<span className="mt-0.5 block text-[10px] font-medium text-slate-400">對到錯的店時，搜尋正確的那家</span>
              </button>
            )}
            <button type="button" onClick={() => { setRemoveTarget(item); setMenuItemId(null); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50">移除這個地點<span className="mt-0.5 block text-[10px] font-medium text-rose-400">從我的旅行筆記移除</span></button>
          </div>}
          {rebinding?.id === item.id && (
            <div data-testid={`rebind-panel-${item.id}`} className="mt-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-2.5">
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={rebinding.query}
                  data-testid={`rebind-input-${item.id}`}
                  onChange={event => setRebinding(current => current && ({ ...current, query: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter') void runRebindSearch(item, rebinding.query); }}
                  placeholder="店名或景點名稱"
                  className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-bold text-[#11183d] outline-none"
                />
                <button
                  type="button"
                  data-testid={`rebind-search-${item.id}`}
                  disabled={rebindBusy}
                  onClick={() => void runRebindSearch(item, rebinding.query)}
                  className="shrink-0 rounded-xl bg-[#5b3df5] px-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {rebindBusy ? '搜尋中' : '搜尋'}
                </button>
              </div>
              {rebindError && <p className="mt-1.5 text-[11px] font-bold text-amber-600">{rebindError}</p>}
              {candidates.length > 0 && (
                <div className="mt-2 space-y-1">
                  {candidates.map(candidate => (
                    <button
                      type="button"
                      key={candidate.placeId}
                      data-testid={`rebind-pick-${candidate.placeId}`}
                      onClick={async () => {
                        const resolved = await resolveCandidate(candidate).catch(() => null);
                        if (!resolved) { setRebindError('這個地點的資料讀不到，換一個試試。'); return; }
                        onRebindPlace?.(item.id, resolved);
                        setRebinding(null);
                        setCandidates([]);
                      }}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left"
                    >
                      <span className="block text-xs font-black text-[#11183d]">{candidate.name}</span>
                      {candidate.detail && <span className="mt-0.5 block text-[10px] text-slate-500">{candidate.detail}</span>}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { setRebinding(null); setCandidates([]); setRebindError(''); }} className="mt-2 text-[11px] font-black text-slate-500">取消</button>
            </div>
          )}
          {item.notes.length === 0 && basicsById[item.id] && (
            <p data-testid={`basics-${item.id}`} className="mt-1.5 text-[11px] font-bold text-slate-500">
              {basicsById[item.id]}
            </p>
          )}
          {/*
            「資訊重複的太多了」. Nine notes on one restaurant, and the same
            「旅 Ann」 chip printed beside every one of them — the chip exists to
            say which of several travellers wrote a note, and it says nothing at
            all when there is only one of them. Said once above the list in that
            case, and the long tail of notes folds away.
          */}
          {(() => {
            const sources = item.notes.map(note => {
              const sourcePost = note.sourcePostId ? communityPosts.find(post => post.id === note.sourcePostId) : undefined;
              return sourcePost ? { name: sourcePost.authorName, avatar: sourcePost.authorAvatar, postId: note.sourcePostId } : { ...(creatorById.get(note.sourceCreatorId) || creator), postId: note.sourcePostId };
            });
            /*
              Compared on identity, not on the rendered name: two creators this
              screen cannot resolve both read 「原作者」, and folding them into one
              line would claim they are the same person.
            */
            const authors = new Set(item.notes.map(note => note.sourcePostId || note.sourceCreatorId || ''));
            const onlyAuthor = authors.size === 1 && item.notes.length > 1 ? sources[0] : null;
            const expanded = openNotes.has(item.id);
            const shown = expanded ? item.notes : item.notes.slice(0, NOTE_PREVIEW);
            return <>
            {onlyAuthor && (
              <button
                type="button"
                data-testid={`notes-author-${item.id}`}
                onClick={(event) => { event.stopPropagation(); onOpenCommunityPost(onlyAuthor.postId); }}
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"
              >
                <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white text-[9px] text-violet-600">{onlyAuthor.avatar ? <img src={onlyAuthor.avatar} alt="" className="h-full w-full object-cover" /> : '旅'}</span>
                {item.notes.length} 則筆記 · 全部來自 {onlyAuthor.name || '原作者'}
              </button>
            )}
          <div className="mt-2 space-y-1.5">
            {shown.map(note => {
              const sourcePost = note.sourcePostId ? communityPosts.find(post => post.id === note.sourcePostId) : undefined;
              const noteCreator = sourcePost ? { name: sourcePost.authorName, avatar: sourcePost.authorAvatar } : creatorById.get(note.sourceCreatorId) || creator;
              return <div key={note.id} className="flex min-w-0 items-start gap-1.5 rounded-lg bg-violet-50/75 px-2 py-1.5 text-xs leading-5 text-slate-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /><p className="min-w-0 flex-1 break-words">{note.text}</p>{!onlyAuthor && <button type="button" aria-label={`查看 ${noteCreator?.name || '原作者'} 的原貼文`} onClick={(event) => { event.stopPropagation(); onOpenCommunityPost(note.sourcePostId); }} className="ml-1 inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-500 transition-opacity hover:opacity-70"><span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white text-[9px] text-violet-600">{noteCreator?.avatar ? <img src={noteCreator.avatar} alt="" className="h-full w-full object-cover" /> : '旅'}</span>{noteCreator?.name || '原作者'}</button>}
              </div>;
            })}
          </div>
            {item.notes.length > NOTE_PREVIEW && (
              <button
                type="button"
                data-testid={`toggle-notes-${item.id}`}
                onClick={(event) => { event.stopPropagation(); setOpenNotes(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }}
                className="mt-1.5 text-[11px] font-black text-violet-600"
              >
                {expanded ? '收合' : `展開其餘 ${item.notes.length - NOTE_PREVIEW} 則`}
              </button>
            )}
            </>;
          })()}
          </div>
        </article>
        </React.Fragment>;
      })}
    </section>
    {(() => {
      const open = items.find(entry => entry.id === openPlaceId);
      if (!open) return null;
      return (
        <SavedPlaceCard
          place={{
            placeName: open.placeName,
            placeId: open.placeId,
            formattedAddress: open.formattedAddress,
            coordinates: open.latitude !== undefined && open.longitude !== undefined
              ? { latitude: open.latitude, longitude: open.longitude }
              : undefined,
            city: open.city,
            country: open.country,
          }}
          notes={open.notes}
          onClose={() => setOpenPlaceId(null)}
        />
      );
    })()}
    {/*
      Editing the points saved against a place.

      「點編輯沒有反應」. A working copy, so 取消 really is a cancel; the list is
      written back whole on 儲存, because that is what the traveller just
      arranged. Empty lines are dropped rather than saved as blank bullets —
      clearing a note is how you delete it, and an empty bullet is nobody's
      intention.
    */}
    {editing && (() => {
      const place = items.find(entry => entry.id === editing.id);
      if (!place) return null;
      return (
        <div className={`fixed inset-0 ${OVERLAY.modal} flex items-end justify-center bg-slate-950/35 sm:items-center`}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <h2 className="text-lg font-black text-[#11183d]">編輯收藏內容</h2>
            <p className="mt-1 text-xs text-slate-500">{place.placeName}・清空一則就是刪掉它</p>
            <div className="mt-4 space-y-2">
              {editing.drafts.map((note, index) => (
                <textarea
                  key={note.id}
                  data-testid={`note-input-${index}`}
                  value={note.text}
                  rows={2}
                  onChange={event => setEditing(current => current && ({
                    ...current,
                    drafts: current.drafts.map((entry, at) =>
                      at === index ? { ...entry, text: event.target.value } : entry),
                  }))}
                  className="w-full resize-none rounded-2xl border border-[#e4e2f2] bg-white px-3 py-2.5 text-xs leading-5 text-[#11183d] outline-none focus:border-[#b9adff]"
                />
              ))}
            </div>
            <button
              type="button"
              data-testid="add-note"
              onClick={() => setEditing(current => current && ({
                ...current,
                /*
                  A note the traveller wrote themselves still carries where it
                  came from, so the attribution line beside it keeps working:
                  these are their own words on their own save.
                */
                drafts: [...current.drafts, {
                  id: `note-${Date.now().toString(36)}-${current.drafts.length}`,
                  sourceNoteId: '', sourceSliceId: '', sourcePostId: '',
                  sourceCreatorId: place.savedByUserId,
                  type: 'other', text: '',
                } as SavedExperienceNote],
              }))}
              className="mt-2 w-full rounded-xl border border-dashed border-[#d9d5f5] py-2 text-[11px] font-black text-[#5b3df5]"
            >
              + 新增一則
            </button>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600">取消</button>
              <button
                type="button"
                data-testid="save-notes"
                onClick={() => {
                  onUpdateNotes?.(editing.id, editing.drafts
                    .map(note => ({ ...note, text: note.text.trim() }))
                    .filter(note => note.text));
                  setEditing(null);
                }}
                className="flex-1 rounded-xl bg-[#5b3df5] py-3 text-sm font-black text-white"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    {removeTarget && <div className={`fixed inset-0 ${OVERLAY.modal} flex items-center justify-center bg-slate-950/35 p-6`}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-black">移除這個地點？</h2><p className="mt-2 text-sm leading-6 text-slate-500">只會移除你收藏的「{removeTarget.placeName}」，不會刪除原始貼文。</p><div className="mt-5 flex gap-3"><button type="button" onClick={() => setRemoveTarget(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600">取消</button><button type="button" onClick={() => { onRemove(removeTarget.id); setRemoveTarget(null); }} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-black text-white">確認移除</button></div></div>
    </div>}
  </main>;
};

export default SavedTravelDestinationDetail;
