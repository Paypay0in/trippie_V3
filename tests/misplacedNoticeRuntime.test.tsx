/**
 * @vitest-environment jsdom
 *
 * 「錯的就刪了（但要用戶知道）」.
 *
 * 다고소님 was bound to Danyang-gun in 忠清北道 — 200km from Busan and from every
 * other saved place. The screenshot misread 단골손님, so the search had nothing
 * real to find and answered with its best guess at a name that does not exist.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ basics: null }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const saved = (id: string, placeName: string, latitude: number, longitude: number) => ({
  id, savedByUserId: 'user-1', country: '韓國', city: '韓國', placeName,
  placeId: `g-${id}`, formattedAddress: `${placeName} address`, latitude, longitude,
  sourcePostId: `screenshot:${id}`, sourceSliceId: `screenshot:${id}`, sourceCreatorId: 'user-1',
  sourceNoteIds: [], notes: [], savedAt: '2026-10-03T00:00:00.000Z',
}) as never;

const busan = [
  saved('nasari', 'Nasari Sigdang', 35.1535, 129.1190),
  saved('diart', 'DIART coffee', 35.1588, 129.1983),
  saved('peak', 'Peak square', 35.2443, 129.2229),
];
const danyang = saved('dagoso', '다고소님', 36.9846, 128.3655);

const renderPlanner = (inspirations: unknown[]) => {
  const onRemoveInspirations = vi.fn();
  render(
    <TripInspirationPlanner
      inspirations={inspirations as never}
      communityPosts={[]}
      trip={{ destination: '韓國', destinationCountry: '韓國', startDate: '2026-10-03', endDate: '2026-10-07' } as never}
      selectedGroupIds={[]}
      onSelectionChange={vi.fn()}
      onExploreCommunity={() => {}}
      existingItinerary={[]}
      onAcceptProposal={vi.fn()}
      onApplyAdjustment={vi.fn()}
      onProposalAccepted={vi.fn()}
      onRemoveInspirations={onRemoveInspirations}
    />,
  );
  return { onRemoveInspirations };
};

describe('a place bound somewhere the trip is not', () => {
  it('names it, and says how far', () => {
    // 「Something was wrong and I fixed it」 is not something a traveller can check.
    renderPlanner([...busan, danyang]);

    const notice = screen.getByTestId('misplaced-notice');
    expect(notice.textContent).toContain('다고소님');
    expect(notice.textContent).toMatch(/公里/);
  });

  it('removes it on one tap, and only it', () => {
    renderPlanner([...busan, danyang]);

    return userEvent.setup().click(screen.getByTestId('remove-misplaced')).then(() => {
      expect(screen.getByTestId('misplaced-notice')).toBeTruthy();
    });
  });

  it('passes exactly the saved entries behind that place', async () => {
    const user = userEvent.setup();
    const { onRemoveInspirations } = renderPlanner([...busan, danyang]);

    await user.click(screen.getByTestId('remove-misplaced'));

    expect(onRemoveInspirations).toHaveBeenCalledWith(['dagoso']);
  });

  it('says nothing when every place is where the trip is', () => {
    // 機張 is 12km up the coast and is a real place to spend a day.
    renderPlanner(busan);

    expect(screen.queryByTestId('misplaced-notice')).toBeNull();
  });
});
