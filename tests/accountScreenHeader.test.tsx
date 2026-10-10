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
import { cleanup, render, screen } from '@testing-library/react';
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
