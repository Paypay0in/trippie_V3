import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MapPin, MessageCircle, Search, MoreHorizontal } from 'lucide-react';
import { CommunityPost } from '../types';
import AppBottomNav, { AppSection, BOTTOM_NAV_CLEARANCE } from './AppBottomNav';
import { fetchDestinationImage } from '../services/destinationImageService';
import AppWordmark from './AppWordmark';
import { hasLikedPost, loadLikedPosts, toggleLikedPost } from '../services/postLikes';

interface Props {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  onPlus: () => void;
  posts: CommunityPost[];
  onOpenPost: (postId: string) => void;
  onCreatePost: () => void;
  /** Real counts from the comments table; 0 is drawn, not hidden. */
  commentCounts?: Record<string, number>;
  /**
   * The people this traveller has accepted as friends.
   *
   * 追蹤 was removed because there was nothing behind it: the feed filtered on
   * `status` alone and `tab` was in the dependency array without ever being
   * read — three choices, one behaviour. The table it needed is migration
   * 0025, run 2026-10-18.
   *
   * Undefined means 「nobody is signed in」, which is different from 「signed in
   * with no friends yet」: the first has no such question to ask, the second
   * has an answer and it is empty.
   */
  friendIds?: string[];
}
const fallbackImage = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=85';

const CommunityHome: React.FC<Props> = ({ activeSection, onSectionChange, onPlus, posts, onOpenPost, onCreatePost, commentCounts = {}, friendIds }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'discover' | 'following' | 'next'>('discover');
  const [liked, setLiked] = useState<string[]>(() => loadLikedPosts());
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const feed = useMemo(() => posts
    .filter(post => post.status === 'published')
    // 追蹤 is 「posts by people I have accepted」, and nothing else.
    .filter(post => tab !== 'following' || (friendIds || []).includes(post.creatorId))
    .sort((a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime()),
  [posts, tab, friendIds]);
  useEffect(() => {
    let active = true;
    const destinations: string[] = Array.from(new Set(feed.map(post => `${post.country}・${post.city}`)));
    Promise.all(destinations.map(async destination => {
      const image = await fetchDestinationImage(destination);
      return image ? [destination, image.imageUrl] as const : null;
    })).then(results => {
      if (!active) return;
      const next = results.filter((result): result is readonly [string, string] => Boolean(result));
      setResolvedImages(previous => ({ ...previous, ...Object.fromEntries(next) }));
    });
    return () => { active = false; };
  }, [feed]);
  /*
    A tab exists only where something is behind it.

    「追蹤」 and 「下一個目的地」 once sat beside 「發現」 and did nothing: the feed
    filtered on `status` alone and `tab` was in the dependency array without
    ever being read. Three choices, one behaviour — so they went.

    追蹤 comes back now that the friendships table exists （migration 0025） and
    the feed actually filters on it. 下一個目的地 stays gone until it does
    something. The row draws itself the moment this list has two entries.
  */
  const tabs: Array<['discover' | 'following' | 'next', string]> = [
    ['discover', t('community.home.tab.discover')],
    ...(friendIds ? [['following', t('community.home.tab.following')] as ['following', string]] : []),
  ];
  return <div className={`mx-auto min-h-screen w-full bg-[#f7f8fc] text-[#11183d] shadow-2xl md:max-w-2xl lg:max-w-2xl ${BOTTOM_NAV_CLEARANCE}`}>
    <header data-safe-top style={{ ["--safe-top-base" as string]: "var(--header-top)" }} className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-[var(--screen-pad)] pb-2 backdrop-blur-xl"><div className="flex items-center justify-between"><AppWordmark />{/*
      No bell here.

      「這個是「旅行」的通知 不是社群的通知」. Everything behind it — a question on a
      shared bill, a flight that moved, an itinerary someone changed — belongs
      to a trip, and it now hangs under the bell on 旅行, which until now was
      drawn but wired to nothing.
    */}<div className="flex gap-3 text-slate-600"><button className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50" aria-label={t('community.home.searchAria')}><Search size={23} /></button><button className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50" aria-label={t('common.more')}><MoreHorizontal size={23} /></button></div></div>{tabs.length > 1 && <div className="mt-4 flex gap-6 overflow-x-auto text-sm font-black text-slate-400">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`relative shrink-0 pb-2 ${tab === key ? 'text-[#11183d]' : ''}`}>{label}{tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-600" />}</button>)}</div>}</header>
    <main className="w-full px-3 py-4">{activeSection !== 'community' ? <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl bg-white text-center shadow-sm"><div className="mb-3 text-4xl">{activeSection === 'services' ? '🧳' : '👤'}</div><h1 className="text-xl font-black">{activeSection === 'services' ? t('nav.services') : t('community.home.comingSoon.profile')}</h1><p className="mt-2 text-sm text-slate-400">{t('community.home.comingSoon.blurb')}</p></div> : feed.length === 0 ? <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl bg-white px-6 text-center shadow-sm"><div className="mb-3 text-5xl">🗺️</div><h1 className="text-xl font-black">{t('community.home.empty.title')}</h1><p className="mt-2 text-sm text-slate-400">{t('community.home.empty.blurb')}</p><button type="button" onClick={onCreatePost} className="mt-6 rounded-full bg-violet-600 px-5 py-3 text-sm font-bold text-white">{t('community.home.empty.cta')}</button></div> : <div data-testid="community-feed" className={feed.length === 1 ? '' : 'columns-2 gap-3'}>{/*
      Masonry needs something to balance. 「這個排版？」 — with one post the first
      column held it and the second stood empty, which reads as a layout that
      broke rather than a feed with one thing in it. A lone post takes the width
      it was going to take anyway.
    */}{feed.map(post => { const isLiked = hasLikedPost(liked, post.id); return <article key={post.id} className="mb-3 break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm"><button type="button" onClick={() => onOpenPost(post.id)} className="relative block w-full text-left"><img src={post.coverImage || resolvedImages[`${post.country}・${post.city}`] || fallbackImage} alt={post.title} className="block min-h-32 w-full object-cover" /><span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white">{post.country}・{post.city}</span></button><div className="p-3"><h2 className="text-sm font-black leading-5">{post.title}</h2><div className="mt-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-[10px] font-black text-violet-700">{post.authorAvatar ? <img src={post.authorAvatar} alt="" className="h-full w-full object-cover" /> : post.authorName.slice(0, 1)}</span><span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-500">{post.authorName}</span>{/*
                      A mark, not a tally.

                      「有留言跟愛心數」. This rendered {isLiked ? 1 : 0} — a
                      public-looking count that was only ever your own tap,
                      gone on the next reload. A post somebody did like read 0
                      to its author, and the 1 said 「one person liked this」
                      when it meant 「you did, for now」. It survives a reload
                      now and states no number, because the number it had was
                      not one. Counting everyone's needs post_likes, next to
                      post_comments.
                    */}<button type="button" data-testid={`like-${post.id}`} aria-pressed={isLiked} aria-label={isLiked ? t('community.home.unlike', { title: post.title }) : t('community.home.like', { title: post.title })} onClick={() => setLiked(current => toggleLikedPost(current, post.id))} className={`flex items-center ${isLiked ? 'text-rose-500' : 'text-slate-400'}`}><Heart size={15} fill={isLiked ? 'currentColor' : 'none'} /></button>{/* The one count here that is real. */}<span data-testid={`feed-comments-${post.id}`} className="flex items-center gap-1 text-[11px] font-bold text-slate-400"><MessageCircle size={13} />{commentCounts[post.id] ?? 0}</span></div><div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={12} />{post.country}・{post.city}</div></div></article>; })}</div>}</main><AppBottomNav active={activeSection} onChange={onSectionChange} onPlus={onPlus} />
  </div>;
};
export default CommunityHome;
