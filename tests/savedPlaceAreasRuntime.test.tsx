/**
 * @vitest-environment jsdom
 *
 * 「能不能夠讓收藏的景點被分區顯示 … 將地址相近的直接分配到同一個顏色區塊」.
 *
 * Twenty saved places in save order hide the fact that decides a day: four of
 * them are within walking distance on 廣安里, two are out at 海雲台, one is in
 * 機張 forty minutes up the coast. A day built by reading down the list crosses
 * the city three times.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripInspirationPlanner from '../components/TripInspirationPlanner';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ basics: null }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** His own saved places, with the coordinates and addresses as stored. */
const saved = (id: string, placeName: string, latitude: number, longitude: number, formattedAddress: string) => ({
  id, savedByUserId: 'user-1', country: '韓國', city: '韓國', placeName,
  placeId: `g-${id}`, formattedAddress, latitude, longitude,
  sourcePostId: `screenshot:${id}`, sourceSliceId: `screenshot:${id}`, sourceCreatorId: 'user-1',
  sourceNoteIds: [], notes: [], savedAt: '2026-10-03T00:00:00.000Z',
}) as never;

const places = [
  saved('peak', 'Peak square', 35.2443, 129.2229, '864 Gijanghaean-ro, Gijang-eup, Gijang, Busan, 南韓'),
  saved('nasari', 'Nasari Sigdang', 35.1535, 129.1190, '南韓 Busan, Suyeong-gu, Gwangan-ro 61beon-gil, 60'),
  saved('diart', 'DIART coffee', 35.1588, 129.1983, '12 Cheongsapo-ro 128beon-gil, Haeundae, Busan, 南韓'),
  saved('dongmyeon', 'Dongmyeonsik Milmyeon', 35.1532, 129.1183, '南韓 Busan, Suyeong-gu, Gwanganhaebyeon-ro, 251'),
  saved('photowave', 'Photowave', 35.1590, 129.1985, '2 Cheongsapo-ro 128beon-gil, Haeundae, 부산시 南韓'),
  saved('working', 'Working holiday', 35.1529, 129.1181, '南韓 Busan, Suyeong-gu, Gwanganhaebyeon-ro, 235'),
];

const renderPlanner = (inspirations: unknown[] = places) => render(
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
  />,
);

/** The rows in the order the list renders them, by the place each one opens. */
const renderedOrder = (): string[] => Array.from(document.querySelectorAll('[data-testid^="inspiration-card-"]'))
  .map(node => (node.getAttribute('data-testid') || '').replace('inspiration-card-', ''));

describe('the saved places, grouped by area', () => {
  it('heads each area with the district the addresses name', () => {
    renderPlanner();

    expect(screen.getByTestId('area-heading-Suyeong-gu')).toBeTruthy();
    expect(screen.getByTestId('area-heading-Haeundae')).toBeTruthy();
    expect(screen.getByTestId('area-heading-Gijang-eup')).toBeTruthy();
  });

  it('says how many places are in each', () => {
    renderPlanner();

    expect(screen.getByTestId('area-heading-Suyeong-gu').textContent).toContain('3 個');
  });

  it('puts the places of one area together, biggest area first', () => {
    // Saved order interleaves 機張, 廣安里 and 海雲台; a day is planned in areas.
    renderPlanner();

    const order = renderedOrder();
    expect(order.slice(0, 3).sort()).toEqual(['place:g-dongmyeon', 'place:g-nasari', 'place:g-working']);
    expect(order[order.length - 1]).toBe('place:g-peak');
  });

  it('keeps a place with no coordinates out of every area', () => {
    // It cannot be put on a day until it is put on a map.
    renderPlanner([...places, {
      ...(saved('dagok', '다곡소님', 0, 0, '') as Record<string, unknown>),
      latitude: undefined, longitude: undefined, placeId: undefined,
    }] as never);

    expect(screen.getByTestId('area-heading-unplaced').textContent).toContain('還沒定位');
    const order = renderedOrder();
    expect(order[order.length - 1]).toContain('다곡소님');
  });
});
