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
