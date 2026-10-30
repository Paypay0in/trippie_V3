import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ChevronRight, MapPinned, Plus, Users } from 'lucide-react';
import { Person } from '../services/friendships';
import { CommunityPost, PublicProfileCounts, PublishedTripCard } from '../types';
import { SharedTrip, sharedTripDates } from '../services/tripsWithFriend';
import { CollectionCard, PublishedCollectionCard, TripCard } from './PublishedCards';
import { compactCount } from './PublicTripView';

/**
 * 他人的個人檔案 — who somebody is publicly, and what they have shared.
 *
 * Three kinds of fact on one screen, and they are not the same kind:
 *
 * - **Public** — their name, cover, bio, published trips and collections.
 *   Anybody may read these; `list_public_trips` and `list_public_collections`
 *   decide that, not this component;
 * - **Counted** — 旅行 / 城市 / 收藏, asked of the server. Never counted from
 *   what this device happens to hold: a profile saying 12 旅行 while listing 3
 *   is a profile lying about a stranger;
 * - **Shared** — the trips both of you are on. Nobody else sees that section,
 *   because for anybody else it is empty by construction.
 *
 * Nothing about this person's money, membership or plans is here. A profile is
 * what they chose to publish, and nothing else is theirs to show.
 */

type Tab = 'trips' | 'collections' | 'posts';

interface Props {
  person: Person;
  /** Their published posts, filtered by the caller from the feed it holds. */
  posts: CommunityPost[];
  /** Trips you are both on. See `tripsWithFriend`. */
  sharedTrips: SharedTrip[];
  /** Their 公開 trips and collections, as the server listed them. */
  publishedTrips?: PublishedTripCard[];
  publishedCollections?: PublishedCollectionCard[];
  /** The server's figures. Absent while they load — never guessed at. */
  counts?: PublicProfileCounts;
  /** Whether the signed-in person already follows them. */
  following?: boolean;
  onToggleFollow?: () => void;
  onBack: () => void;
  onOpenPost?: (postId: string) => void;
  onOpenTrip?: (tripId: string) => void;
  onOpenPublishedTrip?: (tripId: string) => void;
  onOpenPublishedCollection?: (collectionId: string) => void;
  /** 查看全部 — opens the full shelf behind each section. */
  onSeeAllTrips?: () => void;
  onSeeAllCollections?: () => void;
}

/** A figure, or a dash while the server has not answered. */
const Stat: React.FC<{ value?: number; label: string; testId: string; accent?: boolean }> = ({
  value, label, testId, accent,
}) => (
  <span className="flex-1 text-center" data-testid={testId}>
    <span className={`block text-2xl font-black leading-7 ${accent ? 'text-[#5b3df5]' : ''}`}>
      {value == null ? '—' : compactCount(value)}
    </span>
    <span className="text-[11px] font-bold text-slate-400">{label}</span>
  </span>
);

const FriendProfileScreen: React.FC<Props> = ({
  person,
  posts,
  sharedTrips,
  publishedTrips = [],
  publishedCollections = [],
  counts,
  following,
  onToggleFollow,
  onBack,
  onOpenPost,
  onOpenTrip,
  onOpenPublishedTrip,
  onOpenPublishedCollection,
  onSeeAllTrips,
  onSeeAllCollections,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<Tab>('trips');

  /** 「查看全部 ›」, only when there is more behind it than is already shown. */
  const seeAll = (onPress: (() => void) | undefined, shown: number, total?: number) =>
    onPress && (total ?? shown) > shown ? (
      <button
        type="button"
        onClick={onPress}
        className="flex items-center gap-0.5 text-[11px] font-bold text-slate-400"
      >
        {t('friendProfile.seeAll')}<ChevronRight size={13} />
      </button>
    ) : null;

  return (
    <main
      data-testid="friend-profile"
      className="min-h-screen bg-[#f7f8fc] pb-28 text-[#11183d] md:mx-auto md:max-w-2xl"
    >
      <div className="relative">
        {/*
          The cover, or the gradient that stands in for one. Never a grey gap:
          a page that opens on an empty rectangle reads as a page that failed.
        */}
        {person.coverUrl
          ? <img src={person.coverUrl} alt="" className="h-44 w-full object-cover" />
          : <div className="h-44 w-full bg-gradient-to-br from-[#2F5BFF] via-[#6B4DF6] to-[#8B3DFF]" />}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#f7f8fc]" />
        <button
          type="button"
          data-testid="friend-profile-back"
          aria-label={t('common.back')}
          onClick={onBack}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[#11183d] shadow-[0_4px_14px_rgba(17,26,74,.18)] backdrop-blur"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {/*
        Positioned, so the avatar is drawn over the cover it overlaps. A
        positioned element paints above a static one whatever the markup order,
        and without this the circle arrives with its top half sliced off.
      */}
      <div className="relative -mt-10 px-5">
        <div className="flex items-end justify-between gap-3">
          <span className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-4 border-[#f7f8fc] bg-gradient-to-br from-violet-100 to-blue-100 text-2xl font-black text-violet-700 shadow-[0_10px_26px_rgba(17,26,74,.12)]">
            {person.avatarUrl
              ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
              : person.displayName.slice(0, 1)}
          </span>
          {onToggleFollow && (
            <button
              type="button"
              data-testid="friend-profile-follow"
              onClick={onToggleFollow}
              className={`mb-1 flex min-h-9 items-center gap-1 rounded-full px-4 text-[12px] font-black ${
                following
                  ? 'bg-white text-slate-400 ring-1 ring-slate-200'
                  : 'bg-gradient-to-r from-blue-600 to-violet-600 text-white'
              }`}
            >
              {following ? <><Check size={13} />{t('friendProfile.following')}</> : <><Plus size={13} />{t('friendProfile.follow')}</>}
            </button>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-black tracking-tight">{person.displayName}</h1>
        {/*
          The address is not here, and that is deliberate: `find_person_by_email`
          never returns it either. Knowing somebody's email is how you find
          them, not something being their friend tells you.
        */}
        {person.bio && <p className="mt-1.5 text-[13px] leading-6 text-slate-500">{person.bio}</p>}

        <div className="mt-5 flex rounded-[22px] border border-[#eceaf5] bg-white py-4 shadow-[0_6px_18px_rgba(17,26,74,.05)]">
          <Stat value={counts?.tripCount} label={t('friendProfile.statTrips')} testId="friend-stat-trips" />
          <span className="my-1 w-px bg-slate-100" />
          <Stat value={counts?.cityCount} label={t('friendProfile.statCities')} testId="friend-stat-cities" />
          <span className="my-1 w-px bg-slate-100" />
          <Stat value={counts?.saveCount} label={t('friendProfile.statSaves')} testId="friend-stat-saves" accent />
        </div>

        <div className="mt-5 flex gap-1 border-b border-slate-200">
          {([
            ['trips', t('friendProfile.tabTrips', { n: publishedTrips.length })],
            ['collections', t('friendProfile.tabCollections', { n: publishedCollections.length })],
            ['posts', t('friendProfile.tabPosts', { n: posts.length })],
          ] as Array<[Tab, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`friend-profile-tab-${key}`}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 pb-2 text-[13px] font-black ${
                tab === key ? 'border-[#5b3df5] text-[#5b3df5]' : 'border-transparent text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'trips' && (
          <section className="mt-4" data-testid="friend-published-trips">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black">{t('friendProfile.publicTrips')}</h2>
              {seeAll(onSeeAllTrips, publishedTrips.length, counts?.tripCount)}
            </div>
            {publishedTrips.length === 0 ? (
              <p
                data-testid="friend-no-trips"
                className="mt-2.5 rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-8 text-center text-xs font-bold text-slate-400"
              >
                {t('friendProfile.noPublicTrips', { name: person.displayName })}
              </p>
            ) : (
              <ul className="mt-2.5 grid grid-cols-2 gap-3">
                {publishedTrips.map(trip => (
                  <li key={trip.id}>
                    <TripCard trip={trip} onOpen={id => onOpenPublishedTrip?.(id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'collections' && (
          <section className="mt-4" data-testid="friend-published-collections">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black">{t('friendProfile.publicCollections')}</h2>
              {seeAll(onSeeAllCollections, publishedCollections.length, counts?.collectionCount)}
            </div>
            {publishedCollections.length === 0 ? (
              <p
                data-testid="friend-no-collections"
                className="mt-2.5 rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-8 text-center text-xs font-bold text-slate-400"
              >
                {t('friendProfile.noPublicCollections', { name: person.displayName })}
              </p>
            ) : (
              <ul className="mt-2.5 grid grid-cols-2 gap-3">
                {publishedCollections.map(collection => (
                  <li key={collection.id}>
                    <CollectionCard
                      collection={collection}
                      layout="tile"
                      onOpen={id => onOpenPublishedCollection?.(id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'posts' && (
          <section className="mt-4">
            <h2 className="text-base font-black">{t('friendProfile.publicPosts')}</h2>
            {posts.length === 0 ? (
              /*
                Said, not left blank. 「他還沒有公開的分享」 is an answer about
                them; an empty space is a question about whether this works.
              */
              <p
                data-testid="friend-no-posts"
                className="mt-2.5 rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-8 text-center text-xs font-bold text-slate-400"
              >
                {t('friendProfile.noPublicPosts', { name: person.displayName })}
              </p>
            ) : (
              <ul data-testid="friend-posts" className="mt-2.5 grid grid-cols-2 gap-3">
                {posts.map(post => (
                  <li key={post.id}>
                    <button
                      type="button"
                      data-testid={`friend-post-${post.id}`}
                      disabled={!onOpenPost}
                      onClick={() => onOpenPost?.(post.id)}
                      className="block w-full overflow-hidden rounded-[20px] border border-[#eceaf5] bg-white text-left shadow-[0_4px_14px_rgba(17,26,74,.04)]"
                    >
                      {post.coverImage
                        ? <img src={post.coverImage} alt="" className="block h-32 w-full object-cover" />
                        : <span className="block h-32 w-full bg-gradient-to-br from-[#eef1ff] to-[#f3efff]" />}
                      <span className="block p-3">
                        <span className="block text-xs font-black leading-5">{post.title}</span>
                        <span className="mt-1 block text-[10px] font-bold text-slate-400">
                          {post.country}・{post.city}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/*
          What the two of you did, below what they tell the world.

          Nobody else sees this section — for anybody else it is empty by
          construction — so it sits outside the public tabs rather than
          pretending to be one of them.
        */}
        {sharedTrips.length > 0 && (
          <section data-testid="friend-shared-trips" className="mt-7">
            <h2 className="flex items-center gap-2 text-base font-black">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Users size={15} />
              </span>
              {t('friendProfile.sharedTrips')}
            </h2>
            <ul className="mt-2.5 space-y-2">
              {sharedTrips.map(trip => (
                <li key={trip.id}>
                  <button
                    type="button"
                    data-testid={`friend-profile-trip-${trip.id}`}
                    disabled={!onOpenTrip}
                    onClick={() => onOpenTrip?.(trip.id)}
                    className="flex w-full items-center gap-3 rounded-[20px] border border-[#eceaf5] bg-white px-3.5 py-3 text-left shadow-[0_4px_14px_rgba(17,26,74,.04)] transition hover:border-[#d9d5f5]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef1ff] to-[#f3efff] text-[#6b4df6]">
                      <MapPinned size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{trip.label}</span>
                      <span className="mt-0.5 block text-[11px] font-bold text-slate-400">
                        {sharedTripDates(trip)}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
};

export default FriendProfileScreen;
