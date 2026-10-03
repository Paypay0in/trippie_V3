/**
 * @vitest-environment jsdom
 *
 * 「收藏的景點 應該要點擊後就跳出小卡 讓用戶可以轉跳到 Google 地圖等 不然很不友善」.
 *
 * The row used to be one big checkbox, so a saved restaurant was a name and
 * nothing else: no address, no way to the map, no way to tell two branches
 * apart. Now the box selects and the name opens the place.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

afterEach(cleanup);

const inspiration = (over: Record<string, unknown> = {}) => ({
  id: 'insp-pork',
  savedByUserId: 'user-1',
  country: '韓國',
  city: '釜山',
  placeName: '味贊王鹽烤肉',
  placeId: 'g-pork',
  formattedAddress: '釜山廣域市海雲台區中洞 1234',
  latitude: 35.1587,
  longitude: 129.1604,
  sourcePostId: 'screenshot:a',
  sourceSliceId: 'screenshot:a',
  sourceCreatorId: 'user-1',
  sourceNoteIds: ['sn-1', 'sn-2'],
  notes: [
    { id: 'n1', sourceNoteId: 'sn-1', sourceSliceId: 'screenshot:a', sourcePostId: 'screenshot:a', sourceCreatorId: 'user-1', type: 'queue', text: '飯點人超多需排號' },
    { id: 'n2', sourceNoteId: 'sn-2', sourceSliceId: 'screenshot:a', sourcePostId: 'screenshot:a', sourceCreatorId: 'user-1', type: 'order', text: '推薦菜品：五花肉' },
  ],
  savedAt: '2026-10-03T00:00:00.000Z',
  ...over,
}) as never;

const renderPlanner = (inspirations: unknown[] = [inspiration()]) => {
  const onSelectionChange = vi.fn();
  render(
    <TripInspirationPlanner
      inspirations={inspirations as never}
      communityPosts={[]}
      trip={{ destination: '釜山', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
      selectedGroupIds={[]}
      onSelectionChange={onSelectionChange}
      onExploreCommunity={() => {}}
      existingItinerary={[]}
      onAcceptProposal={vi.fn()}
      onApplyAdjustment={vi.fn()}
      onProposalAccepted={vi.fn()}
    />,
  );
  return { onSelectionChange };
};

describe('opening a saved place', () => {
  it('shows the card with the address when the name is tapped', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByText('味贊王鹽烤肉'));

    const card = screen.getByTestId('saved-place-card');
    expect(within(card).getByText('釜山廣域市海雲台區中洞 1234')).toBeTruthy();
  });

  it('links to the exact place on Google Maps', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByText('味贊王鹽烤肉'));

    const href = screen.getByTestId('saved-place-maps-link').getAttribute('href') || '';
    expect(new URL(href).searchParams.get('query_place_id')).toBe('g-pork');
  });

  it('offers directions from where the traveller is', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByText('味贊王鹽烤肉'));

    const url = new URL(screen.getByTestId('saved-place-directions-link').getAttribute('href') || '');
    expect(url.searchParams.get('destination')).toBe('35.1587,129.1604');
    expect(url.searchParams.get('origin')).toBeNull();
  });

  it('shows every point, not the first three', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByText('味贊王鹽烤肉'));

    const card = screen.getByTestId('saved-place-card');
    expect(within(card).getByText('飯點人超多需排號')).toBeTruthy();
    expect(within(card).getByText('推薦菜品：五花肉')).toBeTruthy();
  });

  it('says so when the save never resolved to a real place', async () => {
    // The links below are a search, and a search can open the wrong branch.
    const user = userEvent.setup();
    renderPlanner([inspiration({
      placeId: undefined, latitude: undefined, longitude: undefined, formattedAddress: undefined,
    })]);

    await user.click(screen.getByText('味贊王鹽烤肉'));

    expect(screen.getByText(/還沒對到地圖上的地點/)).toBeTruthy();
  });

  it('closes again', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByText('味贊王鹽烤肉'));
    await user.click(screen.getByLabelText('關閉'));

    expect(screen.queryByTestId('saved-place-card')).toBeNull();
  });

  it('does not select the place just because the card was opened', async () => {
    // Opening a place to see where it is says nothing about taking it.
    const user = userEvent.setup();
    const { onSelectionChange } = renderPlanner();

    await user.click(screen.getByText('味贊王鹽烤肉'));

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('still selects from the checkbox', async () => {
    const user = userEvent.setup();
    const { onSelectionChange } = renderPlanner();

    await user.click(screen.getByRole('checkbox', { name: '味贊王鹽烤肉' }));

    expect(onSelectionChange).toHaveBeenCalled();
    expect(screen.queryByTestId('saved-place-card')).toBeNull();
  });
});
