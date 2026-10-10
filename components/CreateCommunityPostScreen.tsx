import React, { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MAX_POST_PHOTOS, addPhotos, readAndDownscale, removePhoto } from '../services/postPhotos';
import { CommunityPost, UserProfile } from '../types';

interface Props { userId: string; profile: UserProfile; initialPost?: CommunityPost; onBack: () => void; onSave: (post: CommunityPost) => void; onPublish: (post: CommunityPost) => void; }

const CreateCommunityPostScreen: React.FC<Props> = ({ userId, profile, initialPost, onBack, onSave, onPublish }) => {
  const [title, setTitle] = useState(initialPost?.title || '');
  const [content, setContent] = useState(initialPost?.content || '');
  const [country, setCountry] = useState(initialPost?.country || '');
  const [city, setCity] = useState(initialPost?.city || '');
  const [coverImage, setCoverImage] = useState(initialPost?.coverImage || '');
  const [photos, setPhotos] = useState<string[]>(initialPost?.photos || []);
  const [photoNotice, setPhotoNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * The first photo becomes the cover unless one was typed in, so an author who
   * adds pictures gets a cover without being asked about it separately.
   */
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoNotice('');
    try {
      const read = await Promise.all(Array.from(files).map(readAndDownscale));
      const result = addPhotos(photos, read);
      setPhotos(result.photos);
      if (result.rejected > 0) setPhotoNotice(`一篇最多 ${MAX_POST_PHOTOS} 張，有 ${result.rejected} 張沒有加入`);
    } catch {
      setPhotoNotice('有照片讀取失敗，請再試一次');
    }
  };
  const buildPost = (status: CommunityPost['status']): CommunityPost => {
    const now = new Date().toISOString();
    return { id: initialPost?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`, creatorId: initialPost?.creatorId || userId, authorName: profile.name, authorAvatar: profile.avatar, title: title.trim(), content: content.trim(), country: country.trim(), city: city.trim(), coverImage: coverImage.trim() || photos[0] || undefined, photos: photos.length ? photos : undefined, status, createdAt: initialPost?.createdAt || now, updatedAt: now, publishedAt: status === 'published' ? (initialPost?.publishedAt || now) : initialPost?.publishedAt };
  };
  const valid = title.trim() && content.trim() && country.trim() && city.trim();
  return <main data-safe-top style={{ ["--safe-top-base" as string]: "1.5rem" }} className="min-h-screen bg-[#f7f8fc] px-4 pb-10 text-[#11183d] md:max-w-2xl md:mx-auto">
    <button type="button" onClick={onBack} className="mb-5 text-sm font-bold text-violet-600">← 返回社群</button>
    <h1 className="text-2xl font-black">發布旅行貼文</h1><p className="mt-1 text-sm text-slate-500">分享一段旅途中的風景與故事。</p>
    <div className="mt-6 space-y-4">{[['標題', title, setTitle, '東京三日遊'], ['內容', content, setContent, '今天去了淺草寺、晴空塔和 Shibuya Sky...'], ['國家', country, setCountry, '日本'], ['城市', city, setCity, '東京'], ['封面圖片網址（選填）', coverImage, setCoverImage, 'https://...']].map(([label, value, setter, placeholder]) => <label key={label as string} className="block text-sm font-bold"><span>{label as string}</span>{label === '內容' ? <textarea value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} rows={5} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 outline-none focus:border-violet-400" /> : <input value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-violet-400" />}</label>)}</div>
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">照片</span>
        <span className="text-xs font-bold text-slate-400">{photos.length} / {MAX_POST_PHOTOS}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map(photo => (
          <div key={photo} className="relative overflow-hidden rounded-xl">
            <img src={photo} alt="" className="h-24 w-full object-cover" />
            <button type="button" aria-label="移除照片" onClick={() => setPhotos(current => removePhoto(current, photo))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"><X size={13} /></button>
          </div>
        ))}
        {photos.length < MAX_POST_PHOTOS && (
          <button type="button" onClick={() => fileInput.current?.click()} className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
            <ImagePlus size={18} />
            <span className="text-[11px] font-bold">新增照片</span>
          </button>
        )}
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={event => { void handleFiles(event.target.files); event.target.value = ''; }} />
      {photoNotice && <p className="mt-2 text-xs font-bold text-amber-600">{photoNotice}</p>}
      <p className="mt-2 text-[11px] text-slate-400">照片會在上傳前縮圖，第一張會成為封面。</p>
    </section>

    <div className="mt-6 flex gap-3"><button type="button" disabled={!valid} onClick={() => onSave(buildPost('draft'))} className="flex-1 rounded-2xl border border-violet-200 bg-white px-4 py-3 font-black text-violet-700 disabled:opacity-40">儲存為草稿</button><button type="button" disabled={!valid} onClick={() => onPublish(buildPost('published'))} className="flex-1 rounded-2xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-40">發布</button></div>
  </main>;
};
export default CreateCommunityPostScreen;
