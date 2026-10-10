/**
 * @vitest-environment jsdom
 *
 * 「這頁跑版」.
 *
 * Making the bottom bar float moved three things at once. It now starts a
 * safe-area inset above the screen edge instead of sitting on it, and the
 * raised + button stands about 24px proud of the bar. On a phone with a home
 * indicator the highest pixel of the nav is around 110px up — and every screen
 * under it still reserved pb-24, which is 96.
 *
 * So the last card of every list sat beneath the bar with no way to scroll it
 * clear. The planner was the obvious one, because the thing hidden there is
 * the button that adds the next thing.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import CommunityHome from '../components/CommunityHome';
import { BOTTOM_NAV_CLEARANCE } from '../components/AppBottomNav';

afterEach(cleanup);

/** Every screen that draws the floating bar must leave the same room for it. */
describe('浮動導覽列底下的空間', () => {
  it('旅行', () => {
    const { container } = render(
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
    expect((container.firstElementChild as HTMLElement).className)
      .toContain(BOTTOM_NAV_CLEARANCE);
  });

  it('社群', () => {
    const { container } = render(
      <CommunityHome
        activeSection="community"
        onSectionChange={vi.fn()}
        onPlus={vi.fn()}
        posts={[]}
        onOpenPost={vi.fn()}
        onCreatePost={vi.fn()}
      />,
    );
    expect((container.firstElementChild as HTMLElement).className)
      .toContain(BOTTOM_NAV_CLEARANCE);
  });

  /**
   * The number itself, pinned.
   *
   * pb-24 cleared a bar welded to the bottom edge and does not clear a floating
   * one; anything that computes from the safe area and leaves room for the
   * raised button does. Written here so the next change to the bar's height is
   * made in one place rather than discovered on a phone.
   */
  it('空間是從安全區算出來的，不是一個固定數字', () => {
    expect(BOTTOM_NAV_CLEARANCE).toContain('env(safe-area-inset-bottom)');
    expect(BOTTOM_NAV_CLEARANCE).not.toBe('pb-24');
  });
});
