import React, { useEffect, useMemo, useState } from 'react';
import { OVERLAY } from '../constants/layers';
import { Ellipsis, MapPin, Plus } from 'lucide-react';
import { CommunityPost, SavedTravelInspiration } from '../types';
import { DestinationImage, fetchDestinationImage } from '../services/destinationImageService';
import { resolveSavedPlaceImage, SavedPlaceImageResult } from '../services/savedPlaceImageService';

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

const SavedTravelDestinationDetail: React.FC<Props> = ({ country, city, items, communityPosts, onBack, onRemove, onResolveItem, onOpenCommunityPost, onCreateTrip }) => {
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
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
    <header className="relative h-12 bg-white px-5">
      <button type="button" onClick={onBack} className="absolute left-5 top-3 text-sm font-black text-violet-600">← 旅行</button>
    </header>
    <section className="relative h-[200px] overflow-hidden">
      <img src={heroImage} alt={`${country}・${city}`} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#11183d]/80 via-transparent to-transparent" />
      <div className="absolute bottom-5 left-5 text-white">
        <h1 className="text-3xl font-black">{country}・{city}</h1>
        <p className="mt-1 text-sm font-semibold text-white/90">{items.length} 則旅行靈感</p>
        <p className="mt-1 text-xs text-white/75">來自你在社群收藏的旅行筆記</p>
      </div>
    </section>
    <section className="px-4 pt-4">
      <button type="button" onClick={() => onCreateTrip(country, city)} className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition active:scale-[.99]">
        <Plus size={17} strokeWidth={3} />建立{city}旅行
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">建立後可在行程規劃中挑選這裡的收藏靈感</p>
    </section>
    <section className="space-y-3 p-4">
      {items.map(item => {
        const creator = creatorById.get(item.sourceCreatorId);
        return <article key={item.id} className="relative flex gap-3 rounded-[20px] bg-white p-3 shadow-[0_4px_16px_rgba(15,23,42,.06)]">
          <PlaceThumbnail saved={item} sourcePost={communityPosts.find(post => post.id === item.sourcePostId)} />
          <div className="min-w-0 flex-1 pr-5"><h2 className="truncate text-base font-black text-[#11183d]">{item.placeName}</h2><p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} />{city}・{country}</p>
          <button type="button" aria-label={`${item.placeName} 更多選項`} onClick={() => setMenuItemId(current => current === item.id ? null : item.id)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50"><Ellipsis size={20} /></button>
          {menuItemId === item.id && <div className="absolute right-3 top-12 z-10 w-48 rounded-2xl border border-slate-100 bg-white p-1.5 text-left shadow-xl">
            <button type="button" onClick={() => setMenuItemId(null)} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-violet-50">編輯收藏內容<span className="mt-0.5 block text-[10px] font-medium text-slate-400">調整這個地點已收藏的旅行經驗</span></button>
            <button type="button" onClick={() => { setRemoveTarget(item); setMenuItemId(null); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50">移除這個地點<span className="mt-0.5 block text-[10px] font-medium text-rose-400">從我的旅行筆記移除</span></button>
          </div>}
          <div className="mt-2 space-y-1.5">
            {item.notes.map(note => {
              const sourcePost = note.sourcePostId ? communityPosts.find(post => post.id === note.sourcePostId) : undefined;
              const noteCreator = sourcePost ? { name: sourcePost.authorName, avatar: sourcePost.authorAvatar } : creatorById.get(note.sourceCreatorId) || creator;
              return <div key={note.id} className="flex min-w-0 items-start gap-1.5 rounded-lg bg-violet-50/75 px-2 py-1.5 text-xs leading-5 text-slate-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /><p className="min-w-0 flex-1 break-words">{note.text}</p><button type="button" aria-label={`查看 ${noteCreator?.name || '原作者'} 的原貼文`} onClick={(event) => { event.stopPropagation(); onOpenCommunityPost(note.sourcePostId); }} className="ml-1 inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-500 transition-opacity hover:opacity-70"><span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white text-[9px] text-violet-600">{noteCreator?.avatar ? <img src={noteCreator.avatar} alt="" className="h-full w-full object-cover" /> : '旅'}</span>{noteCreator?.name || '原作者'}</button>
              </div>;
            })}
          </div>
          </div>
        </article>;
      })}
    </section>
    {removeTarget && <div className={`fixed inset-0 ${OVERLAY.modal} flex items-center justify-center bg-slate-950/35 p-6`}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-black">移除這個地點？</h2><p className="mt-2 text-sm leading-6 text-slate-500">只會移除你收藏的「{removeTarget.placeName}」，不會刪除原始貼文。</p><div className="mt-5 flex gap-3"><button type="button" onClick={() => setRemoveTarget(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600">取消</button><button type="button" onClick={() => { onRemove(removeTarget.id); setRemoveTarget(null); }} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-black text-white">確認移除</button></div></div>
    </div>}
  </main>;
};

export default SavedTravelDestinationDetail;
