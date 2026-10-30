import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Globe, Link2, Lock, Plus, Share2 } from 'lucide-react';
import { PlaceCategory, SavedCollection, SavedTravelInspiration } from '../types';
/*
  The tag's name, from the one place that names tags. A second copy drifts:
  this file had 「咖啡廳」 where `placeCategory` says 「咖啡」, which is two
  answers to 「what is this place」 waiting to disagree on screen.
*/
import { categoryLabel } from '../services/placeCategory';
import { isPublished } from '../services/collectionLifecycle';
import CollectionShareSheet from './CollectionShareSheet';

/**
 * 我的收藏集 — the named lists, and one of them opened.
 *
 * Two screens in the mock and one component, because the list is nothing but
 * a way into a collection and splitting them would mean two places deciding
 * what 公開 looks like.
 *
 * A collection is not a bucket the app computed. Saved places are already
 * grouped by country and city elsewhere, and that key is a trimmed string —
 * rename a city and the group is a different group. These are lists somebody
 * named, which is why they are worth sharing and why they have ids.
 */

interface Props {
  collections: SavedCollection[];
  /** Every saved place this account holds, from which a collection draws. */
  places: SavedTravelInspiration[];
  /** Which places are in which collection, by collection id. */
  membership: Record<string, string[]>;
  origin: string;
  onCreate: (title: string) => void;
  onPublish: (collection: SavedCollection) => void;
  onUnpublish: (collection: SavedCollection) => void;
  /** Absent and the list is read-only, like every other panel here. */
  onOpenPlace?: (place: SavedTravelInspiration) => void;
  /**
   * Which saved places a collection holds, replaced whole.
   *
   * Whole rather than add-one/remove-one, because the order is part of what
   * is being published and a list that can only be appended to is a list
   * nobody can arrange.
   */
  onChangeMembership?: (collectionId: string, placeIds: string[]) => void;
}

/*
  Keys, not strings. This runs at module scope on the row that calls it, and
  the three labels are the same three the share sheet offers — so they read
  from `collectionShare.visibility.*` rather than growing a second home for
  the same words.
*/
const badgeFor = (collection: SavedCollection) => {
  if (!isPublished(collection)) {
    return { icon: <Lock size={11} />, labelKey: 'collectionShare.visibility.privateLabel', tone: 'bg-slate-100 text-slate-500' };
  }
  if (collection.visibility === 'link') {
    return { icon: <Link2 size={11} />, labelKey: 'collectionShare.visibility.linkLabel', tone: 'bg-amber-50 text-amber-600' };
  }
  return { icon: <Globe size={11} />, labelKey: 'collectionShare.visibility.publicLabel', tone: 'bg-violet-50 text-[#5b3df5]' };
};

const SavedCollectionsPanel: React.FC<Props> = ({
  collections,
  places,
  membership,
  origin,
  onCreate,
  onPublish,
  onUnpublish,
  onOpenPlace,
  onChangeMembership,
}) => {
  const { t } = useTranslation();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [sharingId, setSharingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState('');
  /** Which collection is having places picked for it, and the search box. */
  const [picking, setPicking] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const byId = React.useMemo(
    () => new Map(places.map(place => [place.id, place])),
    [places],
  );
  const placesIn = React.useCallback(
    (collectionId: string): SavedTravelInspiration[] => (membership[collectionId] ?? [])
      .map(id => byId.get(id))
      .filter((place): place is SavedTravelInspiration => Boolean(place)),
    [byId, membership],
  );

  const open = collections.find(collection => collection.id === openId);
  const sharing = collections.find(collection => collection.id === sharingId);

  if (sharing) {
    return (
      <CollectionShareSheet
        collection={sharing}
        places={placesIn(sharing.id)}
        origin={origin}
        onClose={() => setSharingId(null)}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
      />
    );
  }

  if (open) {
    const held = placesIn(open.id);
    /*
      Everything this account has saved, narrowed by the search box. Places
      already in the collection stay listed and ticked, so taking one out is
      the same gesture as putting it in.
    */
    const needle = query.trim().toLocaleLowerCase();
    const pickable = places.filter(place => {
      if (!needle) return true;
      return [place.resolvedPlaceName, place.placeName, place.city, place.district, place.country]
        .some(field => (field ?? '').toLocaleLowerCase().includes(needle));
    });
    /*
      Counted from the places themselves rather than stored on the
      collection. A tag can change on a place at any time, and a number
      somebody has to remember to update is a number that goes wrong.
    */
    const facets = held.reduce<Record<string, number>>((counts, place) => {
      const key = place.category ?? 'other';
      return { ...counts, [key]: (counts[key] ?? 0) + 1 };
    }, {});

    return (
      <div className="space-y-4" data-testid="collection-detail">
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="text-[12px] font-bold text-slate-400"
        >
          {t('collections.backToAll')}
        </button>

        <div className="rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[#11183d]">{open.title}</h2>
              <p className="mt-0.5 text-[12px] text-slate-400">
                {[open.city, open.country].filter(Boolean).join('・')}
                {held.length > 0 && t('collections.placeCountWithDot', { n: held.length })}
              </p>
              {open.description && (
                <p className="mt-2 text-[12px] leading-5 text-slate-500">{open.description}</p>
              )}
            </div>
            <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${badgeFor(open).tone}`}>
              {badgeFor(open).icon}{t(badgeFor(open).labelKey)}
            </span>
          </div>

          {/*
            The action the whole feature was waiting on.

            A collection with nothing in it cannot be previewed, published or
            saved from, so every screen downstream of this one was running on
            an empty list until there was a way to fill it.
          */}
          {onChangeMembership && (
            <button
              type="button"
              data-testid="collection-add-places"
              onClick={() => { setPicking(picking === open.id ? null : open.id); setQuery(''); }}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-white text-[13px] font-black text-[#5b3df5] ring-1 ring-violet-200"
            >
              <Plus size={14} />{picking === open.id ? t('collections.collapse') : t('collections.addPlaces')}
            </button>
          )}

          {picking === open.id && onChangeMembership && (
            <div className="mt-2 rounded-xl bg-slate-50 p-2" data-testid="collection-picker">
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t('collections.searchSaved')}
                aria-label={t('collections.searchSaved')}
                className="w-full rounded-lg bg-white px-2.5 py-2 text-[12px] outline-none"
              />
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {pickable.map(place => {
                  const inside = (membership[open.id] ?? []).includes(place.id);
                  const name = place.resolvedPlaceName || place.placeName;
                  return (
                    <button
                      key={place.id}
                      type="button"
                      data-testid={`collection-pick-${place.id}`}
                      onClick={() => {
                        const held = membership[open.id] ?? [];
                        onChangeMembership(
                          open.id,
                          inside ? held.filter(id => id !== place.id) : [...held, place.id],
                        );
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                        inside ? 'bg-violet-50' : 'bg-white'
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${inside ? 'bg-[#5b3df5] text-white' : 'bg-slate-100'}`}>
                        {inside && <Check size={11} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-[#11183d]">{name}</span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {[place.district, place.city, place.country].filter(Boolean).join('・')}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {pickable.length === 0 && (
                  <p className="px-2 py-3 text-center text-[11px] text-slate-400">
                    {query.trim() ? t('collections.noMatches') : t('collections.noSavedPlaces')}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="collection-open-share"
            onClick={() => setSharingId(open.id)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white"
          >
            <Share2 size={14} />{t('collections.shareSettings')}
          </button>

          {Object.keys(facets).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(facets).map(([key, count]) => (
                <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">
                  {/*
                    The fallback used to live here, as a second spelling of a
                    word the table already had. `categoryLabel` owns both now.
                  */}
                  {categoryLabel(key as PlaceCategory)} {count}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {held.map(place => (
            <button
              key={place.id}
              type="button"
              data-testid={`collection-place-${place.id}`}
              onClick={() => onOpenPlace?.(place)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-[0_6px_18px_rgba(17,24,61,.05)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-black text-[#11183d]">
                  {place.resolvedPlaceName || place.placeName}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {[place.district, place.city].filter(Boolean).join('・')}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-slate-300" />
            </button>
          ))}
          {held.length === 0 && (
            <p className="rounded-2xl bg-white p-4 text-center text-[12px] text-slate-400 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
              {t('collections.emptyCollection')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="collection-list">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-[#11183d]">{t('collections.myCollections')}</h2>
        <button
          type="button"
          data-testid="collection-add"
          onClick={() => setAdding(current => !current)}
          className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1.5 text-[12px] font-black text-[#5b3df5]"
        >
          <Plus size={13} />{t('collections.add')}
        </button>
      </div>

      {adding && (
        <form
          data-testid="collection-add-form"
          onSubmit={event => {
            event.preventDefault();
            const named = title.trim();
            if (!named) return;
            onCreate(named);
            setTitle('');
            setAdding(false);
          }}
          className="rounded-2xl bg-white p-3 shadow-[0_6px_18px_rgba(17,24,61,.05)]"
        >
          <input
            autoFocus
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder={t('collections.namePlaceholder')}
            aria-label={t('collections.nameAria')}
            className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] outline-none"
          />
          {/* Private until published, and said so before anything is created. */}
          <p className="mt-1.5 text-[11px] text-slate-400">{t('collections.privateUntilShared')}</p>
          <button
            type="submit"
            className="mt-2 min-h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white"
          >
            {t('collections.create')}
          </button>
        </form>
      )}

      {collections.map(collection => {
        const badge = badgeFor(collection);
        const count = (membership[collection.id] ?? []).length;
        return (
          <button
            key={collection.id}
            type="button"
            data-testid={`collection-row-${collection.id}`}
            onClick={() => setOpenId(collection.id)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-[0_6px_18px_rgba(17,24,61,.05)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-black text-[#11183d]">{collection.title}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {collection.city
                  ? t('collections.rowSubtitleWithCity', { n: count, city: collection.city })
                  : t('collections.rowSubtitle', { n: count })}
              </span>
            </span>
            <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${badge.tone}`}>
              {badge.icon}{t(badge.labelKey)}
            </span>
          </button>
        );
      })}

      {collections.length === 0 && !adding && (
        <p className="rounded-2xl bg-white p-6 text-center text-[12px] text-slate-400 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
          {t('collections.noCollections')}
        </p>
      )}
    </div>
  );
};

export default SavedCollectionsPanel;
