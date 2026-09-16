import React, { useState } from 'react';
import { LogOut, Pencil } from 'lucide-react';
import { CommunityPost, SavedInspiration } from '../types';
import MyPostsPanel from './MyPostsPanel';
import { AuthProfile } from '../services/authService';
import { AuthStatus } from '../types';

interface Props {
  authStatus: AuthStatus;
  profile: AuthProfile | null;
  email?: string;
  authAvailable: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onSaveProfile: (values: { displayName: string; avatarUrl?: string; bio?: string }) => Promise<void>;
  myPosts: CommunityPost[];
  savedInspirations: SavedInspiration[];
  completedTripCount: number;
  onTogglePostVisibility: (postId: string) => void;
  onDeletePost: (post: CommunityPost) => void;
  onCreatePost: () => void;
  onOpenPost: (postId: string) => void;
  saverCounts: Record<string, number>;
}

/**
 * The account page.
 *
 * Signing out is a page-level action, not a row in a list of things you might
 * want to do: it sits in the header, apart from everything that edits. Editing
 * the profile belongs to the profile card, on the card itself.
 */
const AccountScreen: React.FC<Props> = ({
  authStatus,
  profile,
  email,
  authAvailable,
  onSignIn,
  onSignOut,
  onSaveProfile,
  myPosts,
  savedInspirations,
  completedTripCount,
  onTogglePostVisibility,
  onDeletePost,
  onCreatePost,
  onOpenPost,
  saverCounts,
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.displayName || '');
  const [avatar, setAvatar] = useState(profile?.avatarUrl || '');
  const [bio, setBio] = useState(profile?.bio || '');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSaveProfile({ displayName: name, avatarUrl: avatar, bio });
    setEditing(false);
  };

  const signedIn = authStatus === 'authenticated' && profile;

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 pb-28 pt-6 text-[#11183d] md:mx-auto md:max-w-2xl">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-black">我的</h1>
        {signedIn && (
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-black text-slate-500 shadow-sm ring-1 ring-slate-100"
          >
            <LogOut size={15} />
            登出
          </button>
        )}
      </header>

      {signedIn ? (
        <>
          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-2xl font-black text-violet-700">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : profile.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-black">{profile.displayName}</h2>
                <p className="mt-0.5 truncate text-sm text-slate-500">{email || '已登入'}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">完成的旅行 {completedTripCount}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(current => !current)}
                aria-label="編輯個人資料"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500"
              >
                <Pencil size={16} />
              </button>
            </div>

            {editing && (
              <form onSubmit={save} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <label className="block text-sm font-bold">
                  顯示名稱
                  <input value={name} onChange={event => setName(event.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="block text-sm font-bold">
                  Avatar URL
                  <input value={avatar} onChange={event => setAvatar(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                </label>
                <label className="block text-sm font-bold">
                  簡介
                  <textarea value={bio} onChange={event => setBio(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                </label>
                <button className="min-h-11 w-full rounded-2xl bg-violet-600 font-black text-white">儲存</button>
              </form>
            )}
          </section>

          <MyPostsPanel
            posts={myPosts}
            savedInspirations={savedInspirations}
            onToggleVisibility={onTogglePostVisibility}
            onDelete={onDeletePost}
            onCreatePost={onCreatePost}
            onOpenPost={onOpenPost}
            saverCounts={saverCounts}
          />
        </>
      ) : (
        <section className="rounded-[28px] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">登入 Trippie</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">登入後可以建立你的創作者身份，未來也能跨裝置同步旅行資料。</p>
          {!authAvailable && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">目前無法連線帳號服務</p>}
          <button onClick={onSignIn} disabled={!authAvailable} className="mt-6 min-h-11 w-full rounded-2xl bg-violet-600 font-black text-white disabled:opacity-50">登入 / 建立帳號</button>
        </section>
      )}
    </main>
  );
};

export default AccountScreen;
