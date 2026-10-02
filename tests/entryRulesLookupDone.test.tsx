/**
 * @vitest-environment jsdom
 *
 * 「產出之後不該再能夠按查詢」.
 *
 * The Korea lookup came back with a summary and no required formalities, and
 * the panel then showed the first-time 查詢入境規定 call to action directly above
 * its own result — which sat underneath as 注意事項. Pressing it produced the
 * same nothing. One screen said both 「this has never been looked up」 and, two
 * inches lower, what the lookup had found.
 *
 * Finding nothing is an answer. It has to read as one.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

const baseProps = {
  expenses: [],
  shoppingList: [],
  itinerary: [],
  companionCount: 1,
  dateRange: '2026/10/02 - 10/07',
  onContinuePlanning: () => {},
  onEnterTripMode: () => {},
  onExploreInspiration: () => {},
  onManageMembers: () => {},
  destination: '釜山',
  destinationCountry: '韓國',
  passportCountryCode: 'TW',
  communityPosts: [],
  savedInspirations: [],
  onResearchEntryRules: async () => {},
  onSelectPassportCountry: () => {},
} as never;

/** What Korea actually returned: guidance, and nothing anyone must file. */
const lookedUpAndFoundNothing = {
  entry: {
    summary: '台灣旅客入境韓國短期觀光享免簽證待遇。',
    actionableItems: [],
    sources: [],
  },
  generatedAt: '2026-10-01T16:55:00.000Z',
} as never;

/** Korea as it was actually stored: four formalities, written against last year. */
const staleChecklist = {
  entry: {
    summary: '台灣旅客入境韓國短期觀光享免簽證待遇。',
    actionableItems: [
      { actionType: 'visa_or_eta', title: '申請 K-ETA', description: '免 K-ETA 申請至 2024 年底…' },
      { actionType: 'health_declaration', title: '填寫 Q-Code', description: '…' },
    ],
    sources: [],
  },
  generatedAt: '2026-09-28T04:00:00.000Z',
} as never;

afterEach(cleanup);

describe('the entry-rules panel after a lookup that found nothing', () => {
  it('says so, rather than looking like it was never asked', () => {
    render(<TripPlanOverview {...baseProps} travelRules={lookedUpAndFoundNothing} />);

    expect(screen.getByTestId('entry-rules-empty').textContent).toContain('沒有查到必須事先辦理的手續');
  });

  it('demotes the call to action to 重新查詢', () => {
    render(<TripPlanOverview {...baseProps} travelRules={lookedUpAndFoundNothing} />);

    expect(screen.getByRole('button', { name: '重新查詢' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '查詢入境規定' })).toBeNull();
  });

  /**
   * 「結果並無改變」. The checklist was kept once generated, and a trip that had
   * any showed only 收合 — so a list written against last year's K-ETA rules
   * could not be refreshed from the screen at all, and nothing said how old it
   * was, so it read as current.
   */
  it('says when a stored checklist was written, and offers to redo it', () => {
    // The formalities live in the shopping list, tagged as travel rules.
    const storedRules = [
      { id: 'r-keta', name: '申請 K-ETA', isPurchased: false, phase: 'pre', sourceType: 'travel_rules', description: '免 K-ETA 申請至 2024 年底…' },
      { id: 'r-qcode', name: '填寫 Q-Code', isPurchased: false, phase: 'pre', sourceType: 'travel_rules', description: '…' },
    ] as never;

    render(<TripPlanOverview {...baseProps} shoppingList={storedRules} travelRules={staleChecklist} />);

    const age = screen.getByTestId('entry-rules-age');
    expect(age.textContent).toContain('2026-09-28');
    expect(screen.getByRole('button', { name: '重新查詢' })).toBeTruthy();
  });

  /**
   * 「入境規定 必要的只有我的打勾項」.
   *
   * K-ETA, Q-Code, the customs form and the arrival card were one flat run of
   * chores and only the last was required of them, so ranking the list was
   * left to the traveller two days before flying.
   */
  it('says which formalities are compulsory and which are merely advised', () => {
    const korea = [
      { id: 'r-keta', name: '申請 K-ETA', isPurchased: false, phase: 'pre', sourceType: 'travel_rules', travelRuleActionType: 'visa_or_eta', travelRuleNecessity: 'optional' },
      { id: 'r-qcode', name: '填寫 Q-Code', isPurchased: false, phase: 'pre', sourceType: 'travel_rules', travelRuleActionType: 'health_declaration', travelRuleNecessity: 'recommended' },
      { id: 'r-card', name: '入境卡', isPurchased: false, phase: 'pre', sourceType: 'travel_rules', travelRuleActionType: 'arrival_form', travelRuleNecessity: 'required' },
    ] as never;

    render(<TripPlanOverview {...baseProps} shoppingList={korea} travelRules={staleChecklist} />);

    expect(screen.getByTestId('necessity-r-card').textContent).toBe('必要');
    expect(screen.getByTestId('necessity-r-qcode').textContent).toBe('建議');
    expect(screen.getByTestId('necessity-r-keta').textContent).toBe('視情況');
  });

  it('still asks on a trip nobody has looked up', () => {
    render(<TripPlanOverview {...baseProps} travelRules={undefined} />);

    expect(screen.getByRole('button', { name: '查詢入境規定' })).toBeTruthy();
    expect(screen.queryByTestId('entry-rules-empty')).toBeNull();
  });
});
