import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Heart, MapPinned } from 'lucide-react';
import { PublishedTripCard } from '../types';
import { tripDayCount } from '../services/tripPublishing';
import { compactCount } from './PublicTripView';

/**
 * The two cards that stand for somebody else's published things.
 *
 * One home for each, because the same trip appears on a profile, in the
 * 公開的旅行列表 behind 查看全部, and nowhere else may word it differently. The
 * recurring defect in this project is one rule honoured by one code path and
 * dropped by another, and 「7 天・32 個地點・5.2K 收藏」 is a rule: it is how
 * long the trip was, how much is in it, and how many people wanted it.
 */

/** 「2024/03/12 - 2024/03/18」, or just the start when there is no end. */
export const dateRange = (start?: string, end?: string): string => {
  const shown = (value?: string) => value?.replace(/-/g, '/') ?? '';
  if (!start) return '';
  return end ? `${shown(start)} - ${shown(end)}` : shown(start);
};

interface TripCardProps {
  trip: PublishedTripCard;
  onOpen: (tripId: string) => void;
  /** The visitor's own bookmark on the whole trip, when they have one. */
  saved?: boolean;
  onToggleSave?: (tripId: string) => void;
}

export const TripCard: React.FC<TripCardProps> = ({ trip, onOpen, saved, onToggleSave }) => {
  const { t } = useTranslation();
  const days = tripDayCount(trip);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid={`published-trip-card-${trip.id}`}
        onClick={() => onOpen(trip.id)}
        className="block w-full overflow-hidden rounded-[20px] border border-[#eceaf5] bg-white text-left shadow-[0_4px_14px_rgba(17,26,74,.04)]"
      >
        {trip.coverPhoto
          ? <img src={trip.coverPhoto} alt="" className="block h-36 w-full object-cover" />
          : <span className="block h-36 w-full bg-gradient-to-br from-[#2F5BFF] via-[#6B4DF6] to-[#8B3DFF]" />}
        <span className="block p-3">
          <span className="block truncate text-sm font-black text-[#11183d]">{trip.name}</span>
          <span className="mt-0.5 block text-[11px] font-bold text-slate-400">
            {dateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] font-bold text-slate-400">
            {days > 0 && <span className="flex items-center gap-1"><Heart size={11} />{t('publicTrip.dayCount', { days })}</span>}
            <span className="flex items-center gap-1"><MapPinned size={11} />{t('publicTrip.stopCount', { stops: trip.stopCount })}</span>
            {trip.saveCount > 0 && (
              <span className="flex items-center gap-1">
                <Bookmark size={11} />{t('publicTrip.saveCount', { saves: compactCount(trip.saveCount) })}
              </span>
            )}
          </span>
        </span>
      </button>
      {onToggleSave && (
        <button
          type="button"
          aria-label={t(saved ? 'publicTrip.alreadySaved' : 'publicTrip.saveTrip')}
          data-testid={`published-trip-save-${trip.id}`}
          onClick={() => onToggleSave(trip.id)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#5b3df5] shadow-[0_4px_14px_rgba(17,26,74,.18)] backdrop-blur"
        >
          <Bookmark size={14} fill={saved ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
};

/** What `list_public_collections` returns, as the cards need it. */
export interface PublishedCollectionCard {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  country: string;
  city: string;
  publishedAt?: string;
  itemCount: number;
  /** Counted from `content_saves`, when the caller asked for it. */
  saveCount?: number;
}

interface CollectionCardProps {
  collection: PublishedCollectionCard;
  onOpen: (collectionId: string) => void;
  /** A row reads wider than a tile; the profile grid wants the tile. */
  layout?: 'row' | 'tile';
}

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection, onOpen, layout = 'row',
}) => {
  const { t } = useTranslation();
  const meta = [
    t('publicTrip.stopCount', { stops: collection.itemCount }),
    ...(collection.saveCount
      ? [t('publicTrip.saveCount', { saves: compactCount(collection.saveCount) })]
      : []),
  ].join(t('planner.placeSeparator'));

  if (layout === 'tile') {
    return (
      <button
        type="button"
        data-testid={`published-collection-card-${collection.id}`}
        onClick={() => onOpen(collection.id)}
        className="block w-full overflow-hidden rounded-[20px] border border-[#eceaf5] bg-white text-left shadow-[0_4px_14px_rgba(17,26,74,.04)]"
      >
        {collection.coverUrl
          ? <img src={collection.coverUrl} alt="" className="block h-28 w-full object-cover" />
          : <span className="block h-28 w-full bg-gradient-to-br from-[#eef1ff] to-[#f3efff]" />}
        <span className="block p-3">
          <span className="block truncate text-xs font-black text-[#11183d]">{collection.title}</span>
          <span className="mt-1 block text-[10px] font-bold text-slate-400">{meta}</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={`published-collection-card-${collection.id}`}
      onClick={() => onOpen(collection.id)}
      className="flex w-full items-center gap-3 rounded-[20px] border border-[#eceaf5] bg-white p-3 text-left shadow-[0_4px_14px_rgba(17,26,74,.04)]"
    >
      {collection.coverUrl
        ? <img src={collection.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
        : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef1ff] to-[#f3efff] text-[#6b4df6]">
            <MapPinned size={18} />
          </span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-black text-[#11183d]">{collection.title}</span>
        <span className="mt-0.5 block text-[11px] font-bold text-slate-400">{meta}</span>
      </span>
    </button>
  );
};
