/**
 * @vitest-environment jsdom
 *
 * 「這個你要基本查一些資訊 不能讓這個行程空白」.
 *
 * 다고소님 came off a screenshot as a name and nothing else, so the row was a
 * title over an empty space — indistinguishable from one that failed to load.
 * Google's own record of that place fills it with something true.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';
import { clearPlaceBasicsCache } from '../services/placeBasicsService';

const BASICS = {
  kind: '咖啡廳',
  summary: '白淺灘海邊的景觀咖啡店',
  rating: 4.5,
  ratingCount: 312,
  openNow: true,
  weekdayHours: ['週一 09:00–18:00', '週二 09:00–18:00', '週三 09:00–18:00', '週四 09:00–18:00', '週五 09:00–21:00', '週六 10:00–21:00', '週日 10:00–20:00'],
  website: 'https://example.com',
};

beforeEach(() => {
  clearPlaceBasicsCache();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ basics: BASICS }) }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const inspiration = (over: Record<string, unknown> = {}) => ({
  id: 'insp-dago',
  savedByUserId: 'user-1',
  country: '韓國',
  city: '釜山',
  placeName: '다고소님',
  placeId: 'g-dago',
  latitude: 35.1587,
  longitude: 129.1604,
  sourcePostId: 'screenshot:a',
  sourceSliceId: 'screenshot:a',
  sourceCreatorId: 'user-1',
  sourceNoteIds: [],
  notes: [],
  savedAt: '2026-10-03T00:00:00.000Z',
  ...over,
}) as never;

const renderPlanner = (inspirations: unknown[] = [inspiration()]) => render(
  <TripInspirationPlanner
    inspirations={inspirations as never}
    communityPosts={[]}
    trip={{ destination: '釜山', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
    selectedGroupIds={[]}
    onSelectionChange={vi.fn()}
    onExploreCommunity={() => {}}
    existingItinerary={[]}
    onAcceptProposal={vi.fn()}
    onApplyAdjustment={vi.fn()}
    onProposalAccepted={vi.fn()}
  />,
);

describe('a saved place with nothing written about it', () => {
  it('does not stay blank in the list', async () => {
    renderPlanner();

    await waitFor(() => expect(screen.getByText(/咖啡廳/)).toBeTruthy());
    expect(screen.getByText('咖啡廳 · ★ 4.5（312）')).toBeTruthy();
  });

  it('shows the full record when the place is opened', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByText('다고소님'));

    const basics = within(await screen.findByTestId('place-basics'));
    expect(basics.getByText('白淺灘海邊的景觀咖啡店')).toBeTruthy();
    expect(basics.getByText('營業中')).toBeTruthy();
  });

  it('marks it as Google’s record, not as somebody’s note', async () => {
    // A note is a person's experience of the place; this is the register entry.
    // Blurring the two makes both less trustworthy.
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByText('다고소님'));

    expect(within(await screen.findByTestId('place-basics')).getByText('Google 基本資料')).toBeTruthy();
  });

  it('looks nothing up for a place that never resolved', async () => {
    // Without an id, any lookup is a guess about which branch this is.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPlanner([inspiration({ placeId: undefined, latitude: undefined, longitude: undefined })]);

    await waitFor(() => expect(screen.getByText('다고소님')).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves a place that has its own points alone', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPlanner([inspiration({
      notes: [{
        id: 'n1', sourceNoteId: 'sn-1', sourceSliceId: 'screenshot:a', sourcePostId: 'screenshot:a',
        sourceCreatorId: 'user-1', type: 'other', text: 'BIFF廣場附近好吃的餐廳',
      }],
    })]);

    await waitFor(() => expect(screen.getByText('BIFF廣場附近好吃的餐廳')).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays blank rather than guessing when Google knows nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ basics: null }) }));
    renderPlanner();

    await waitFor(() => expect(screen.getByText('다고소님')).toBeTruthy());
    expect(screen.queryByTestId('basics-line-dago')).toBeNull();
  });
});
