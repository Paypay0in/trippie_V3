/**
 * @vitest-environment jsdom
 *
 * 「黃色點進去是空白的」 and 「橘色跑版了吧？」.
 *
 * The card learned to read 「韓國・釜山」 while the records still say 「Busan」, and
 * it navigated with what it was reading. The detail screen matches on the
 * stored text, so it matched nothing.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import { SavedTravelInspiration } from '../types';

afterEach(cleanup);

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1', savedByUserId: 'me', placeName: '味贊王鹽烤肉',
  country: '韓國', city: 'Busan', notes: [],
  ...over,
} as SavedTravelInspiration);

const mount = (inspirations: SavedTravelInspiration[]) => {
  const onOpenSavedDestination = vi.fn();
  const props = {
    drafts: [],
    tripHistory: [],
    savedTravelInspirations: inspirations,
    communityPosts: [],
    onOpenSavedDestination,
    onContinueDraft: vi.fn(),
    onContinueTrip: vi.fn(),
    onCreateNew: vi.fn(),
    onOpenPlanner: vi.fn(),
  } as unknown as React.ComponentProps<typeof TravelHome>;
  render(<TravelHome {...props} />);
  return { onOpenSavedDestination };
};

describe('a saved-notes card', () => {
  it('reads in the app s language', () => {
    mount([saved()]);

    expect(screen.getByText('韓國・釜山')).toBeTruthy();
  });

  /*
    The label is for the reader; the raw value is the record's own. Navigating
    with the label is how the detail screen came up empty.
  */
  it('navigates with what the records actually say', () => {
    const { onOpenSavedDestination } = mount([saved()]);

    fireEvent.click(screen.getByText('韓國・釜山'));

    expect(onOpenSavedDestination).toHaveBeenCalledWith('韓國', 'Busan');
  });
});

/**
 * 「橘色跑版了吧？」 — one strip on the page had a fixed-width card while the two
 * around it fit three across, so on a phone it took more than half the screen.
 */
describe('the strips of cards', () => {
  it('size trip cards the same in both strips', () => {
    const home = readFileSync(resolve(__dirname, '../components/TravelHome.tsx'), 'utf8');
    const tripCardWidth = /w-\[calc\(\(100%-24px\)\/3\)\]/g;

    expect(home.match(tripCardWidth)?.length).toBeGreaterThanOrEqual(3);
    // The fixed width that caused it.
    expect(home).not.toContain('h-40 w-52');
  });
});
