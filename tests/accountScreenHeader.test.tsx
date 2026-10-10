/**
 * @vitest-environment jsdom
 *
 * 「這頁沒 logo 雲端同步的顯示應該可以拿掉了」.
 *
 * 社群 and 旅行 both open under the wordmark; 我的 did not, so the tab holding
 * your own account was the one place the app stopped introducing itself.
 *
 * And above it sat a panel reporting 已登入 <your address>, 本機有 6 趟旅程 with a
 * 檢查雲端連線 button — diagnostics from when syncing was being built, printed
 * permanently above the screen where the same account is already named, in
 * larger type, with its avatar.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AccountScreen from '../components/AccountScreen';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const renderAccount = () =>
  render(
    <AccountScreen
      authStatus="authenticated"
      profile={{ displayName: 'Ann' } as never}
      email="washop0517@gmail.com"
      authAvailable
      onSignIn={vi.fn()}
      onSignOut={vi.fn()}
      onSaveProfile={vi.fn()}
      myPosts={[]}
      savedInspirations={[]}
      completedTripCount={0}
      onTogglePostVisibility={vi.fn()}
      onDeletePost={vi.fn()}
      onCreatePost={vi.fn()}
      onOpenPost={vi.fn()}
      saverCounts={{}}
      onOpenCreatorCenter={vi.fn()}
    />,
  );

afterEach(cleanup);

describe('我的', () => {
  it('跟其他分頁一樣掛著 Trippie', () => {
    renderAccount();
    expect(screen.getByTestId('app-wordmark').textContent).toContain('Trippie');
  });

  it('logo 跟社群、旅行同一個尺寸', () => {
    renderAccount();
    expect(screen.getByTestId('app-wordmark').className).toContain('text-[1.75rem]');
  });

  it('底下留了浮動導覽列的空間', () => {
    const { container } = renderAccount();
    expect((container.firstElementChild as HTMLElement).className)
      .toContain('env(safe-area-inset-bottom)');
  });

  it('帳號本來就寫在這頁上了', () => {
    renderAccount();
    expect(screen.getByText('washop0517@gmail.com')).toBeTruthy();
  });
});

describe('雲端同步面板', () => {
  it('不再掛在任何畫面上', () => {
    const app = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
    expect(app).not.toContain('<CloudSyncStatus');
    expect(app).not.toContain('components/CloudSyncStatus');
  });
});

/**
 * 「100%還原」 — the account page as a profile rather than a settings list.
 *
 * It had been a white card with a 64px circle in it: the shape of a settings
 * row, not of somebody's page. The design opens on a cover, hangs the avatar
 * on its edge, and states three numbers.
 */
describe('個人頁', () => {
  it('有封面，而且換得掉', () => {
    renderAccount();
    expect(screen.getByTestId('change-cover')).toBeTruthy();
    expect(screen.getByText('更換封面')).toBeTruthy();
  });

  it('頭像是 88px，掛在封面邊上', () => {
    const { container } = renderAccount();
    expect(container.querySelector('.h-\\[88px\\]')).toBeTruthy();
  });

  it('三個數字都是這個 app 答得出來的', () => {
    renderAccount();
    expect(screen.getByTestId('account-stat-posts').textContent).toContain('貼文');
    expect(screen.getByTestId('account-stat-trips').textContent).toContain('完成的旅程');
    expect(screen.getByTestId('account-stat-saved').textContent).toContain('收藏');
  });

  /**
   * The design also shows a like count and a comment count on every post.
   * This app has neither — no like, no comment, nowhere to count them from —
   * so drawing them would be inventing figures on somebody's own profile.
   */
  it('沒有按讚數、留言數 —— 那兩個東西不存在', () => {
    renderAccount();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('按讚');
    expect(text).not.toContain('留言');
  });

  it('簡介有填才出現', () => {
    renderAccount();
    expect(screen.queryByText(/喜歡用旅行/)).toBeNull();

    cleanup();
    render(
      <AccountScreen
        authStatus="authenticated"
        profile={{ userId: 'u1', displayName: 'Ann', bio: '喜歡用旅行收集世界的故事 ✈️' } as never}
        email="washop0517@gmail.com"
        authAvailable
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
        onSaveProfile={vi.fn()}
        myPosts={[]}
        savedInspirations={[]}
        completedTripCount={0}
        onTogglePostVisibility={vi.fn()}
        onDeletePost={vi.fn()}
        onCreatePost={vi.fn()}
        onOpenPost={vi.fn()}
        saverCounts={{}}
        onOpenCreatorCenter={vi.fn()}
      />,
    );
    expect(screen.getByText('喜歡用旅行收集世界的故事 ✈️')).toBeTruthy();
  });
});

/**
 * 登出 had been a button in the header, which gave a destructive action the
 * same weight as the page title. The design puts a gear there instead.
 */
describe('設定', () => {
  it('標題列是鈴鐺和齒輪，不是一顆登出按鈕', () => {
    renderAccount();
    expect(screen.getByTestId('account-settings')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
  });

  it('登出在齒輪底下，而且還是做得到', () => {
    const onSignOut = vi.fn();
    render(
      <AccountScreen
        authStatus="authenticated"
        profile={{ userId: 'u1', displayName: 'Ann' } as never}
        email="a@b.c"
        authAvailable
        onSignIn={vi.fn()}
        onSignOut={onSignOut}
        onSaveProfile={vi.fn()}
        myPosts={[]}
        savedInspirations={[]}
        completedTripCount={0}
        onTogglePostVisibility={vi.fn()}
        onDeletePost={vi.fn()}
        onCreatePost={vi.fn()}
        onOpenPost={vi.fn()}
        saverCounts={{}}
        onOpenCreatorCenter={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('account-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('account-settings'));
    fireEvent.click(screen.getByTestId('sign-out'));
    expect(onSignOut).toHaveBeenCalled();
  });
});
