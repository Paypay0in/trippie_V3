import React from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { CommunityPost } from '../types';

interface Props {
  posts: CommunityPost[];
  onToggleVisibility: (postId: string) => void;
  onDelete: (post: CommunityPost) => void;
}

/**
 * Everything this account has written, in one place.
 *
 * Until now a post could only be reached by scrolling the feed until it turned
 * up, which means an author had no way to review what they had published, take
 * something back, or delete it. Those are the three things people expect to be
 * able to do with their own writing.
 *
 * 公開 / 不公開 is the post's existing published/draft state under the name
 * people actually use for it. Unpublishing is the reversible option and sits
 * next to the irreversible one, so the gentler action is always in reach.
 */
const MyPostsPanel: React.FC<Props> = ({ posts, onToggleVisibility, onDelete }) => (
  <section className="px-4 pb-6">
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-black text-[#11183d]">我的貼文</h2>
      <span className="text-xs font-bold text-slate-400">{posts.length} 篇</span>
    </div>

    {posts.length === 0 ? (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
        還沒有發過貼文
      </p>
    ) : (
      <div className="space-y-2.5">
        {posts.map(post => {
          const isPublic = post.status === 'published';
          return (
            <div key={post.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex gap-3">
                {post.coverImage && (
                  <img
                    src={post.coverImage}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[#11183d]">{post.title || '未命名貼文'}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {[post.country, post.city].filter(Boolean).join('・') || '未填地點'}
                  </p>
                  <span
                    className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${
                      isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isPublic ? '公開' : '不公開'}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onToggleVisibility(post.id)}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-50 text-xs font-black text-slate-600"
                >
                  {isPublic ? <EyeOff size={15} /> : <Eye size={15} />}
                  {isPublic ? '改為不公開' : '公開這篇'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(post)}
                  aria-label={`刪除貼文：${post.title || '未命名貼文'}`}
                  className="flex min-h-11 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </section>
);

export default MyPostsPanel;
