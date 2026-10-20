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
  it('states the voltage and shows the socket shapes for 韓國', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    expect(screen.getByTestId('power-headline').textContent).toBe('220V · 60Hz');
    // 「另外要附圖片」 — the letters mean nothing without the shape.
    expect(screen.getByTestId('plug-type-C')).toBeTruthy();
    expect(screen.getByTestId('plug-type-F')).toBeTruthy();
  });

  it('separates what copes with any voltage from what does not', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    const advice = screen.getByTestId('power-advice').textContent || '';
    expect(advice).toContain('100–240V');
    expect(advice).toContain('吹風機');
  });

  /*
    「我目前設定是持有中國護照 因此這邊寫台灣很奇怪！」 — home was hardcoded. The
    app does not know where this reader's sockets are, so it says nothing
    about them.
  */
  it('never mentions a country the traveller did not name', () => {
    mount({ destination: '墨西哥市', destinationCountry: '墨西哥' });

    const card = screen.getByTestId('power-advice').textContent || '';
    expect(card).not.toContain('台灣');
  });

  it('answers for 日本 too', () => {
    mount({ destination: '東京', destinationCountry: '日本' });

    expect(screen.getByTestId('power-headline').textContent).toBe('100V · 50Hz');
    expect(screen.getByTestId('plug-type-A')).toBeTruthy();
  });

  /* A country the table has never heard of says nothing, rather than guessing. */
  it('stays quiet about a country it does not know', () => {
    mount({ destination: '某地', destinationCountry: '瓦干達' });

    expect(screen.queryByTestId('power-headline')).toBeNull();
  });
});
