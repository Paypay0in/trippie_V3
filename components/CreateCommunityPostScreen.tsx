import React, { useState } from 'react';
import { CommunityPost, UserProfile } from '../types';

interface Props { userId: string; profile: UserProfile; initialPost?: CommunityPost; onBack: () => void; onSave: (post: CommunityPost) => void; onPublish: (post: CommunityPost) => void; }

const CreateCommunityPostScreen: React.FC<Props> = ({ userId, profile, initialPost, onBack, onSave, onPublish }) => {
  const [title, setTitle] = useState(initialPost?.title || '');
  const [content, setContent] = useState(initialPost?.content || '');
  const [country, setCountry] = useState(initialPost?.country || '');
  const [city, setCity] = useState(initialPost?.city || '');
  const [coverImage, setCoverImage] = useState(initialPost?.coverImage || '');
  const buildPost = (status: CommunityPost['status']): CommunityPost => {
    const now = new Date().toISOString();
    return { id: initialPost?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`, creatorId: initialPost?.creatorId || userId, authorName: profile.name, authorAvatar: profile.avatar, title: title.trim(), content: content.trim(), country: country.trim(), city: city.trim(), coverImage: coverImage.trim() || undefined, status, createdAt: initialPost?.createdAt || now, updatedAt: now, publishedAt: status === 'published' ? (initialPost?.publishedAt || now) : initialPost?.publishedAt };
  };
  const valid = title.trim() && content.trim() && country.trim() && city.trim();
  return <main className="min-h-screen bg-[#f7f8fc] px-4 pb-10 pt-6 text-[#11183d] md:max-w-2xl md:mx-auto">
    <button type="button" onClick={onBack} className="mb-5 text-sm font-bold text-violet-600">← 返回社群</button>
    <h1 className="text-2xl font-black">發布旅行貼文</h1><p className="mt-1 text-sm text-slate-500">分享一段旅途中的風景與故事。</p>
    <div className="mt-6 space-y-4">{[['標題', title, setTitle, '東京三日遊'], ['內容', content, setContent, '今天去了淺草寺、晴空塔和 Shibuya Sky...'], ['國家', country, setCountry, '日本'], ['城市', city, setCity, '東京'], ['封面圖片網址（選填）', coverImage, setCoverImage, 'https://...']].map(([label, value, setter, placeholder]) => <label key={label as string} className="block text-sm font-bold"><span>{label as string}</span>{label === '內容' ? <textarea value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} rows={5} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 outline-none focus:border-violet-400" /> : <input value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-violet-400" />}</label>)}</div>
    <div className="mt-6 flex gap-3"><button type="button" disabled={!valid} onClick={() => onSave(buildPost('draft'))} className="flex-1 rounded-2xl border border-violet-200 bg-white px-4 py-3 font-black text-violet-700 disabled:opacity-40">儲存為草稿</button><button type="button" disabled={!valid} onClick={() => onPublish(buildPost('published'))} className="flex-1 rounded-2xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-40">發布</button></div>
  </main>;
};
export default CreateCommunityPostScreen;
