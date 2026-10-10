import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MapPin, Search, MoreHorizontal } from 'lucide-react';
import { CommunityPost } from '../types';
import AppBottomNav, { AppSection, BOTTOM_NAV_CLEARANCE } from './AppBottomNav';
import { fetchDestinationImage } from '../services/destinationImageService';

interface Props {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  onPlus: () => void;
  posts: CommunityPost[];
  onOpenPost: (postId: string) => void;
  onCreatePost: () => void;
}
const fallbackImage = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=85';

const CommunityHome: React.FC<Props> = ({ activeSection, onSectionChange, onPlus, posts, onOpenPost, onCreatePost }) => {
  const [tab, setTab] = useState<'discover' | 'following' | 'next'>('discover');
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const feed = useMemo(() => posts.filter(post => post.status === 'published').sort((a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime()), [posts, tab]);
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
  const tabs: ['discover' | 'following' | 'next', string][] = [['discover', '發現'], ['following', '追蹤'], ['next', '下一個目的地']];
  return <div className={`mx-auto min-h-screen w-full bg-[#f7f8fc] text-[#11183d] shadow-2xl md:max-w-2xl lg:max-w-2xl ${BOTTOM_NAV_CLEARANCE}`}>
    <header data-safe-top className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pb-2 backdrop-blur-xl"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xl font-black"><span className="text-violet-600">✈</span>Trippie</div>{/*
      No bell here.

      「這個是「旅行」的通知 不是社群的通知」. Everything behind it — a question on a
      shared bill, a flight that moved, an itinerary someone changed — belongs
      to a trip, and it now hangs under the bell on 旅行, which until now was
      drawn but wired to nothing.
    */}<div className="flex gap-1 text-slate-500"><button className="rounded-full p-2" aria-label="搜尋"><Search size={20} /></button><button className="rounded-full p-2" aria-label="更多"><MoreHorizontal size={20} /></button></div></div><div className="mt-4 flex gap-6 overflow-x-auto text-sm font-black text-slate-400">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`relative shrink-0 pb-2 ${tab === key ? 'text-[#11183d]' : ''}`}>{label}{tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-600" />}</button>)}</div></header>
    <main className="w-full px-3 py-4">{activeSection !== 'community' ? <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl bg-white text-center shadow-sm"><div className="mb-3 text-4xl">{activeSection === 'services' ? '🧳' : '👤'}</div><h1 className="text-xl font-black">{activeSection === 'services' ? '服務' : '我的'}</h1><p className="mt-2 text-sm text-slate-400">這個區域將在後續版本開放。</p></div> : feed.length === 0 ? <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl bg-white px-6 text-center shadow-sm"><div className="mb-3 text-5xl">🗺️</div><h1 className="text-xl font-black">還沒有旅行分享</h1><p className="mt-2 text-sm text-slate-400">分享第一篇旅行故事</p><button type="button" onClick={onCreatePost} className="mt-6 rounded-full bg-violet-600 px-5 py-3 text-sm font-bold text-white">發布旅行貼文</button></div> : <div data-testid="community-feed" className={feed.length === 1 ? '' : 'columns-2 gap-3'}>{/*
      Masonry needs something to balance. 「這個排版？」 — with one post the first
      column held it and the second stood empty, which reads as a layout that
      broke rather than a feed with one thing in it. A lone post takes the width
      it was going to take anyway.
    */}{feed.map(post => { const isLiked = !!liked[post.id]; return <article key={post.id} className="mb-3 break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm"><button type="button" onClick={() => onOpenPost(post.id)} className="relative block w-full text-left"><img src={post.coverImage || resolvedImages[`${post.country}・${post.city}`] || fallbackImage} alt={post.title} className="block min-h-32 w-full object-cover" /><span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white">{post.country}・{post.city}</span></button><div className="p-3"><h2 className="text-sm font-black leading-5">{post.title}</h2><div className="mt-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-[10px] font-black text-violet-700">{post.authorAvatar ? <img src={post.authorAvatar} alt="" className="h-full w-full object-cover" /> : post.authorName.slice(0, 1)}</span><span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-500">{post.authorName}</span><button onClick={() => setLiked(prev => ({ ...prev, [post.id]: !isLiked }))} className={`flex items-center gap-1 text-[11px] font-bold ${isLiked ? 'text-rose-500' : 'text-slate-400'}`}><Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />{isLiked ? 1 : 0}</button></div><div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={12} />{post.country}・{post.city}</div></div></article>; })}</div>}</main><AppBottomNav active={activeSection} onChange={onSectionChange} onPlus={onPlus} />
  </div>;
};
export default CommunityHome;
