/**
 * @vitest-environment jsdom
 *
 * 「收藏裡也要分區」 — the collection screen listed every saved place in one
 * stream while the planner, reading the same records, grouped them by area.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SavedTravelDestinationDetail from '../components/SavedTravelDestinationDetail';
import { SavedTravelInspiration } from '../types';

afterEach(cleanup);

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration => ({
  id: 'i', savedByUserId: 'me', placeName: 'x',
  country: '韓國', city: 'Busan', notes: [],
  sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c', sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

/** Haeundae and Gwangalli are about six kilometres apart: two outings. */
const HAEUNDAE = { latitude: 35.1587, longitude: 129.1604, district: 'Haeundae' };
const GWANGALLI = { latitude: 35.1532, longitude: 129.1186, district: 'Suyeong-gu' };

const mount = (items: SavedTravelInspiration[]) => {
  const props = {
    country: '韓國', city: 'Busan', items, communityPosts: [],
    onBack: vi.fn(), onRemove: vi.fn(), onResolveItem: vi.fn(),
    onOpenCommunityPost: vi.fn(), onCreateTrip: vi.fn(),
  } as unknown as React.ComponentProps<typeof SavedTravelDestinationDetail>;
  render(<SavedTravelDestinationDetail {...props} />);
};

describe('the collection, grouped', () => {
  it('heads each area and counts it', () => {
    mount([
      saved({ id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE }),
      saved({ id: 'b', placeName: 'THRILL ON THE MUG', ...HAEUNDAE }),
      saved({ id: 'c', placeName: 'Dongmyeonsik Milmyeon', ...GWANGALLI }),
    ]);

    expect(screen.getByTestId('saved-area-Haeundae').textContent).toContain('2 個');
    expect(screen.getByTestId('saved-area-Suyeong-gu').textContent).toContain('1 個');
  });

  /** Places with no position get their own heading, not a scattering. */
  it('puts the unplaced ones together at the end', () => {
    mount([
      saved({ id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE }),
      saved({ id: 'b', placeName: 'Working holiday' }),
    ]);

    expect(screen.getByTestId('saved-area-unplaced')).toBeTruthy();
  });

  it('still lists every place exactly once', () => {
    mount([
      saved({ id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE }),
      saved({ id: 'b', placeName: 'Dongmyeonsik Milmyeon', ...GWANGALLI }),
      saved({ id: 'c', placeName: 'Working holiday' }),
    ]);

    ['味贊王鹽烤肉', 'Dongmyeonsik Milmyeon', 'Working holiday']
      .forEach(name => expect(screen.getAllByText(name)).toHaveLength(1));
  });
});

describe('the heading', () => {
  it('reads in the app s language', () => {
    mount([saved({ id: 'a', ...HAEUNDAE })]);

    expect(screen.getByText('韓國・釜山')).toBeTruthy();
    expect(screen.getByText(/建立釜山旅行/)).toBeTruthy();
  });
});

/**
 * 「點下去要有地圖資訊」 — the card carried a 「⋯」 menu and nothing else, so the
 * one thing a saved place is for, going to it, was not on it.
 */
describe('opening a saved place', () => {
  const place = saved({
    id: 'a',
    placeName: '味贊王鹽烤肉',
    placeId: 'ChIJecTzBkWNaDURHnlmBE4_y3A',
    formattedAddress: '46 Haeun-daero 608beon-gil, Haeundae, Busan',
    ...HAEUNDAE,
  });

  it('shows the place sheet, with somewhere to open it', () => {
    mount([place]);

    fireEvent.click(screen.getByTestId('open-place-a'));

    // Two of them for a Korean place: NAVER first, Google beneath it.
    expect(screen.getAllByText(/地圖開啟/).length).toBeGreaterThan(0);
  });

  /*
    The same sheet the itinerary and the planner open — so the Korean provider
    rule, which lives inside it, applies here without being restated.
  */
  it('offers NAVER for a Korean place', () => {
    mount([place]);

    fireEvent.click(screen.getByTestId('open-place-a'));

    expect(screen.getByText(/NAVER/)).toBeTruthy();
  });

  it('shows the address it has', () => {
    mount([place]);

    fireEvent.click(screen.getByTestId('open-place-a'));

    expect(screen.getByText(/Haeun-daero/)).toBeTruthy();
  });
});
