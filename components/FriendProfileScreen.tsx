import React from 'react';
import { ArrowLeft, MapPinned, Users } from 'lucide-react';
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
        ? <img src={person.coverUrl} alt="" className="h-40 w-full object-cover" />
        : <div className="h-40 w-full bg-gradient-to-br from-violet-100 via-blue-100 to-violet-50" />}
      <button
        type="button"
        data-testid="friend-profile-back"
        aria-label="返回"
        onClick={onBack}
        className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#11183d] shadow"
      >
        <ArrowLeft size={18} />
      </button>
    </div>

    <div className="-mt-10 px-5">
      <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-[#f7f8fc] bg-violet-100 text-xl font-black text-violet-700">
        {person.avatarUrl
          ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
          : person.displayName.slice(0, 1)}
      </span>
      <h1 className="mt-2 text-xl font-black">{person.displayName}</h1>
      {/*
        The address is not here, and that is deliberate: `find_person_by_email`
        never returns it either. Knowing somebody's email is how you find them,
        not something being their friend tells you.
      */}
      {person.bio && <p className="mt-1 text-xs leading-5 text-slate-500">{person.bio}</p>}

      <div className="mt-4 flex gap-6 rounded-2xl border border-slate-100 bg-white px-5 py-3">
        <span className="text-center">
          <span className="block text-lg font-black">{posts.length}</span>
          <span className="text-[11px] font-bold text-slate-400">公開貼文</span>
        </span>
        <span className="text-center">
          <span className="block text-lg font-black">{sharedTrips.length}</span>
          <span className="text-[11px] font-bold text-slate-400">一起去過</span>
        </span>
      </div>

      {/*
        What the two of you did, above what they tell the world.

        This is a friend's page opened from the friends list, and the question
        that opened it is 「what have we done together」 — their posts are the
        public half and are worth reading second.
      */}
      {sharedTrips.length > 0 && (
        <section data-testid="friend-shared-trips" className="mt-5">
          <h2 className="flex items-center gap-1.5 text-sm font-black">
            <Users size={14} className="text-violet-500" />一起去過的旅行
          </h2>
          <ul className="mt-2 space-y-1.5">
            {sharedTrips.map(trip => (
              <li key={trip.id}>
                {onOpenTrip ? (
                  <button
                    type="button"
                    data-testid={`friend-profile-trip-${trip.id}`}
                    onClick={() => onOpenTrip(trip.id)}
                    className="flex w-full items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-left"
                  >
                    <MapPinned size={14} className="shrink-0 text-violet-400" />
                    <span className="min-w-0 flex-1 truncate text-xs font-black">{trip.label}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{sharedTripDates(trip)}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2.5">
                    <MapPinned size={14} className="shrink-0 text-violet-400" />
                    <span className="min-w-0 flex-1 truncate text-xs font-black">{trip.label}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{sharedTripDates(trip)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-sm font-black">公開的旅行分享</h2>
        {posts.length === 0 ? (
          /*
            Said, not left blank. 「他還沒有公開的分享」 is an answer about them;
            an empty space is a question about whether this screen works.
          */
          <p data-testid="friend-no-posts" className="mt-2 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-bold text-slate-400">
            {person.displayName} 還沒有公開的旅行分享。
          </p>
        ) : (
          <ul data-testid="friend-posts" className="mt-2 grid grid-cols-2 gap-2.5">
            {posts.map(post => (
              <li key={post.id}>
                <button
                  type="button"
                  data-testid={`friend-post-${post.id}`}
                  disabled={!onOpenPost}
                  onClick={() => onOpenPost?.(post.id)}
                  className="block w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm"
                >
                  {post.coverImage
                    ? <img src={post.coverImage} alt="" className="block h-28 w-full object-cover" />
                    : <span className="block h-28 w-full bg-slate-100" />}
                  <span className="block p-2.5">
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
