import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, CalendarDays, ChevronRight, Images, MapPin, Users } from 'lucide-react';
import { Person } from '../services/friendships';
import { CommunityPost } from '../types';
import { SharedTrip, sharedTripDates } from '../services/tripsWithFriend';
import { fetchDestinationImage } from '../services/destinationImageService';

/**
 * A friend's page: who they are publicly, and what the two of you did together.
 *
 * 「點擊這個好友可以看到他公開的主頁還有我們的共同旅行紀錄」, then 「將頁面優化成
 * 這樣」 with a mock: a photographed cover, a large avatar over it, the counts
 * in one card, tabs carrying their own totals, and a trip drawn as a card with
 * the place's photo rather than as a line of text with a date after it.
 *
 * Two kinds of fact on one screen, and they are not the same kind:
 *
 * - **Public** — their name, cover, bio and published posts. Anybody signed in
 *   can read these; the database decides that, not this component.
 * - **Shared** — the trips both of you are members of. Nobody else sees this
 *   section, because for anybody else it is empty by construction.
 *
 * What the mock has and this does not: 旅伴好友, 收藏的景點, and every editing
 * control （更換封面, 編輯個人資料, 新增共同旅程, 發布貼文）. The first two are
 * somebody else's rows and this account cannot read them — a tab that can only
 * ever say (0) is a tab lying about a stranger. The rest belong on your own
 * profile, which is the screen that mock was drawn of.
 */

interface Props {
  person: Person;
  /** Their published posts, filtered by the caller from the feed it holds. */
  posts: CommunityPost[];
  /** Trips you are both on. See `tripsWithFriend`. */
  sharedTrips: SharedTrip[];
  onBack: () => void;
  onOpenPost?: (postId: string) => void;
  onOpenTrip?: (tripId: string) => void;
}

/**
 * The photo on a trip card, found from where the trip goes.
 *
 * The same endpoint the destination cards have always used, so a place already
 * looked at on another screen costs nothing here. Absent rather than a grey
 * box: the card keeps its gradient, which reads as a card rather than as an
 * image that failed.
 */
const useTripImages = (destinations: Array<string | undefined>): Record<string, string> => {
  const [images, setImages] = useState<Record<string, string>>({});
  // A string, so this does not re-run on every render of a new array.
  const wanted = destinations.filter(Boolean).join('|');

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void Promise.all(wanted.split('|').map(async destination => {
      const image = await fetchDestinationImage(destination);
      return image?.imageUrl ? [destination, image.imageUrl] as const : null;
    })).then(found => {
      if (cancelled) return;
      const resolved = found.filter((entry): entry is readonly [string, string] => entry !== null);
      if (resolved.length === 0) return;
      setImages(current => ({ ...current, ...Object.fromEntries(resolved) }));
    });
    return () => { cancelled = true; };
  }, [wanted]);

  return images;
};

const FriendProfileScreen: React.FC<Props> = ({
  person, posts, sharedTrips, onBack, onOpenPost, onOpenTrip,
}) => {
  /*
    Which half is on screen. Both totals sit on the tabs, so the one not
    chosen still says how much is behind it.
  */
  const [tab, setTab] = useState<'trips' | 'posts'>('trips');
  const images = useTripImages(sharedTrips.map(trip => trip.destination));

  const tabs: Array<['trips' | 'posts', string, number, React.ReactNode]> = [
    ['trips', '共同旅程', sharedTrips.length, <Users key="t" size={14} />],
    ['posts', '公開的旅行分享', posts.length, <Images key="p" size={14} />],
  ];

  return (
    /*
      The same column every other screen is in. On a phone this looked right
      because a phone is that column; on a desktop it ran the whole 1200px.
    */
    <main data-testid="friend-profile" className="min-h-screen bg-[#f7f8fc] pb-28 text-[#11183d] md:mx-auto md:max-w-2xl">
      <div className="relative">
        {person.coverUrl
          ? <img src={person.coverUrl} alt="" className="h-48 w-full object-cover" />
          : <div className="h-48 w-full bg-gradient-to-br from-[#2F5BFF] via-[#6B4DF6] to-[#8B3DFF]" />}
        {/* A wash into the page, so a bright cover cannot take the name with it. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#f7f8fc]" />
        <button
          type="button"
          data-testid="friend-profile-back"
          aria-label="返回"
          onClick={onBack}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[#11183d] shadow-[0_4px_14px_rgba(17,26,74,.18)] backdrop-blur"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {/*
        Positioned, so the avatar is drawn over the cover it overlaps: the
        cover's wrapper is `relative`, and a positioned element paints above a
        static one whatever the order of the markup.
      */}
      <div className="relative -mt-14 px-5">
        <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-violet-100 to-blue-100 text-2xl font-black text-violet-700 shadow-[0_12px_30px_rgba(17,26,74,.16)]">
          {person.avatarUrl
            ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
            : person.displayName.slice(0, 1)}
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight">{person.displayName}</h1>
        {/*
          No address, deliberately: `find_person_by_email` does not return one
          either. Knowing somebody's email is how you find them, not something
          being their friend tells you.
        */}
        {person.bio && <p className="mt-1.5 text-[13px] leading-6 text-slate-500">{person.bio}</p>}

        <div className="mt-5 flex rounded-[22px] border border-[#eceaf5] bg-white py-4 shadow-[0_6px_18px_rgba(17,26,74,.05)]">
          <span className="flex-1 text-center">
            <span className="block text-2xl font-black leading-7">{posts.length}</span>
            <span className="text-[11px] font-bold text-slate-400">公開貼文</span>
          </span>
          <span className="my-1 w-px bg-slate-100" />
          <span className="flex-1 text-center">
            <span className="block text-2xl font-black leading-7 text-[#5b3df5]">{sharedTrips.length}</span>
            {/*
              「我是希望進行中的也可以出現」 — planned trips count, so the label
              is not in the past tense. A label that has to be explained is a
              label that is lying.
            */}
            <span className="text-[11px] font-bold text-slate-400">共同旅程</span>
          </span>
        </div>

        {/* Each tab carries its own total, so the unchosen one still answers. */}
        <div className="mt-5 flex gap-5 border-b border-slate-100">
          {tabs.map(([key, label, count, icon]) => (
            <button
              key={key}
              type="button"
              data-testid={`friend-tab-${key}`}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`relative flex items-center gap-1.5 pb-2.5 text-[13px] font-black ${
                tab === key ? 'text-[#5b3df5]' : 'text-slate-400'
              }`}
            >
              {icon}{label} ({count})
              {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#5b3df5]" />}
            </button>
          ))}
        </div>

        {tab === 'trips' && (
          sharedTrips.length === 0 ? (
            <p data-testid="friend-no-trips" className="mt-4 rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-8 text-center text-xs font-bold text-slate-400">
              你們還沒有一起的旅程。
            </p>
          ) : (
            <ul data-testid="friend-shared-trips" className="mt-4 space-y-3">
              {sharedTrips.map(trip => {
                const image = trip.destination ? images[trip.destination] : undefined;
                const card = (
                  <>
                    {/*
                      The place, as a photograph. A trip is recognised the way
                      a saved place is; a name with a date after it is what
                      was here before.
                    */}
                    <span className="relative block h-24 w-32 shrink-0 overflow-hidden rounded-[18px] bg-gradient-to-br from-[#eef1ff] to-[#f3efff]">
                      {image && <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      {trip.destination && (
                        <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-black text-white">
                          <MapPin size={9} />{trip.destination}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-black">{trip.label}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
                        {sharedTripDates(trip) && (
                          <span className="flex items-center gap-1"><CalendarDays size={11} />{sharedTripDates(trip)}</span>
                        )}
                        {typeof trip.memberCount === 'number' && (
                          <span className="flex items-center gap-1"><Users size={11} />{trip.memberCount} 人</span>
                        )}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={trip.id}>
                    {onOpenTrip ? (
                      <button
                        type="button"
                        data-testid={`friend-profile-trip-${trip.id}`}
                        onClick={() => onOpenTrip(trip.id)}
                        className="flex w-full items-center gap-3.5 rounded-[22px] border border-[#eceaf5] bg-white p-3 text-left shadow-[0_6px_18px_rgba(17,26,74,.05)] transition hover:border-[#d9d5f5]"
                      >
                        {card}
                        <ChevronRight size={18} className="shrink-0 text-slate-300" />
                      </button>
                    ) : (
                      <span className="flex items-center gap-3.5 rounded-[22px] border border-[#eceaf5] bg-white p-3">
                        {card}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === 'posts' && (
          posts.length === 0 ? (
            /*
              Said, not left blank. 「他還沒有公開的分享」 is an answer about
              them; an empty space is a question about whether this works.
            */
            <p data-testid="friend-no-posts" className="mt-4 rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-10 text-center text-xs font-bold leading-6 text-slate-400">
              <Bookmark size={22} className="mx-auto mb-2 text-slate-300" />
              {person.displayName} 還沒有公開的旅行分享。
            </p>
          ) : (
            <ul data-testid="friend-posts" className="mt-4 grid grid-cols-2 gap-3">
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
          )
        )}
      </div>
    </main>
  );
};

export default FriendProfileScreen;
