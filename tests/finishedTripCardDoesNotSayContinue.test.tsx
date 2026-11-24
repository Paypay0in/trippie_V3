/**
 * @vitest-environment jsdom
 *
 * 「已經結束的旅程」 — with 繼續旅程 printed on the button underneath.
 *
 * The card already knows: the badge above reads 已結束的旅程, derived from the
 * trip's dates. The button three hundred lines below it was written once, for
 * one state, and never asked. One card, two statements, and the louder one is
 * the button.
 *
 * This is the shape this project keeps paying for — a rule honoured in one
 * place and ignored in the other — so what is pinned here is agreement
 * between the two, not the wording of either.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import type { TripDraft } from '../services/tripPersistence';
import i18n from '../i18n/config';

const ID = 'tokyo';

const draft = (startDate: string, endDate: string): TripDraft => ({
  id: ID,
  name: 'Tokyo',
  startDate,
  endDate,
  expenses: [],
  companions: [],
  shoppingList: [],
  itinerary: [],
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
} as TripDraft);

/** Dates relative to today, so the test does not expire with the calendar. */
const daysFromToday = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const mount = (trip: TripDraft) =>
  render(
    <TravelHome
      activeSection="trips"
      onSectionChange={() => undefined}
      onPlus={() => undefined}
      drafts={[trip]}
      tripHistory={[]}
      activeDraftId={ID}
      onContinueDraft={() => undefined}
      onContinueTrip={() => undefined}
      onCreateNew={() => undefined}
      onOpenPlanner={() => undefined}
      savedTravelInspirations={[]}
      communityPosts={[]}
      onOpenSavedDestination={() => undefined}
      authStatus="authenticated"
    />,
  );

const cardButton = () => screen.getByTestId(`trip-shelf-open-${ID}`);

afterEach(cleanup);

describe('the button on a trip that is over', () => {
  it('does not invite the traveller to continue it', () => {
    mount(draft(daysFromToday(-34), daysFromToday(-30)));
    expect(cardButton().textContent).not.toContain(i18n.t('trips.continueTrip'));
  });

  it('offers to open it instead', () => {
    mount(draft(daysFromToday(-34), daysFromToday(-30)));
    expect(cardButton().textContent).toContain(i18n.t('trips.openFinishedTrip'));
  });

  it('still says 繼續旅程 while the trip is under way', () => {
    // The label that was right all along, for the one state it was written
    // for. Narrowing it must not take it away from that state.
    mount(draft(daysFromToday(-1), daysFromToday(3)));
    expect(cardButton().textContent).toContain(i18n.t('trips.continueTrip'));
  });

  it('says it for a trip that has not started either', () => {
    mount(draft(daysFromToday(10), daysFromToday(14)));
    expect(cardButton().textContent).toContain(i18n.t('trips.continueTrip'));
  });

  it('agrees with the badge above it, which is the actual defect', () => {
    // Not two independent readings of the dates: the badge and the button
    // must come from the same answer, or they will disagree again the first
    // time one of them learns about a stage the other has not.
    mount(draft(daysFromToday(-34), daysFromToday(-30)));
    const badge = screen.getByTestId(`trip-shelf-status-${ID}`).textContent || '';
    expect(badge).toContain(i18n.t('home.statusFinished'));
    expect(cardButton().textContent).not.toContain(i18n.t('trips.continueTrip'));
  });
});
