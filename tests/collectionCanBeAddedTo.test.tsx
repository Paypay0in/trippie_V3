/**
 * @vitest-environment jsdom
 *
 * 「這裡也要可以手動與讀取截圖來加入旅行靈感」.
 *
 * 手動新增地點 and 從截圖加入 existed on the trip's planning screen and nowhere
 * else — so the collection, the screen whose whole job is holding saved
 * places, had no way to add one. A shelf with the door on another floor.
 *
 * Both are the same components the planner uses rather than second copies:
 * adding a place has one idea of what a Google Maps link means, and reading a
 * screenshot has one idea of what a card is.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SavedTravelDestinationDetail from '../components/SavedTravelDestinationDetail';
import { SavedTravelInspiration } from '../types';

afterEach(cleanup);

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'a', savedByUserId: 'me', placeName: '黑船亭',
  country: '日本', city: '東京', notes: [],
  sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c', sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

const mount = (over: Record<string, unknown> = {}) => {
  const props = Object.assign({
    country: '日本',
    city: '東京',
    items: [saved()],
    communityPosts: [],
    onBack: vi.fn(),
    onRemove: vi.fn(),
    onResolveItem: vi.fn(),
    onOpenCommunityPost: vi.fn(),
    onCreateTrip: vi.fn(),
  }, over) as unknown as React.ComponentProps<typeof SavedTravelDestinationDetail>;
  render(<SavedTravelDestinationDetail {...props} />);
};

describe('the collection screen', () => {
  it('offers 手動新增地點', () => {
    mount({ onAddSavedPlace: vi.fn() });

    expect(screen.getByTestId('open-add-place').textContent).toContain('手動新增地點');
  });

  it('opens the same search box the planner uses', () => {
    mount({ onAddSavedPlace: vi.fn() });

    fireEvent.click(screen.getByTestId('open-add-place'));

    expect((screen.getByTestId('add-place-input') as HTMLInputElement).placeholder)
      .toContain('Google 地圖連結');
  });

  it('offers the screenshot import', () => {
    mount({ onSaveScreenshotPlaces: vi.fn() });

    expect(screen.getByTestId('screenshot-intake')).toBeTruthy();
  });

  /*
    A screen given neither handler shows neither control, rather than a button
    that cannot do anything.
  */
  it('shows neither when the caller wires neither', () => {
    mount();

    expect(screen.queryByTestId('open-add-place')).toBeNull();
    expect(screen.queryByTestId('screenshot-intake')).toBeNull();
  });
});
