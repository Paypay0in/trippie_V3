/**
 * @vitest-environment jsdom
 *
 * A plan that needs a document from home says so once the trip has started.
 *
 * The observed plan drove away in a rental car and asked for an international
 * driving permit — issued in Taiwan, by appointment. Someone already in Japan
 * cannot get one, so that plan is not inconvenient for them, it is impossible.
 * On screen it was an unticked box like any other.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityPlanCards from '../components/ActivityPlanCards';
import type { ActivityPlanProposal } from '../services/activityPlanProposal';

const drivingPlan = {
  id: 'plan-1',
  title: '三浦半島慢活海鮮景觀之旅',
  whyItFits: '距離市區近，租車行駛路線單純。',
  durationDays: 1,
  characteristics: [],
  logistics: {},
  budgetConfidence: 'unverified',
  items: [{ time: '09:00', title: '東京都心租車出發', type: 'ACTIVITY', dayOffset: 0 }],
  preparation: [
    { name: '辦理台灣駕照日文譯本或國際駕照', canBeHumanAssisted: false, beforeDeparture: true },
    { name: '預約三崎港熱門海鮮餐廳', canBeHumanAssisted: true },
  ],
} as unknown as ActivityPlanProposal;

/**
 * Dates relative to the real today, rather than a frozen clock: the component
 * reads the device's date on purpose, and freezing it deadlocks userEvent,
 * which waits on the same timers.
 */
const daysFromNow = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('sv-SE');
};

const openThePlan = async (tripStartDate: string) => {
  const user = userEvent.setup();
  render(
    <ActivityPlanCards
      options={[drivingPlan]}
      grounded
      sources={[]}
      days={[]}
      onAddToItinerary={() => {}}
      tripStartDate={tripStartDate}
    />,
  );
  await user.click(screen.getByText(/看這個方案/));
};

afterEach(() => {
  cleanup();
});

describe('preparation that can only happen before departure', () => {
  it('warns once the trip has already started', async () => {
    await openThePlan(daysFromNow(-2));

    expect(screen.getByText(/旅程已經開始了，可能來不及/)).toBeTruthy();
    expect(screen.getByText('出發前')).toBeTruthy();
  });

  it('stays quiet while there is still time', async () => {
    await openThePlan(daysFromNow(30));

    expect(screen.queryByText(/可能來不及/)).toBeNull();
    // The item is still labelled — knowing it has to happen at home is useful
    // before it is urgent.
    expect(screen.getByText('出發前')).toBeTruthy();
  });

  it('says nothing about a trip with no dates', async () => {
    await openThePlan('');

    expect(screen.queryByText(/可能來不及/)).toBeNull();
  });
});
