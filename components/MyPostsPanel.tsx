import React, { useState } from 'react';
import { Bookmark, Eye, EyeOff, Lock, MapPin, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { CommunityPost, SavedInspiration } from '../types';

interface Props {
  posts: CommunityPost[];
  savedInspirations: SavedInspiration[];
  onToggleVisibility: (postId: string) => void;
  onDelete: (post: CommunityPost) => void;
  onCreatePost: () => void;
}

/**
 * Everything this account has written, laid out as a grid of covers.
 *
 * Until now a post could only be reached by scrolling the feed until it turned
 * up, so an author had no way to review what they had published, take one
 * back, or delete it.
 *
 * 公開 / 僅自己可見 is the post's existing published/draft state under the
 * name people actually use for it — nothing new to keep in step with the feed,
 * which already shows published posts only.
 */
const MyPostsPanel: React.FC<Props> = ({
  posts,
  savedInspirations,
  onToggleVisibility,
  onDelete,
  onCreatePost,
}) => {
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <section className="mt-6">
      <div className="mb-4 flex border-b border-slate-200">
        {([
          ['posts', '我的貼文', <Bookmark key="p" size={16} />],
          ['saved', '我的收藏', <MapPin key="s" size={16} />],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-black transition-colors ${
              tab === id ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-400'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' ? (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-black text-[#11183d]">我的貼文</h2>
            <span className="text-xs font-bold text-slate-400">{posts.length} 篇</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {posts.map(post => {
              const isPublic = post.status === 'published';
              return (
                <div key={post.id} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  {post.coverImage ? (
                    <img src={post.coverImage} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center bg-slate-100 text-slate-300">
                      <MapPin size={22} />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-black leading-5 text-[#11183d]">{post.title || '未命名貼文'}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-400">
                      {[post.country, post.city].filter(Boolean).join('・') || '未填地點'}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                          isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isPublic ? null : <Lock size={10} />}
                        {isPublic ? '公開' : '僅自己可見'}
                      </span>
                      <button
                        type="button"
                        aria-label={`貼文選項：${post.title || '未命名貼文'}`}
                        onClick={() => setOpenMenuId(current => (current === post.id ? null : post.id))}
                        className="rounded-lg p-1 text-slate-400"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>

                  {openMenuId === post.id && (
                    /* The reversible action sits above the irreversible one, so
                       someone reaching to take a post down does not meet delete
                       first. */
                    <div className="absolute inset-x-2 bottom-2 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
                      <button
                        type="button"
                        onClick={() => { onToggleVisibility(post.id); setOpenMenuId(null); }}
                        className="flex min-h-11 w-full items-center gap-2 px-3 text-xs font-black text-slate-600"
                      >
                        {isPublic ? <EyeOff size={14} /> : <Eye size={14} />}
                        {isPublic ? '改為僅自己可見' : '公開這篇'}
                      </button>
                      <button
                        type="button"
                        aria-label={`刪除貼文：${post.title || '未命名貼文'}`}
                        onClick={() => { onDelete(post); setOpenMenuId(null); }}
                        className="flex min-h-11 w-full items-center gap-2 border-t border-slate-100 px-3 text-xs font-black text-rose-600"
                      >
                        <Trash2 size={14} />
                        刪除貼文
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={onCreatePost}
              className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600"><Plus size={20} /></span>
              <span className="text-sm font-black text-[#11183d]">新增貼文</span>
              <span className="text-[11px] text-slate-400">分享你的旅行故事</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-black text-[#11183d]">我的收藏</h2>
            <span className="text-xs font-bold text-slate-400">{savedInspirations.length} 個</span>
          </div>
          {savedInspirations.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
              還沒有收藏任何旅行靈感
            </p>
          ) : (
            <div className="space-y-2">
              {savedInspirations.map(item => (
                <div key={item.id} className="flex items-start gap-2.5 rounded-2xl border border-slate-100 bg-white px-3 py-3">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-violet-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#11183d]">{item.placeName || item.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {[item.country, item.city].filter(Boolean).join('・') || item.address || ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default MyPostsPanel;
