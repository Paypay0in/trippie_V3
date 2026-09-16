import React from 'react';
import { ArrowLeft, Bookmark, MessageCircle, PenLine } from 'lucide-react';
import { CommunityPost, PostComment, SavedInspiration } from '../types';

interface Props {
  posts: CommunityPost[];
  comments: PostComment[];
  savedInspirations: SavedInspiration[];
  onBack: () => void;
  onOpenPost: (postId: string) => void;
  onCreatePost: () => void;
}

/**
 * What this account's writing has done for other travellers.
 *
 * Every figure here is counted from records the app already holds — posts,
 * comments, saved inspirations. Nothing is estimated, and where there is no
 * data yet the screen says so rather than showing a zero dressed as a metric;
 * a creator dashboard that invents its own numbers is worse than none.
 */
const CreatorCenterScreen: React.FC<Props> = ({
  posts,
  comments,
  savedInspirations,
  onBack,
  onOpenPost,
  onCreatePost,
}) => {
  const published = posts.filter(post => post.status === 'published');
  const postIds = new Set(posts.map(post => post.id));

  const saversByPost = new Map<string, Set<string>>();
  savedInspirations.forEach(item => {
    if (!postIds.has(item.sourcePostId) || !item.savedByUserId) return;
    const people = saversByPost.get(item.sourcePostId) ?? new Set<string>();
    people.add(item.savedByUserId);
    saversByPost.set(item.sourcePostId, people);
  });

  // Distinct readers across every post: the same person saving from two posts
  // is one reader reached, not two.
  const allSavers = new Set<string>();
  savedInspirations.forEach(item => {
    if (postIds.has(item.sourcePostId) && item.savedByUserId) allSavers.add(item.savedByUserId);
  });

  const receivedComments = comments.filter(comment => postIds.has(comment.postId));

  const ranked = [...posts]
    .map(post => ({ post, savers: saversByPost.get(post.id)?.size ?? 0 }))
    .filter(entry => entry.savers > 0)
    .sort((a, b) => b.savers - a.savers)
    .slice(0, 3);

  const stats: Array<[React.ElementType, string, number]> = [
    [PenLine, '已公開貼文', published.length],
    [Bookmark, '收藏你的旅人', allSavers.size],
    [MessageCircle, '收到的留言', receivedComments.length],
  ];

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 pb-28 pt-6 text-[#11183d] md:mx-auto md:max-w-2xl">
      <button type="button" onClick={onBack} className="mb-5 flex min-h-11 items-center gap-1.5 text-sm font-bold text-violet-600">
        <ArrowLeft size={16} />返回
      </button>

      <h1 className="text-2xl font-black">創作者中心</h1>
      <p className="mt-1 text-sm text-slate-500">你的旅行紀錄幫到了誰。</p>

      <section className="mt-5 grid grid-cols-3 gap-3">
        {stats.map(([Icon, label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <Icon size={17} className="mx-auto text-violet-600" />
            <div className="mt-2 text-2xl font-black">{value}</div>
            <div className="mt-0.5 text-[11px] font-bold text-slate-400">{label}</div>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-black">最多人收藏的貼文</h2>
        {ranked.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
            <p className="text-sm text-slate-400">還沒有人從你的貼文收藏旅行靈感</p>
            <button type="button" onClick={onCreatePost} className="mt-3 min-h-11 rounded-2xl bg-violet-600 px-5 text-sm font-black text-white">
              寫一篇新的
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map(({ post, savers }, index) => (
              <button
                key={post.id}
                type="button"
                onClick={() => onOpenPost(post.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-sm font-black text-violet-700">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{post.title || '未命名貼文'}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {[post.country, post.city].filter(Boolean).join('・')}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-black text-violet-600">{savers} 人</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-[11px] leading-4 text-slate-400">
        數字只計算目前同步到這個帳號的資料。
      </p>
    </main>
  );
};

export default CreatorCenterScreen;
