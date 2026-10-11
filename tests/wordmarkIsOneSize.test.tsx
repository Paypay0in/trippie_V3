/**
 * @vitest-environment jsdom
 *
 * 「旅行的 logo 跟社群的 logo 我希望一樣大小 不要時大時小」.
 *
 * 社群 and 旅行 each drew their own header, so the wordmark was 20px on one and
 * 32px on the other. Nothing looked wrong on either screen alone — the fault
 * existed only in the moment of tapping between them, where the app's own name
 * jumps and the page reads as having reloaded into something else.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import CommunityHome from '../components/CommunityHome';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(cleanup);

const travelHeader = () => {
  render(
    <TravelHome
      activeSection="trips"
      onSectionChange={vi.fn()}
      onPlus={vi.fn()}
      drafts={[]}
      tripHistory={[]}
      activeDraftId={null}
      onContinueDraft={vi.fn()}
      onContinueTrip={vi.fn()}
      onCreateNew={vi.fn()}
      onOpenPlanner={vi.fn()}
      savedTravelInspirations={[]}
      communityPosts={[]}
      onOpenSavedDestination={vi.fn()}
      authStatus="anonymous"
    />,
  );
  return screen.getByTestId('app-wordmark');
};

const communityHeader = () => {
  render(
    <CommunityHome
      activeSection="community"
      onSectionChange={vi.fn()}
      onPlus={vi.fn()}
      posts={[]}
      onOpenPost={vi.fn()}
      onCreatePost={vi.fn()}
    />,
  );
  return screen.getByTestId('app-wordmark');
};

describe('Trippie 這四個字', () => {
  it('兩邊都用同一個元件畫出來', () => {
    const travel = travelHeader().className;
    cleanup();
    const community = communityHeader().className;

    expect(travel).toBe(community);
  });

  it('大小寫死在一個地方，不是各自寫各自的', () => {
    expect(travelHeader().className).toContain('text-[1.75rem]');
  });

  it('旁邊的飛機也跟著同一個尺寸', () => {
    const plane = travelHeader().firstElementChild as HTMLElement;
    expect(plane.className).toContain('text-[1.6rem]');
  });

  it('兩邊都看得到 Trippie', () => {
    expect(travelHeader().textContent).toContain('Trippie');
    cleanup();
    expect(communityHeader().textContent).toContain('Trippie');
  });
});

/**
 * 「不一樣大」, said after 社群 and 旅行 had been made to agree.
 *
 * They had — but 旅程書架 was drawing a third wordmark of its own, 24px beside a
 * gradient Sparkles tile, so the name still changed shape on the way into a
 * trip. Unifying two of three headers fixes the pair you looked at and leaves
 * the fault alive.
 *
 * Hunting the copies one screenshot at a time is how this took three rounds.
 * The source is checked instead, so the next one is caught before it ships.
 */
describe('沒有第二個寫死的 Trippie', () => {
  /*
    「統一」 — the two account screens were the last exemption and are gone.

    The landing page's was a gradient hero at 32px rather than a header, which
    is why it was left and asked about rather than changed quietly. It is still
    the app's name, and a sixth size on the screen somebody meets first is the
    one that sets their expectation for the other five.
  */
  const inAppScreens = [
    'components/CommunityHome.tsx',
    'components/TravelHome.tsx',
    'components/AccountScreen.tsx',
    'components/TripSelectionScreen.tsx',
    'components/AuthScreen.tsx',
    'components/AuthLandingScreen.tsx',
  ];

  it('每一頁的標題列都用同一個元件', () => {
    for (const file of inAppScreens) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('<AppWordmark />');
    }
  });

  it('沒有任何一頁自己手寫 Trippie 當標題', () => {
    for (const file of inAppScreens) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      // 登入 Trippie and 已同步至 Trippie are sentences, not wordmarks.
      const handwritten = source.match(/>Trippie<\/(span|div)>/g) || [];
      expect(handwritten, file).toHaveLength(0);
    }
  });
});

/**
 * 「左上角的 Trippie logo 在每一頁都應該在同一個位置」.
 *
 * Same size was only half of it. Four screens drew four headers, so the name
 * started at 16px from the edge on three of them and 24 on the fourth, and the
 * gap above it was 20 or 24 depending which. On a phone with a notch the
 * safe-area inset swallows the vertical difference, so what was left was the
 * logo stepping sideways each time you changed tab.
 *
 * jsdom does no layout, so position is checked where it is decided: both
 * insets come from the same tokens on every screen, rather than from a number
 * typed into each header.
 */
describe('每一頁的 Trippie 都在同一個位置', () => {
  const headerScreens = [
    'components/CommunityHome.tsx',
    'components/TravelHome.tsx',
    'components/AccountScreen.tsx',
    'components/TripSelectionScreen.tsx',
  ];

  it('左邊的距離都來自同一個 token', () => {
    for (const file of headerScreens) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('px-[var(--screen-pad)]');
    }
  });

  it('上面的距離也是', () => {
    for (const file of headerScreens) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('"var(--header-top)"');
    }
  });

  it('沒有人再自己寫一個邊距', () => {
    for (const file of headerScreens) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      const header = source.slice(0, source.indexOf('<AppWordmark />'));
      // The container that carries the wordmark must not set its own px-N.
      expect(header.match(/data-safe-top[^>]*\bpx-\d/), file).toBeNull();
    }
  });

  it('兩個 token 都定義在 index.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'index.css'), 'utf8');
    expect(css).toContain('--screen-pad');
    expect(css).toContain('--header-top');
  });
});
