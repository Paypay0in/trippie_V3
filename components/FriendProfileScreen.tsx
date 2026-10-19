import React from 'react';
import { ArrowLeft, ChevronRight, Images, MapPinned, Users } from 'lucide-react';
import { Person } from '../services/friendships';
import { CommunityPost } from '../types';
import { SharedTrip, sharedTripDates } from '../services/tripsWithFriend';

/**
 * A friend's page: who they are publicly, and what the two of you did together.
 *
 * 「點擊這個好友可以看到他公開的主頁還有我們的共同旅行紀錄」.
 *
 * Two kinds of fact on one screen, and they are not the same kind:
 *
 * - **Public** — their name, cover, bio and published posts. Anybody signed in
 *   can read these; the database decides that, not this component.
 * - **Shared** — the trips both of you are members of. Nobody else sees this
 *   section, because for anybody else it is empty by construction.
 *
 * Nothing is fetched here. The posts come from the feed this device already
 * holds and the trips from its own trip list — a profile screen that re-asks
 * for what is already in memory is a second answer waiting to disagree.
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

const FriendProfileScreen: React.FC<Props> = ({
  person, posts, sharedTrips, onBack, onOpenPost, onOpenTrip,
}) => (
  /*
    The same column every other screen is in.

    On a phone this looked right because a phone is that column. Opened on a
    desktop it ran the whole 1200px: a full-bleed cover, a 20px avatar in the
    corner, and two stat numbers marooned at the far left. Every screen in
    this app is `md:max-w-2xl mx-auto`, and the one that is not is the one
    that looks broken.
  */
  <main data-testid="friend-profile" className="min-h-screen bg-[#f7f8fc] pb-28 text-[#11183d] md:mx-auto md:max-w-2xl">
    <div className="relative">
      {/*
        The cover, or the gradient that stands in for one. Never a grey gap:
        a page that opens on an empty rectangle reads as a page that failed.
      */}
      {person.coverUrl
        ? <img src={person.coverUrl} alt="" className="h-44 w-full object-cover" />
        : <div className="h-44 w-full bg-gradient-to-br from-[#2F5BFF] via-[#6B4DF6] to-[#8B3DFF]" />}
      {/*
        A wash under the name, so a bright cover never takes the text with it.
      */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#f7f8fc]" />
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
      Positioned, so the avatar is drawn over the cover it overlaps.

      「大頭被裁掉了」 — the cover's wrapper is `relative` and this one was not,
      and a positioned element paints above a static one whatever the order of
      the markup. So the 40px of avatar pulled up over the cover was behind
      it, and the circle arrived with its top half sliced off.
    */}
    <div className="relative -mt-10 px-5">
      <span className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-4 border-[#f7f8fc] bg-gradient-to-br from-violet-100 to-blue-100 text-2xl font-black text-violet-700 shadow-[0_10px_26px_rgba(17,26,74,.12)]">
        {person.avatarUrl
          ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
          : person.displayName.slice(0, 1)}
      </span>
      <h1 className="mt-3 text-2xl font-black tracking-tight">{person.displayName}</h1>
      {/*
        The address is not here, and that is deliberate: `find_person_by_email`
        never returns it either. Knowing somebody's email is how you find them,
        not something being their friend tells you.
      */}
      {person.bio && <p className="mt-1.5 text-[13px] leading-6 text-slate-500">{person.bio}</p>}

      {/*
        Two numbers, sharing the card they are in.

        They were `gap-6` at its left edge, so on anything wider than a phone
        the card was mostly empty and the pair read as the start of a row that
        had failed to load the rest of itself.
      */}
      <div className="mt-5 flex rounded-[22px] border border-[#eceaf5] bg-white py-4 shadow-[0_6px_18px_rgba(17,26,74,.05)]">
        <span className="flex-1 text-center">
          <span className="block text-2xl font-black leading-7">{posts.length}</span>
          <span className="text-[11px] font-bold text-slate-400">公開貼文</span>
        </span>
        <span className="my-1 w-px bg-slate-100" />
        <span className="flex-1 text-center">
          <span className="block text-2xl font-black leading-7 text-[#5b3df5]">{sharedTrips.length}</span>
          {/*
            「我是希望進行中的也可以出現」.

            It did include them — planned trips and finished ones go in
            together — but 「一起去過」 is the past tense, so a count of 1 on a
            trip nobody has taken yet reads as wrong even when it is right.
            A label that has to be explained is a label that is lying.
          */}
          <span className="text-[11px] font-bold text-slate-400">共同旅程</span>
        </span>
      </div>

      {/*
        What the two of you did, above what they tell the world.

        This is a friend's page opened from the friends list, and the question
        that opened it is 「what have we done together」 — their posts are the
        public half and are worth reading second.
      */}
      {sharedTrips.length > 0 && (
        <section data-testid="friend-shared-trips" className="mt-6">
          <h2 className="flex items-center gap-2 text-base font-black">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Users size={15} />
            </span>
            共同旅程
          </h2>
          <ul className="mt-2.5 space-y-2">
            {sharedTrips.map(trip => (
              <li key={trip.id}>
                {onOpenTrip ? (
                  <button
                    type="button"
                    data-testid={`friend-profile-trip-${trip.id}`}
                    onClick={() => onOpenTrip(trip.id)}
                    className="flex w-full items-center gap-3 rounded-[20px] border border-[#eceaf5] bg-white px-3.5 py-3 text-left shadow-[0_4px_14px_rgba(17,26,74,.04)] transition hover:border-[#d9d5f5]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef1ff] to-[#f3efff] text-[#6b4df6]">
                      <MapPinned size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{trip.label}</span>
                      <span className="mt-0.5 block text-[11px] font-bold text-slate-400">{sharedTripDates(trip)}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                ) : (
                  <span className="flex items-center gap-3 rounded-[20px] border border-[#eceaf5] bg-white px-3.5 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef1ff] to-[#f3efff] text-[#6b4df6]">
                      <MapPinned size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{trip.label}</span>
                      <span className="mt-0.5 block text-[11px] font-bold text-slate-400">{sharedTripDates(trip)}</span>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-base font-black">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Images size={15} />
          </span>
          公開的旅行分享
        </h2>
        {posts.length === 0 ? (
          /*
            Said, not left blank. 「他還沒有公開的分享」 is an answer about them;
            an empty space is a question about whether this screen works.
          */
          <p data-testid="friend-no-posts" className="mt-2.5 rounded-[20px] border border-dashed border-[#dcd9ec] bg-white/60 px-4 py-8 text-center text-xs font-bold text-slate-400">
            {person.displayName} 還沒有公開的旅行分享。
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
    </div>
  </main>
);

export default FriendProfileScreen;
