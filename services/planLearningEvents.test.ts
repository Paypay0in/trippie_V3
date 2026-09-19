import { describe, expect, it } from 'vitest';
import { ActivityPlanProposal } from './activityPlanProposal';
import { buildPlanEvent } from './planLearningEvents';

const plan = (id: string, overrides: Partial<ActivityPlanProposal> = {}): ActivityPlanProposal => ({
  id,
  title: id,
  whyItFits: '',
  durationDays: 1,
  characteristics: ['easiest'],
  logistics: {},
  budgetConfidence: 'unverified',
  preparation: [],
  items: [],
  ...overrides,
});

let counter = 0;
const generateId = () => `ev-${(counter += 1)}`;
const base = { userId: 'u1', tripId: 't1', requestId: 'req-1', generateId, now: () => '2027-01-11T00:00:00.000Z' };

describe('plan learning events', () => {
  it('records what an option was chosen over', () => {
    // A bare id says nothing; the alternatives are what make a choice a signal.
    const shown = [plan('a'), plan('b'), plan('c')];
    const event = buildPlanEvent({ ...base, type: 'option_selected', option: shown[1], shownOptions: shown });
    expect(event.optionId).toBe('b');
    expect(event.alternativeOptionIds).toEqual(['a', 'c']);
  });

  it('keeps a verified budget', () => {
    const verified = plan('a', {
      budgetConfidence: 'verified',
      budget: { min: 50000, max: 90000, currency: 'KRW' },
    });
    const event = buildPlanEvent({ ...base, type: 'option_selected', option: verified });
    expect(event.budgetMin).toBe(50000);
    expect(event.currency).toBe('KRW');
  });

  it('refuses to store a price nobody verified', () => {
    // Stored as a number, a remembered price becomes evidence months later
    // about what this person will pay.
    const guessed = plan('a', { budget: { min: 50000, max: 90000, currency: 'KRW' } });
    const event = buildPlanEvent({ ...base, type: 'option_selected', option: guessed });
    expect(event.budgetMin).toBeUndefined();
    expect(event.budgetMax).toBeUndefined();
    expect(event.currency).toBeUndefined();
  });

  it('carries the resulting itinerary ids so later edits trace back', () => {
    const event = buildPlanEvent({
      ...base,
      type: 'added_to_itinerary',
      option: plan('a'),
      resultingItineraryItemIds: ['i1', 'i2'],
    });
    expect(event.resultingItineraryItemIds).toEqual(['i1', 'i2']);
  });

  it('holds no derived label about the person', () => {
    const event = buildPlanEvent({ ...base, type: 'options_shown', shownOptions: [plan('a')] });
    expect(Object.keys(event)).not.toContain('segment');
    expect(Object.keys(event)).not.toContain('preference');
    expect(event.optionId).toBeUndefined();
  });
});
