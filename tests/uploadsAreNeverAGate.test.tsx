/**
 * @vitest-environment jsdom
 *
 * 「不要拿機票或飯店上傳當門檻」.
 *
 * The planning question is answerable before anything is booked. A traveller
 * with no flight on file is precisely the one asking what to do with the
 * days, and the first version of this screen replaced the question box with a
 * request for documents — so the person with the most to decide was the only
 * one who could not ask.
 *
 * Pressed rather than read off the source: a gate only counts as lifted if
 * the submit really fires.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Props = React.ComponentProps<typeof TripPlanOverview>;

const mount = (props: Partial<Props> = {}) => render(
  <TripPlanOverview
    expenses={[]}
    shoppingList={[]}
    itinerary={[]}
    companionCount={1}
    dateRange="2026/11/05 - 2026/11/10"
    destination="日本沖繩"
    destinationCountry="日本"
    tripStartDate="2026-11-05"
    tripEndDate="2026-11-10"
    onContinuePlanning={vi.fn()}
    onEnterTripMode={vi.fn()}
    onManageMembers={vi.fn()}
    onExploreInspiration={vi.fn()}
    savedInspirations={[]}
    communityPosts={[]}
    travelRules={undefined}
    {...(props as Props)}
  />,
);

describe('nothing booked yet', () => {
  it('still names the flight and the hotel first', () => {
    mount();

    // The earlier instruction 「要他們先傳航班與住宿資訊」 is not discarded:
    // the anchors are still asked for, and still above the box.
    expect(screen.getByTestId('plan-anchors-required')).toBeTruthy();
  });

  it('lets the question through anyway', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ options: [], intro: '', requestId: 'r-1', sources: [], grounded: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    mount();

    const box = screen.getByPlaceholderText(/我想滑雪/);
    fireEvent.change(box, { target: { value: '我想滑雪' } });
    fireEvent.click(screen.getByText('AI 幫我想方案'));

    // The real proof: the request actually leaves. A rendered button that
    // silently does nothing would satisfy a weaker assertion.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
