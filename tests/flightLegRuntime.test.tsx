/**
 * @vitest-environment jsdom
 *
 * 「你看這邊行程與行程中間」 — in the timeline, not only in the predicate.
 *
 * A pure rule nobody calls is a rule that does not exist; this project has
 * shipped one of those before. These assert the calendar actually drops the
 * journey block between two halves of the same flight, and keeps the one that
 * matters most: landing, then the ride into town.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ItineraryCalendar from '../components/ItineraryCalendar';
import { ItineraryItem } from '../types';

afterEach(cleanup);

const DAY = '2026-10-20';

/** The three cards one flight anchor produces, as shipped. */
const atAirport: ItineraryItem = {
  id: 'flight-arrival-f1', title: '抵達機場', location: 'Taiwan Taoyuan International Airport',
  notes: '', type: 'TRANSPORT', date: DAY, time: '04:35',
  latitude: 25.0777, longitude: 121.2328, derivedFromFlightAnchorId: 'f1',
} as ItineraryItem;

const takeOff: ItineraryItem = {
  id: 'flight-departure-f1', title: '航班起飛', location: 'Taiwan Taoyuan International Airport',
  notes: '', type: 'FLIGHT', date: DAY, time: '06:35',
  latitude: 25.0777, longitude: 121.2328, derivedFromFlightAnchorId: 'f1',
} as ItineraryItem;

const landing: ItineraryItem = {
  id: 'flight-landing-f1', title: '航班抵達', location: 'Narita International Airport',
  notes: '', type: 'FLIGHT', date: DAY, time: '11:00',
  latitude: 35.772, longitude: 140.3929, derivedFromFlightAnchorId: 'f1',
} as ItineraryItem;

const friendsPlace: ItineraryItem = {
  id: 'own-1', title: '前往 朋友家', location: '朋友家',
  notes: '', type: 'TRANSPORT', date: DAY, time: '13:00',
  latitude: 35.7142, longitude: 139.7967,
} as ItineraryItem;

const renderDay = (items: ItineraryItem[]) =>
  render(<ItineraryCalendar items={items} startDate={DAY} endDate={DAY} />);

describe('between two cards of the same flight', () => {
  /** Same building. There is no journey, and nothing to look one up for. */
  it('draws nothing between 抵達機場 and 航班起飛', () => {
    renderDay([atAirport, takeOff]);

    expect(screen.queryByTestId('transport-unavailable-flight-arrival-f1')).toBeNull();
    expect(screen.queryByText(/大眾運輸/)).toBeNull();
  });

  /** That journey is the aeroplane — 「這個地區查不到大眾運輸路線」 was correct. */
  it('draws nothing between 航班起飛 and 航班抵達', () => {
    renderDay([takeOff, landing]);

    expect(screen.queryByTestId('transport-unavailable-flight-departure-f1')).toBeNull();
    expect(screen.queryByText(/大眾運輸/)).toBeNull();
  });

  it('draws nothing anywhere across all three', () => {
    renderDay([atAirport, takeOff, landing]);

    expect(screen.queryByText(/大眾運輸/)).toBeNull();
  });
});

describe('after the flight lands', () => {
  /*
    The leg this whole thread was about. Landing to the first address is a
    real ride, and it is the one the traveller most needs timed.
  */
  it('still offers the ride into town', () => {
    renderDay([landing, friendsPlace]);

    expect(screen.queryByTestId('transport-unavailable-flight-landing-f1')).toBeNull();
    expect(screen.getByText(/大眾運輸/)).toBeTruthy();
  });
});
