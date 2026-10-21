/**
 * @vitest-environment jsdom
 *
 * 「主畫面的還是沒有」, four times, about 釜山.
 *
 * It was on one browser and not in the account. A trip publishes only when it
 * is opened while signed in, so one made and never reopened stays put — and
 * the shelf drew it exactly like every other card. The numbers that settle it
 * existed the whole time behind `?sync=1`, which is a thing a developer types,
 * not something to ask of somebody in Japan with a phone.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import { TripDraft } from '../services/tripPersistence';

afterEach(cleanup);

const draft = (id: string, name: string): TripDraft =>
  ({ id, name, destination: name, startDate: '2026-10-02', endDate: '2026-10-07', expenses: [] }) as unknown as TripDraft;

const home = (props: Record<string, unknown> = {}) => render(
  <TravelHome
    activeSection="trips"
    onSectionChange={vi.fn()}
    onPlus={vi.fn()}
    drafts={[draft('tokyo', '東京'), draft('busan', '釜山')]}
    tripHistory={[]}
    activeDraftId="tokyo"
    onContinueDraft={vi.fn()}
    onContinueTrip={vi.fn()}
    onCreateNew={vi.fn()}
    onOpenPlanner={vi.fn()}
    savedTravelInspirations={[]}
    communityPosts={[]}
    onOpenSavedDestination={vi.fn()}
    authStatus="authenticated"
    {...props}
  />,
);

describe('未上傳', () => {
  it('marks the trip the account has never been told about', () => {
    home({ signedIn: true, cloudTripIds: new Set(['tokyo']) });

    expect(screen.getByTestId('trip-not-uploaded-busan')).toBeTruthy();
    expect(screen.queryByTestId('trip-not-uploaded-tokyo')).toBeNull();
  });

  /*
    Before the cloud answers, every card would wear it. A warning that fires
    on every cold start is one nobody reads on the day it is true.
  */
  it('marks nothing while the cloud list is still unknown', () => {
    home({ signedIn: true, cloudTripIds: undefined });

    expect(screen.queryByTestId('trip-not-uploaded-busan')).toBeNull();
  });

  it('marks nothing when signed out', () => {
    home({ signedIn: false, cloudTripIds: new Set<string>() });

    expect(screen.queryByTestId('trip-not-uploaded-busan')).toBeNull();
  });
});

describe('the two counts', () => {
  /* 「雲端有 5」 and 「這台有 10」 are different facts; only both show the gap. */
  it('states both when they disagree', () => {
    home({ signedIn: true, cloudTripIds: new Set(['tokyo']) });

    expect(screen.getByTestId('cloud-presence-summary').textContent)
      .toBe('本機 2 趟・雲端 1 趟・1 趟還沒上傳');
  });

  it('says nothing when everything is published', () => {
    home({ signedIn: true, cloudTripIds: new Set(['tokyo', 'busan']) });

    expect(screen.queryByTestId('cloud-presence-summary')).toBeNull();
  });

  /* Signed out is one sentence, not a badge on every card. */
  it('tells a signed-out traveller their trips are device-only', () => {
    home({ signedIn: false });

    expect(screen.getByTestId('cloud-presence-summary').textContent)
      .toContain('只存在這台裝置');
  });
});
