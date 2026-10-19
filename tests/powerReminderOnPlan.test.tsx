/**
 * @vitest-environment jsdom
 *
 * 「每個國家在行前 都要提醒電壓跟插座這件事 目前都沒有提醒到」.
 *
 * Nothing on the preparation screen said it. Entry rules, tax refunds, tickets
 * to buy, what other travellers recommend — and not the one fact that decides
 * whether anything charges on the first night.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

const baseProps: Record<string, unknown> = {
  expenses: [],
  shoppingList: [],
  itinerary: [],
  companionCount: 1,
  dateRange: '2026/10/02 - 10/07',
  onContinuePlanning: () => {},
  onEnterTripMode: () => {},
  onExploreInspiration: () => {},
  onManageMembers: () => {},
  passportCountryCode: 'TW',
  communityPosts: [],
  savedInspirations: [],
  onResearchEntryRules: async () => {},
  onSelectPassportCountry: () => {},
};

const mount = (over: Record<string, unknown>) => {
  const props = Object.assign({}, baseProps, over) as unknown as React.ComponentProps<typeof TripPlanOverview>;
  render(<TripPlanOverview {...props} />);
};

afterEach(cleanup);

describe('電壓與插座', () => {
  it('states the voltage and the socket for 韓國', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    expect(screen.getByTestId('power-headline').textContent).toBe('220V · C/F 型插座');
    expect(screen.getByText('需要轉接頭')).toBeTruthy();
  });

  /*
    The two questions are separate, and the screen has to keep them apart.
    Telling somebody with only a phone charger to buy a converter is how a
    section stops being read.
  */
  it('names what actually needs a converter', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    const advice = screen.getByTestId('power-advice').textContent || '';
    expect(advice).toContain('100–240V');
    expect(advice).toContain('吹風機');
  });

  it('says plainly that Japan needs nothing', () => {
    mount({ destination: '東京', destinationCountry: '日本' });

    expect(screen.getByTestId('power-headline').textContent).toBe('100V · A/B 型插座');
    expect(screen.getByText('不用轉接頭')).toBeTruthy();
  });

  /* A country the table has never heard of says nothing, rather than guessing. */
  it('stays quiet about a country it does not know', () => {
    mount({ destination: '某地', destinationCountry: '瓦干達' });

    expect(screen.queryByTestId('power-headline')).toBeNull();
  });
});
