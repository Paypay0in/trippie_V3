/**
 * @vitest-environment jsdom
 *
 * One question asks for one thing.
 *
 * Submitting 「我想滑雪」 used to fire the planner and the older preparation
 * endpoint at the same time. Both answered, at their own speed, so the screen
 * grew a checklist and then shoved it down when the plans arrived — two jumps
 * for one question. Worse than the jumping: it was a list of things to prepare
 * for a trip the traveller had not decided on yet, which is the thing the
 * canon's planning section exists to prevent.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchActivityPlans = vi.fn(async () => ({
  requestId: 'req-1',
  intro: '從東京安排滑雪，建議至少留兩天。',
  options: [],
  sources: [],
  grounded: true,
}));
const fetchPreparationSuggestions = vi.fn(async () => ({
  suggestions: [{ item: '租借雪具', reason: '現場排隊很久' }],
  placeQueries: [],
  postRefs: [],
  sources: [],
  grounded: true,
}));
const fetchSuggestedPlaces = vi.fn(async () => []);

vi.mock('../services/activityPlanProposal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/activityPlanProposal')>()),
  fetchActivityPlans,
}));
vi.mock('../services/preparationSuggestionService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/preparationSuggestionService')>()),
  fetchPreparationSuggestions,
  fetchSuggestedPlaces,
}));

const renderPlanner = async () => {
  const { default: TripPlanOverview } = await import('../components/TripPlanOverview');
  return render(
    <TripPlanOverview
      expenses={[]}
      shoppingList={[]}
      itinerary={[]}
      companionCount={0}
      dateRange="2026-10-01 – 2026-10-03"
      onContinuePlanning={() => {}}
      onEnterTripMode={() => {}}
      onExploreInspiration={() => {}}
      destination="東京"
      destinationCountry="日本"
      hasPassport
      onResearchEntryRules={() => {}}
      onOpenIdentity={() => {}}
      onSelectPassportCountry={() => {}}
      onChangeDestination={() => {}}
      communityPosts={[]}
      onOpenPost={() => {}}
      savedInspirations={[]}
      onTogglePreparationItem={() => {}}
      onAddPreparationItems={() => {}}
      tripStartDate="2026-10-01"
      tripEndDate="2026-10-03"
    />,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('asking the planner a question', () => {
  it('asks for plans and nothing else', async () => {
    const user = userEvent.setup();
    await renderPlanner();

    await user.type(screen.getByPlaceholderText(/我想滑雪/), '我想滑雪');
    await user.click(screen.getByText(/AI 幫我想方案/));

    await waitFor(() => expect(fetchActivityPlans).toHaveBeenCalledTimes(1));
    // The second request is the one that made the screen move twice, and it
    // answered a question nobody had reached yet.
    expect(fetchPreparationSuggestions).not.toHaveBeenCalled();
  });

  it('never offers a preparation checklist before a plan is chosen', async () => {
    const user = userEvent.setup();
    await renderPlanner();

    await user.type(screen.getByPlaceholderText(/我想滑雪/), '我想滑雪');
    await user.click(screen.getByText(/AI 幫我想方案/));
    await waitFor(() => expect(fetchActivityPlans).toHaveBeenCalled());

    // Preparation belongs to a chosen plan. Nothing was chosen here.
    expect(screen.queryByText('AI 建議')).toBeNull();
    expect(screen.queryByText(/加入待辦清單/)).toBeNull();
  });
});
