/**
 * @vitest-environment jsdom
 *
 * 「我還是希望要盡量找到資訊，你不能搜尋嗎？」.
 *
 * Two saved places sat on 「尚未取得地點座標」 and stayed there. The lookup had
 * gone out as 「다곡소님 韓國 韓國」, which cannot match anything — and the name
 * itself was wrong, because the parser misread 단골손님 twice. So the search
 * runs on demand, the name can be corrected, and the traveller picks: Google's
 * best guess at a name that does not exist is 「多鍋美食店 松亭店」, and binding
 * that automatically would send somebody to the wrong restaurant.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

const SUGGESTIONS = [
  { placeId: 'g-dangol-1', primaryText: '단골손님', secondaryText: '南韓釜山沙上區 괘법동' },
  { placeId: 'g-dangol-2', primaryText: '단골손님', secondaryText: '南韓釜山廣域市' },
];

let autocompleteCalls: string[] = [];

beforeEach(() => {
  autocompleteCalls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (String(url).includes('/api/places/autocomplete')) {
      autocompleteCalls.push(body.query);
      const matches = String(body.query).includes('단골손님');
      return { ok: true, json: async () => ({ suggestions: matches ? SUGGESTIONS : [] }) };
    }
    if (String(url).includes('/api/places/details')) {
      return {
        ok: true,
        json: async () => ({
          placeId: body.placeId,
          location: '단골손님',
          address: '南韓釜山中區 BIFF廣場路 1',
          latitude: 35.0982,
          longitude: 129.0292,
        }),
      };
    }
    return { ok: true, json: async () => ({ basics: null }) };
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const unresolved = (over: Record<string, unknown> = {}) => ({
  id: 'insp-dagok',
  savedByUserId: 'user-1',
  // Both fields hold the country, which is what a trip entered as 「韓國」 saves.
  country: '韓國',
  city: '韓國',
  placeName: '다곡소님',
  sourcePostId: 'screenshot:a',
  sourceSliceId: 'screenshot:a',
  sourceCreatorId: 'user-1',
  sourceNoteIds: [],
  notes: [],
  savedAt: '2026-10-03T00:00:00.000Z',
  ...over,
}) as never;

const renderPlanner = () => {
  const onResolveInspirationPlace = vi.fn();
  render(
    <TripInspirationPlanner
      inspirations={[unresolved()]}
      communityPosts={[]}
      // His trip is entered as 「韓國」, which is why both fields hold a country.
      trip={{ destination: '韓國', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
      selectedGroupIds={[]}
      onSelectionChange={vi.fn()}
      onExploreCommunity={() => {}}
      existingItinerary={[]}
      onAcceptProposal={vi.fn()}
      onApplyAdjustment={vi.fn()}
      onProposalAccepted={vi.fn()}
      onResolveInspirationPlace={onResolveInspirationPlace}
    />,
  );
  return { onResolveInspirationPlace };
};

/**
 * Read before the panel opens: the 「尋找」 button is replaced by the panel, so
 * the id has to be captured while the button is still there.
 */
const openLookup = async (user: ReturnType<typeof userEvent.setup>): Promise<string> => {
  const button = screen.getAllByRole('button')
    .find(node => (node.getAttribute('data-testid') || '').startsWith('find-place-'));
  const id = (button?.getAttribute('data-testid') || '').replace('find-place-', '');
  await user.click(button as HTMLElement);
  return id;
};

describe('a saved place with no map identity', () => {
  it('offers to search for it', () => {
    renderPlanner();

    expect(screen.getByText('在地圖上尋找這個地點')).toBeTruthy();
  });

  it('does not send the country twice', async () => {
    const user = userEvent.setup();
    renderPlanner();

    const id = await openLookup(user);
    await user.click(screen.getByTestId(`lookup-search-${id}`));

    await waitFor(() => expect(autocompleteCalls.length).toBeGreaterThan(0));
    // 「다곡소님 韓國 韓國」 was the query that could never match.
    expect(autocompleteCalls[0]).toBe('다곡소님 韓國');
    expect(autocompleteCalls.join(' ')).not.toContain('韓國 韓國');
  });

  it('says the name may be wrong when nothing comes back', async () => {
    // Because it was: 다곡소님 is 단골손님 misread, and no query of a name that
    // does not exist finds the shop that does.
    const user = userEvent.setup();
    renderPlanner();

    const id = await openLookup(user);
    await user.click(screen.getByTestId(`lookup-search-${id}`));

    expect(await screen.findByText(/截圖上的字可能被讀錯/)).toBeTruthy();
  });

  it('finds the real place once the name is corrected', async () => {
    const user = userEvent.setup();
    renderPlanner();

    const id = await openLookup(user);
    const input = screen.getByTestId(`lookup-input-${id}`);
    await user.clear(input);
    await user.type(input, '단골손님');
    await user.click(screen.getByTestId(`lookup-search-${id}`));

    expect(await screen.findByTestId('lookup-pick-g-dangol-1')).toBeTruthy();
    expect(screen.getByTestId('lookup-pick-g-dangol-2')).toBeTruthy();
  });

  it('binds nothing until the traveller picks one', async () => {
    // Google answers a name that does not exist with its best guess. Accepting
    // that silently is how somebody ends up outside the wrong restaurant.
    const user = userEvent.setup();
    const { onResolveInspirationPlace } = renderPlanner();

    const id = await openLookup(user);
    const input = screen.getByTestId(`lookup-input-${id}`);
    await user.clear(input);
    await user.type(input, '단골손님');
    await user.click(screen.getByTestId(`lookup-search-${id}`));
    await screen.findByTestId('lookup-pick-g-dangol-1');

    expect(onResolveInspirationPlace).not.toHaveBeenCalled();
  });

  it('writes the chosen place onto the saved entry', async () => {
    const user = userEvent.setup();
    const { onResolveInspirationPlace } = renderPlanner();

    const id = await openLookup(user);
    const input = screen.getByTestId(`lookup-input-${id}`);
    await user.clear(input);
    await user.type(input, '단골손님');
    await user.click(screen.getByTestId(`lookup-search-${id}`));
    await user.click(await screen.findByTestId('lookup-pick-g-dangol-2'));

    await waitFor(() => expect(onResolveInspirationPlace).toHaveBeenCalledWith(
      ['insp-dagok'],
      expect.objectContaining({ placeId: 'g-dangol-2', latitude: 35.0982, longitude: 129.0292 }),
    ));
  });
});
