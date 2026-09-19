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

describe('a revision request as an event', () => {
  it('keeps the traveller’s words exactly as written', () => {
    // Raw, not summarised. A dismissal records that an option was rejected;
    // this records what to offer instead, and only the original wording
    // carries that.
    const event = buildPlanEvent({
      type: 'revision_requested',
      userId: 'user-1',
      tripId: 'trip-1',
      requestId: 'req-1',
      feedbackText: '  想在城之島多留一點時間，不想開車  ',
      generateId: () => 'event-1',
      now: () => '2026-09-19T09:00:00.000Z',
    });

    expect(event.type).toBe('revision_requested');
    expect(event.feedbackText).toBe('想在城之島多留一點時間，不想開車');
  });

  it('leaves the field out when nothing was written', () => {
    const event = buildPlanEvent({
      type: 'option_dismissed',
      userId: 'user-1',
      tripId: 'trip-1',
      requestId: 'req-1',
      generateId: () => 'event-2',
      now: () => '2026-09-19T09:00:00.000Z',
    });

    expect(event.feedbackText).toBeUndefined();
  });
});
