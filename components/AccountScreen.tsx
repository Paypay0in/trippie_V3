import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSetting from './LanguageSetting';
import { Bell, Image as ImageIcon, LogOut, Pencil, Settings, Sparkles } from 'lucide-react';
import { CommunityPost, SavedInspiration } from '../types';
import MyPostsPanel from './MyPostsPanel';
import AppWordmark from './AppWordmark';
import { BOTTOM_NAV_CLEARANCE } from './AppBottomNav';
import { AuthProfile } from '../services/authService';
import { loadProfileCover, saveProfileCover } from '../services/profileCover';
import { readAndDownscale } from '../services/postPhotos';
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
  /** 「有留言跟愛心數」 — counted from the comments table, not guessed. */
  commentCounts?: Record<string, number>;
  likeCounts?: Record<string, number>;
  /** 「這裡要有可以加朋友的欄位」 — rendered on the page that holds your account. */
  friendsPanel?: React.ReactNode;
  /**
   * 我的收藏集 — the named lists, injected the way the friends panel is.
   *
   * Injected rather than built here because the collection screens own the
   * publishing decisions, and a second place rendering them would be a second
   * place deciding what 公開 means.
   */
  collectionsPanel?: React.ReactNode;
  trips?: { id: string; name: string; destination?: string; startDate?: string; endDate?: string; coverImage?: string }[];
  onOpenTrip?: (tripId: string) => void;
  onOpenCreatorCenter: () => void;
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
  commentCounts,
  likeCounts,
  friendsPanel,
  collectionsPanel,
  trips,
  onOpenTrip,
  onOpenCreatorCenter,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cover, setCover] = useState<string | undefined>(() => loadProfileCover(profile?.userId));
  const [name, setName] = useState(profile?.displayName || '');
  const [avatar, setAvatar] = useState(profile?.avatarUrl || '');
  const [bio, setBio] = useState(profile?.bio || '');

  /*
    Picked from the roll and saved on the spot.

    The pencil is not inside the form, so leaving the new photo in local state
    would show a face that vanishes on the next render with nothing said. 320px
    is the largest this is ever drawn at, doubled for retina.
  */
  const pickAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profile) return;
    const dataUrl = await readAndDownscale(file, { maxEdge: 320 });
    setAvatar(dataUrl);
    await onSaveProfile({ displayName: profile.displayName, avatarUrl: dataUrl, bio: profile.bio });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSaveProfile({ displayName: name, avatarUrl: avatar, bio });
    setEditing(false);
  };

  const signedIn = authStatus === 'authenticated' && profile;

  return (
    <main data-safe-top style={{ ["--safe-top-base" as string]: "var(--header-top)" }} className={`min-h-screen bg-[#f7f8fc] px-[var(--screen-pad)] text-[#11183d] md:mx-auto md:max-w-2xl ${BOTTOM_NAV_CLEARANCE}`}>
      {/*
        The app's name, here too.

        「這頁沒 logo」. 社群 and 旅行 both open under the wordmark and this one
        did not, so the tab that holds your account was the one place the app
        stopped introducing itself — which reads as having been dropped into a
        settings page from somewhere else.
      */}
      {/*
        The app's name, here too.

        「這頁沒 logo」. 社群 and 旅行 both open under the wordmark and this one
        did not, so the tab that holds your account was the one place the app
        stopped introducing itself.
      */}
      <header className="mb-3 flex items-center justify-between">
        <AppWordmark />
        {signedIn && (
          <div className="flex gap-3 text-slate-600">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50"
              aria-label={t('account.notifications')}
            >
              <Bell size={21} />
            </button>
            {/*
              A gear, and a gear's worth of things behind it.

              The design puts settings here, and the actions this screen owns
              that are not 「edit the thing in front of you」 are exactly two:
              editing the profile, and signing out. 登出 had been a button of
              its own in the header, which gave a destructive action the same
              weight as the page title.
            */}
            <button
              type="button"
              data-testid="account-settings"
              onClick={() => setMenuOpen(current => !current)}
              aria-expanded={menuOpen}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50"
              aria-label={t('account.settings')}
            >
              <Settings size={21} />
            </button>
          </div>
        )}
      </header>

      {signedIn && menuOpen && (
        <div className="mb-3 space-y-3">
        {/*
          Language sits inside 設定 because that is where 「我」 was told to put
          it, and above the two account actions because it is the one setting
          on this screen that somebody may be here specifically to find — a
          traveller looking at the app in a language they do not read cannot
          navigate past it to anything else.
        */}
        <LanguageSetting />
        <div data-testid="account-menu" className="overflow-hidden rounded-card border border-hairline bg-white">
          <button
            type="button"
            onClick={() => { setMenuOpen(false); setEditing(true); }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-field font-semibold"
          >
            <Pencil size={16} className="text-slate-400" />{t('account.editProfile')}
          </button>
          <button
            type="button"
            data-testid="sign-out"
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 border-t border-hairline px-4 py-3 text-left text-field font-semibold text-rose-600"
          >
            <LogOut size={16} />{t('account.signOut')}
          </button>
        </div>
        </div>
      )}

      {signedIn ? (
        <>
          <section>
            {/*
              A cover, and the avatar sitting on its edge.

              The profile was a white card with a 64px circle in it, which is
              the shape of a settings row rather than of somebody's page.
            */}
            <div className="relative h-[clamp(7rem,17vh,9.5rem)] overflow-hidden rounded-cover bg-gradient-to-br from-violet-100 to-sky-100">
              {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
              <label className="absolute right-3 top-3 flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/90 px-3 text-meta font-semibold text-ink shadow-sm backdrop-blur">
                <ImageIcon size={14} />
                {t('account.changeCover')}
                <input
                  type="file"
                  accept="image/*"
                  data-testid="change-cover"
                  className="hidden"
                  onChange={async event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    const dataUrl = await readAndDownscale(file, { maxEdge: 1200 });
                    saveProfileCover(profile.userId, dataUrl);
                    setCover(dataUrl);
                  }}
                />
              </label>
            </div>

            <div className="-mt-11 flex items-end gap-3 px-1">
              <div className="relative shrink-0">
                <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-4 border-[#f7f8fc] bg-violet-100 text-2xl font-black text-violet-700">
                  {profile.avatarUrl
                    ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                    : profile.displayName.slice(0, 1)}
                </div>
                {/*
                  The pencil picks a photo.

                  「我需要可以上傳大頭照的地方」. It opened a form whose avatar field
                  was a text box labelled 「Avatar URL」 — which asks somebody
                  holding a phone to produce a public link to a picture that
                  only exists in their camera roll. There was no way to set an
                  avatar from the device at all.
                */}
                <label
                  aria-label={t('account.changeAvatar')}
                  className="absolute -right-0.5 bottom-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-[#f7f8fc] bg-white text-slate-500 shadow-sm"
                >
                  <Pencil size={13} />
                  <input
                    type="file"
                    accept="image/*"
                    data-testid="change-avatar"
                    className="hidden"
                    onChange={event => void pickAvatar(event)}
                  />
                </label>
              </div>
            </div>

            <div className="mt-2 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-screen-title font-bold">{profile.displayName}</h1>
                <p className="mt-0.5 truncate text-support text-ink-soft">{email || t('account.signedIn')}</p>
                {profile.bio && (
                  <p className="mt-1 text-support text-ink-soft">{profile.bio}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenCreatorCenter}
                className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-3.5 text-meta font-bold text-white shadow-sm"
              >
                <Sparkles size={14} />
                {t('account.creatorCenter')}
              </button>
            </div>

            {/*
              Three numbers the app can actually answer.

              The design also shows likes and comments on each post. There is
              no such thing in this app — no like, no comment, nowhere they
              could be counted from — so they are left out rather than drawn
              with invented figures on somebody's own profile.
            */}
            <dl className="mt-4 grid grid-cols-3 rounded-card border border-hairline bg-white py-3">
              {([
                ['posts', myPosts.length, t('account.statPosts')],
                ['trips', completedTripCount, t('account.statCompletedTrips')],
                ['saved', savedInspirations.length, t('account.statSaved')],
              ] as const).map(([key, value, label], index) => (
                <div
                  key={key}
                  data-testid={`account-stat-${key}`}
                  className={`text-center ${index > 0 ? 'border-l border-hairline' : ''}`}
                >
                  <dt className="sr-only">{label}</dt>
                  <dd className="text-section font-black">{value}</dd>
                  <dd className="mt-0.5 text-meta text-ink-soft">{label}</dd>
                </div>
              ))}
            </dl>

            {editing && (
              <form onSubmit={save} className="mt-4 space-y-3 rounded-card border border-hairline bg-white p-4">
                <label className="block text-support font-semibold">
                  {t('account.displayName')}
                  <input value={name} onChange={event => setName(event.target.value)} required className="mt-1.5 h-[var(--control-h)] w-full rounded-field border border-hairline px-3 text-field" />
                </label>
                <div className="text-support font-semibold">
                  {t('account.avatar')}
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-field font-black text-violet-700">
                      {avatar
                        ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                        : (name || '?').slice(0, 1)}
                    </span>
                    <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-hairline px-3.5 text-support font-semibold">
                      <ImageIcon size={15} />
                      {t('account.pickFromLibrary')}
                      <input
                        type="file"
                        accept="image/*"
                        data-testid="pick-avatar"
                        className="hidden"
                        onChange={async event => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (!file) return;
                          setAvatar(await readAndDownscale(file, { maxEdge: 320 }));
                        }}
                      />
                    </label>
                    {avatar && (
                      <button
                        type="button"
                        data-testid="clear-avatar"
                        onClick={() => setAvatar('')}
                        className="min-h-11 text-support font-semibold text-slate-400"
                      >
                        {t('common.remove')}
                      </button>
                    )}
                  </div>
                  {/* A link still works for anyone who has one; it is no longer the only way. */}
                  <input
                    value={avatar.startsWith('data:') ? '' : avatar}
                    onChange={event => setAvatar(event.target.value)}
                    placeholder={t('account.avatarUrlPlaceholder')}
                    className="mt-2 h-[var(--control-h)] w-full rounded-field border border-hairline px-3 text-field font-normal placeholder:text-slate-300"
                  />
                </div>
                <label className="block text-support font-semibold">
                  {t('account.bio')}
                  <textarea value={bio} onChange={event => setBio(event.target.value)} rows={3} className="mt-1.5 w-full rounded-field border border-hairline px-3 py-2 text-field" />
                </label>
                <button className="h-[var(--cta-h)] w-full rounded-control bg-violet-600 text-action font-semibold text-white">{t('common.save')}</button>
              </form>
            )}
          </section>

          {collectionsPanel}
          {friendsPanel}

          <MyPostsPanel
            posts={myPosts}
            savedInspirations={savedInspirations}
            onToggleVisibility={onTogglePostVisibility}
            onDelete={onDeletePost}
            onCreatePost={onCreatePost}
            onOpenPost={onOpenPost}
            saverCounts={saverCounts}
            commentCounts={commentCounts}
            likeCounts={likeCounts}
            trips={trips}
            onOpenTrip={onOpenTrip}
          />
        </>
      ) : (
        <section className="rounded-[28px] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">{t('account.signInTitle')}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">{t('account.signInBlurb')}</p>
          {!authAvailable && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">{t('account.authUnavailable')}</p>}
          <button onClick={onSignIn} disabled={!authAvailable} className="mt-6 min-h-11 w-full rounded-2xl bg-violet-600 font-black text-white disabled:opacity-50">{t('account.signInCta')}</button>
          {/*
            Also here, because the gear only exists once you are signed in.
            Somebody who opened the app in the wrong language and cannot read
            the sign-in screen would otherwise have no way to change it
            without an account.
          */}
          <div className="mt-6">
            <LanguageSetting />
          </div>
        </section>
      )}
    </main>
  );
};

export default AccountScreen;
