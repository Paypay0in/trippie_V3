/**
 * @vitest-environment jsdom
 *
 * 「另外要可以刪除」.
 *
 * A want-to-go list is a list of maybes, and some of them turn out to be no —
 * a place the screenshot read wrong, a restaurant the group dropped. Until now
 * the only way off the list was never to have saved it.
 *
 * Deleting is confirmed rather than instant: the list is shared, so a mis-tap
 * takes the place off the other traveller's screen too, and the notes that came
 * with it cannot be re-derived without the original screenshot.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

afterEach(cleanup);

const inspiration = (id: string, placeName: string, noteTexts: string[] = []) => ({
  id,
  savedByUserId: 'user-1',
  country: '韓國',
  city: '釜山',
  placeName,
  latitude: 35.1587,
  longitude: 129.1604,
  sourcePostId: `screenshot:${id}`,
  sourceSliceId: `screenshot:${id}`,
  sourceCreatorId: 'user-1',
  sourceNoteIds: noteTexts.map((_, index) => `sn-${id}-${index}`),
  notes: noteTexts.map((text, index) => ({
    id: `n-${id}-${index}`,
    sourceNoteId: `sn-${id}-${index}`,
    sourceSliceId: `screenshot:${id}`,
    sourcePostId: `screenshot:${id}`,
    sourceCreatorId: 'user-1',
    type: 'recommendation',
    text,
  })),
  savedAt: '2026-10-03T00:00:00.000Z',
}) as never;

const renderPlanner = (overrides: Record<string, unknown> = {}) => {
  const onRemoveInspirations = vi.fn();
  const onSelectionChange = vi.fn();
  render(
    <TripInspirationPlanner
      inspirations={[
        inspiration('insp-pork', '味贊王鹽烤肉', ['飯點人超多需排號', '推薦菜品：五花肉']),
        inspiration('insp-market', '海雲台傳統市場'),
      ]}
      communityPosts={[]}
      trip={{ destination: '釜山', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
      selectedGroupIds={[]}
      onSelectionChange={onSelectionChange}
      onExploreCommunity={() => {}}
      existingItinerary={[]}
      onAcceptProposal={vi.fn()}
      onApplyAdjustment={vi.fn()}
      onProposalAccepted={vi.fn()}
      onRemoveInspirations={onRemoveInspirations}
      {...overrides}
    />,
  );
  return { onRemoveInspirations, onSelectionChange };
};

const groupIdFor = (placeName: string): string => {
  const button = screen.getAllByRole('button')
    .find(node => node.getAttribute('aria-label') === `從收藏移除 ${placeName}`);
  return (button?.getAttribute('data-testid') || '').replace('remove-inspiration-', '');
};

describe('removing a saved place', () => {
  it('asks before it removes anything', async () => {
    const user = userEvent.setup();
    const { onRemoveInspirations } = renderPlanner();

    await user.click(screen.getByLabelText('從收藏移除 味贊王鹽烤肉'));

    expect(onRemoveInspirations).not.toHaveBeenCalled();
    expect(screen.getByText(/移除「味贊王鹽烤肉」和它的 2 項重點？/)).toBeTruthy();
  });

  it('removes every save folded into that one place', async () => {
    const user = userEvent.setup();
    const { onRemoveInspirations } = renderPlanner();

    await user.click(screen.getByLabelText('從收藏移除 味贊王鹽烤肉'));
    await user.click(screen.getByTestId(`confirm-remove-inspiration-${groupIdFor('味贊王鹽烤肉')}`));

    expect(onRemoveInspirations).toHaveBeenCalledWith(['insp-pork']);
  });

  it('leaves the other places alone', async () => {
    const user = userEvent.setup();
    const { onRemoveInspirations } = renderPlanner();

    await user.click(screen.getByLabelText('從收藏移除 味贊王鹽烤肉'));
    await user.click(screen.getByTestId(`confirm-remove-inspiration-${groupIdFor('味贊王鹽烤肉')}`));

    expect(onRemoveInspirations.mock.calls[0][0]).not.toContain('insp-market');
  });

  it('cancels without removing', async () => {
    const user = userEvent.setup();
    const { onRemoveInspirations } = renderPlanner();

    await user.click(screen.getByLabelText('從收藏移除 味贊王鹽烤肉'));
    await user.click(screen.getByText('取消'));

    expect(onRemoveInspirations).not.toHaveBeenCalled();
    expect(screen.queryByText(/移除「味贊王鹽烤肉」/)).toBeNull();
  });

  it('drops the removed place out of the shortlist', async () => {
    // A plan built around a place that no longer exists is built around nothing.
    const user = userEvent.setup();
    render(<div />);
    cleanup();
    const onRemoveInspirations = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <TripInspirationPlanner
        inspirations={[inspiration('insp-pork', '味贊王鹽烤肉')]}
        communityPosts={[]}
        trip={{ destination: '釜山', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
        selectedGroupIds={[]}
        onSelectionChange={onSelectionChange}
        onExploreCommunity={() => {}}
        existingItinerary={[]}
        onAcceptProposal={vi.fn()}
        onApplyAdjustment={vi.fn()}
        onProposalAccepted={vi.fn()}
        onRemoveInspirations={onRemoveInspirations}
      />,
    );

    const groupId = groupIdFor('味贊王鹽烤肉');
    await user.click(screen.getByLabelText('從收藏移除 味贊王鹽烤肉'));
    await user.click(screen.getByTestId(`confirm-remove-inspiration-${groupId}`));

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('shows no delete control when the caller offers no way to remove', () => {
    renderPlanner({ onRemoveInspirations: undefined });

    expect(screen.queryByLabelText('從收藏移除 味贊王鹽烤肉')).toBeNull();
  });
});
