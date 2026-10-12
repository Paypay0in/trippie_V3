/**
 * @vitest-environment jsdom
 *
 * 「然後你再補上後面的資訊嗎」.
 *
 * The question behind the question: after uploading the screenshot the card
 * asked for, does the card get out of the way — or does the traveller fill
 * something in and sit looking at the same refusal?
 *
 * Asserted by rendering the gate against a trip that gains its anchors,
 * because the chain that has to hold is four links long: the upload writes to
 * the trip, the stays are derived from the itinerary, `missingAnchors` reads
 * the derivation, and the card reads that. A break anywhere leaves a
 * traveller who did exactly what they were told and got nothing.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';
import { staysFromItinerary } from '../services/stayIntake';
import { missingAnchors } from '../services/planningAnchors';

afterEach(cleanup);

type Props = React.ComponentProps<typeof TripPlanOverview>;

const flight = {
  id: 'f-1',
  direction: 'OUTBOUND',
  departureDate: '2026-11-05',
  departureTime: '14:20',
  departureAirport: '桃園國際機場',
  arrivalDate: '2026-11-05',
  arrivalTime: '18:40',
  arrivalAirport: '福岡機場',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
};

/** What `stayToItineraryItems` puts on the trip, as the upload would. */
const hotelItem = {
  id: 'i-stay',
  type: 'HOTEL',
  title: '入住 博多站前飯店',
  location: '博多站前飯店',
  address: '福岡市博多區博多站前 2-1-1',
  placeId: 'place-hakata',
  latitude: 33.5898,
  longitude: 130.4207,
  notes: '',
  date: '2026-11-05',
  time: '15:00',
  fixedEventKind: 'accommodation',
};

const mount = (props: Partial<Props> = {}) => render(
  <TripPlanOverview
    expenses={[]}
    shoppingList={[]}
    itinerary={[]}
    companionCount={1}
    dateRange="2026/11/05 - 2026/11/10"
    destination="福岡"
    destinationCountry="日本"
    tripStartDate="2026-11-05"
    tripEndDate="2026-11-10"
    onContinuePlanning={vi.fn()}
    onEnterTripMode={vi.fn()}
    onManageMembers={vi.fn()}
    onExploreInspiration={vi.fn()}
    savedInspirations={[]}
    communityPosts={[]}
    {...(props as Props)}
  />,
);

describe('the trip a hotel upload produces', () => {
  /**
   * The derivation in the middle. The upload writes itinerary items, and the
   * gate reads stays — so this is the link that turns one into the other, and
   * it is the one nothing else would have noticed breaking.
   */
  it('becomes a stay the gate accepts', () => {
    const stays = staysFromItinerary([hotelItem] as never);

    expect(stays).toHaveLength(1);
    expect(stays[0]?.name).toBe('博多站前飯店');
    expect(missingAnchors({ flightAnchors: [flight] as never, stays })).toEqual([]);
  });

  /**
   * A hotel that reached the trip without its place lookup still has an
   * address, so it still lifts the gate. The lookup is for what comes after —
   * the map, the photo, the travel time — and the booking must never be held
   * back waiting for it.
   */
  it('is accepted even when the place lookup found nothing', () => {
    const unlinked = { ...hotelItem, placeId: undefined, latitude: undefined, longitude: undefined };
    const stays = staysFromItinerary([unlinked] as never);

    expect(missingAnchors({ flightAnchors: [flight] as never, stays })).toEqual([]);
  });
});

describe('the card, once the trip has both', () => {
  it('stops asking and offers the box', () => {
    const stays = staysFromItinerary([hotelItem] as never);
    mount({ flightAnchors: [flight] as never, stays: stays as never });

    expect(screen.queryByTestId('plan-anchors-required')).toBeNull();
    expect(screen.getByText('AI 幫我想方案')).toBeTruthy();
  });

  /**
   * And the upload stays, because it is still how the rest arrives — the car
   * hire, the tickets, the places somebody saved. The gate lifting must not
   * take the entry with it.
   */
  it('keeps the upload for everything else', () => {
    const stays = staysFromItinerary([hotelItem] as never);
    mount({
      flightAnchors: [flight] as never,
      stays: stays as never,
      onAddRentalFromScreenshot: vi.fn(),
      onSavePlacesFromScreenshot: vi.fn(),
      onAddStayItemsFromScreenshot: vi.fn(),
      onAddFlightAnchorsFromScreenshot: vi.fn(),
    });

    expect(screen.getByTestId('plan-screenshot-upload')).toBeTruthy();
  });
});
