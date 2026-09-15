import React, { useState } from 'react';
import { CommunityPost, PostSlice, SavedTravelInspiration } from '../types';
import PostSliceConfirmation from './PostSliceConfirmation';
import { extractPostSliceCandidates } from '../services/communityPostSlicingService';

type SlicingState = 'idle' | 'analyzing' | 'candidates_ready' | 'extracted' | 'confirmed';
const CommunityPostDetail: React.FC<{ post: CommunityPost; fallbackImage: string; currentUserId: string; savedTravelInspirations: SavedTravelInspiration[]; onResetPersonalSaves: (postId: string) => void; onBack: () => void; onSaveSlices: (slices: PostSlice[]) => unknown }> = ({ post, fallbackImage, currentUserId, savedTravelInspirations, onResetPersonalSaves, onBack, onSaveSlices }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<PostSlice[] | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [cachedSelectionDismissed, setCachedSelectionDismissed] = useState(false);
  const savedFromThisPost = savedTravelInspirations.filter(item => item.savedByUserId === currentUserId && item.sourcePostId === post.id);
  const isPersonallySaved = savedFromThisPost.length > 0;
  const hasSourceSlices = Boolean(post.slices?.length);
  const state: SlicingState = loading ? 'analyzing' : candidates?.length ? 'candidates_ready' : isPersonallySaved ? 'confirmed' : hasSourceSlices && !cachedSelectionDismissed ? 'extracted' : 'idle';
  const analyze = async () => {
    if (state !== 'idle') return;
    setLoading(true); setError(''); setSavedMessage('');
    try {
      const extracted = await extractPostSliceCandidates({ postId: post.id, title: post.title, content: post.content, country: post.country, city: post.city });
      const now = new Date().toISOString();
      const nextCandidates = extracted.map((slice, index) => {
        const candidateId = `candidate-${index}`;
        return { ...slice, id: candidateId, postId: post.id, creatorId: post.creatorId, country: post.country, city: post.city, createdAt: now, notes: slice.notes.map((note, noteIndex) => ({ ...note, id: `${candidateId}-note-${noteIndex}`, sliceId: candidateId, postId: post.id, creatorId: post.creatorId, createdAt: now })) };
      });
      if (nextCandidates.length) setCandidates(nextCandidates); else setError('沒有找到可切成旅行靈感的內容');
    } catch (e) { setError(e instanceof Error ? e.message : 'AI 分析目前無法使用。'); } finally { setLoading(false); }
  };
  const confirmSlices = async (slices: PostSlice[]) => {
    if (!slices.length) return;
    const result = await onSaveSlices(slices);
    if (!result) { setError('無法儲存：找不到原始貼文'); return; }
    setCandidates(null);
    setSavedMessage(`已儲存 ${slices.length} 個旅行靈感`);
  };
  const ctaLabel = state === 'analyzing' ? '正在整理旅行靈感…' : state === 'candidates_ready' || state === 'extracted' ? '✓ 已抓出旅行靈感' : state === 'confirmed' ? '✓ 已收藏旅行靈感' : '✨ 抓出這篇值得收藏的旅行靈感';
  return <main className="min-h-screen bg-[#f7f8fc] pb-10 text-[#11183d] md:mx-auto md:max-w-2xl">
    <button type="button" onClick={onBack} className="px-4 pt-6 text-sm font-bold text-violet-600">← 返回社群</button>
    <img src={post.coverImage || fallbackImage} alt={post.title} className="mt-5 h-72 w-full object-cover" />
    <article className="p-5"><div className="text-sm font-bold text-slate-500">{post.authorName} · {post.country}・{post.city}</div><h1 className="mt-2 text-3xl font-black">{post.title}</h1><p className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-700">{post.content}</p><time className="mt-8 block text-xs text-slate-400">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('zh-TW') : ''}</time>
      <div className="mt-6"><button type="button" disabled={state !== 'idle'} onClick={analyze} className={`rounded-2xl px-4 py-3 text-sm font-black text-white ${state === 'candidates_ready' || state === 'extracted' || state === 'confirmed' ? 'bg-violet-100 text-violet-700' : 'bg-violet-600'} disabled:opacity-80`}>{ctaLabel}</button>{hasSourceSlices && <button type="button" onClick={() => { onResetPersonalSaves(post.id); setCachedSelectionDismissed(false); setCandidates(null); setSavedMessage(''); }} className="ml-2 rounded-2xl border border-rose-300 px-3 py-3 text-xs font-bold text-rose-600">重置這篇的個人收藏（DEV）</button>}{state === 'idle' && <p className="mt-2 text-xs text-slate-500">自動找出景點、餐廳與實用旅行經驗</p>}{state === 'extracted' && <p className="mt-2 text-xs font-semibold text-slate-500">這篇已整理出 {post.slices?.length ?? 0} 個旅行靈感，可直接選取收藏</p>}{state === 'candidates_ready' && <p className="mt-2 text-xs font-semibold text-slate-500">請檢查並選擇要儲存的內容</p>}{state === 'confirmed' && <p className="mt-2 text-xs font-semibold text-emerald-600">已收藏 {savedFromThisPost.length} 個旅行靈感</p>}{error && <p className="mt-3 text-sm font-bold text-rose-600">{error}</p>}{savedMessage && <p className="mt-3 text-sm font-bold text-emerald-600">{savedMessage}</p>}</div>
      <section className="mt-8"><h2 className="text-xl font-black">這篇提到的地方</h2>{state === 'idle' && <div className="mt-3 rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm"><p className="font-black text-slate-700">尚未分析</p><p className="mt-1">點擊上方按鈕，讓 AI 幫你找出這篇提到的景點與美食</p></div>}{state === 'extracted' && post.slices && <PostSliceConfirmation candidates={post.slices} onCancel={() => setCachedSelectionDismissed(true)} onConfirm={confirmSlices} />}{state === 'candidates_ready' && candidates && <PostSliceConfirmation candidates={candidates} onCancel={() => setCandidates(null)} onConfirm={confirmSlices} />}{(state === 'confirmed') && post.slices && <div className="mt-3 space-y-4">{post.slices.map(slice => <div key={slice.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-black text-violet-600">{slice.type}・{slice.city}・{slice.country}</div><h3 className="mt-1 text-base font-black">{slice.title}</h3>{slice.summary && <p className="mt-1 text-sm leading-6 text-slate-600">{slice.summary}</p>}<div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{slice.notes.map(note => <div key={note.id} className="text-sm text-slate-700"><span className="mr-2 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">{note.type}</span>{note.text}</div>)}</div></div>)}</div>}</section>
    </article></main>;
};
export default CommunityPostDetail;
