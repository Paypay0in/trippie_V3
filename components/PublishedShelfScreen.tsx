import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { PublishedTripCard } from '../types';
import { CollectionCard, PublishedCollectionCard, TripCard } from './PublishedCards';

/**
 * 「查看全部」 — somebody's published trips, or their published collections.
 *
 * One screen for both lists, because they are the same screen: a title, a back
 * arrow, and a column of cards that already know how to draw themselves. Two
 * files would be two places for 「what does an empty shelf say」 to drift.
 *
 * The 公開 / 私人 tabs appear only on your own shelf. A stranger's 私人 list is
 * empty by construction and always will be, and a tab that can never hold
 * anything is a promise the screen cannot keep — so a visitor is shown the
 * public list and told nothing about what else exists.
 */

interface Props {
  title: string;
  onBack: () => void;
  /** Set when this is the signed-in person's own shelf. */
  mine?: boolean;
  trips?: PublishedTripCard[];
  collections?: PublishedCollectionCard[];
  /** The owner's unpublished ones, for the 私人 tab. Only ever their own. */
  privateTrips?: PublishedTripCard[];
  privateCollections?: PublishedCollectionCard[];
  onOpenTrip?: (tripId: string) => void;
  onOpenCollection?: (collectionId: string) => void;
}

const PublishedShelfScreen: React.FC<Props> = ({
  title,
  onBack,
  mine,
  trips,
  collections,
  privateTrips,
  privateCollections,
  onOpenTrip,
  onOpenCollection,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<'public' | 'private'>('public');
  const showing = mine ? tab : 'public';

  const shownTrips = showing === 'public' ? trips ?? [] : privateTrips ?? [];
  const shownCollections = showing === 'public' ? collections ?? [] : privateCollections ?? [];
  const empty = shownTrips.length === 0 && shownCollections.length === 0;

  return (
    <main
      data-testid="published-shelf"
      className="min-h-screen bg-[#f7f8fc] pb-28 text-[#11183d] md:mx-auto md:max-w-2xl"
    >
      <div className="flex items-center gap-2 px-[var(--screen-pad)] pt-5">
        <button
          type="button"
          aria-label={t('common.back')}
          data-testid="published-shelf-back"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#11183d] shadow-[0_4px_14px_rgba(17,26,74,.06)]"
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-lg font-black tracking-tight">{title}</h1>
      </div>

      {mine && (
        <div className="mt-4 flex gap-1 border-b border-slate-200 px-[var(--screen-pad)]">
          {([['public', 'published.tabPublic'], ['private', 'published.tabPrivate']] as Array<['public' | 'private', string]>)
            .map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                data-testid={`published-shelf-tab-${key}`}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 pb-2 text-[13px] font-black ${
                  tab === key ? 'border-[#5b3df5] text-[#5b3df5]' : 'border-transparent text-slate-400'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
        </div>
      )}

      <div className="mt-4 space-y-3 px-[var(--screen-pad)]">
        {shownTrips.map(trip => (
          <TripCard key={trip.id} trip={trip} onOpen={id => onOpenTrip?.(id)} />
        ))}
        {shownCollections.map(collection => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            onOpen={id => onOpenCollection?.(id)}
          />
        ))}
        {empty && (
          /*
            Said, not left blank. An empty space is a question about whether
            this screen works; a sentence is an answer about the shelf.
          */
          <p
            data-testid="published-shelf-empty"
            className="rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-10 text-center text-xs font-bold text-slate-400"
          >
            {t(showing === 'private' ? 'published.emptyPrivate' : 'published.emptyPublic')}
          </p>
        )}
      </div>
    </main>
  );
};

export default PublishedShelfScreen;
