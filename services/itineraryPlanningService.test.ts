import { describe, it, expect, vi } from 'vitest';
import { enumerateTripDates, generateTripInspirationProposal, normalizeTripInspirationProposal, toValidTime } from './itineraryPlanningService';
import { TripPlanningInput, TripPlanningInspirationSelection } from './tripInspirationSelection';

const note = (id: string, text: string) => ({
  id: `saved-note-${id}`,
  sourceNoteId: `note-${id}`,
  sourceSliceId: 'slice-a',
  sourcePostId: 'post-1',
  sourceCreatorId: 'creator-1',
  type: 'recommendation' as const,
  text,
});

const HAEUNDAE: TripPlanningInspirationSelection = {
  groupId: 'place:place-haeundae',
  inspirationIds: ['insp-a'],
  placeId: 'place-haeundae',
  placeName: '海雲台',
  country: '韓國',
  city: '釜山',
  coordinates: { latitude: 35.1587, longitude: 129.1604 },
  experienceNotes: [note('a1', '傍晚去比較漂亮')],
  missingPlaceIdentity: false,
};

const GAMCHEON: TripPlanningInspirationSelection = {
  groupId: 'place:place-gamcheon',
  inspirationIds: ['insp-b'],
  placeId: 'place-gamcheon',
  placeName: '甘川文化村',
  country: '韓國',
  city: '釜山',
  coordinates: { latitude: 35.0975, longitude: 129.0107 },
  experienceNotes: [],
  missingPlaceIdentity: false,
};

// Acceptance fixture from the ticket.
const BUSAN_INPUT: TripPlanningInput = {
  destination: '釜山',
  destinationCountry: 'South Korea',
  startDate: '2026-10-02',
  endDate: '2026-10-07',
  durationDays: 6,
  selections: [HAEUNDAE, GAMCHEON],
};

const wellFormedProposal = {
  days: [
    { date: '2026-10-02', items: [{ placeName: '甘川文化村', suggestedStartTime: '10:00', durationMinutes: 120, note: '早上光線好，人也少。', sourceInspirationIds: ['insp-b'] }] },
    { date: '2026-10-03', items: [{ placeName: '海雲台', suggestedStartTime: '17:30', durationMinutes: 90, note: '收藏筆記說傍晚比較漂亮。', sourceInspirationIds: ['insp-a'] }] },
  ],
  warnings: [],
};

describe('enumerateTripDates', () => {
  it('covers both endpoints of the trip', () => {
    expect(enumerateTripDates('2026-10-02', '2026-10-07')).toEqual([
      '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ]);
  });

  it('rejects an inverted, partial, or malformed range', () => {
    expect(enumerateTripDates('2026-10-07', '2026-10-02')).toEqual([]);
    expect(enumerateTripDates('2026-10-02', undefined)).toEqual([]);
    expect(enumerateTripDates('not-a-date', '2026-10-07')).toEqual([]);
  });

  it('rejects a day that does not exist rather than rolling it over', () => {
    // Date.parse('2026-02-30T00:00:00Z') silently yields March 2.
    expect(enumerateTripDates('2026-02-30', '2026-02-30')).toEqual([]);
    expect(enumerateTripDates('2025-02-29', '2025-03-01')).toEqual([]);
    // A real leap day still works.
    expect(enumerateTripDates('2028-02-29', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('crosses a DST boundary without losing or duplicating a day', () => {
    // 2026-03-08 is a US DST start and 2026-10-25 an EU DST end.
    expect(enumerateTripDates('2026-03-07', '2026-03-09')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(enumerateTripDates('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });
});

describe('normalizeTripInspirationProposal — Busan acceptance fixture', () => {
  const proposal = normalizeTripInspirationProposal(wellFormedProposal, BUSAN_INPUT);

  it('only uses dates inside the trip range', () => {
    expect(proposal.days.map(day => day.date)).toEqual(['2026-10-02', '2026-10-03']);
    const tripDates = enumerateTripDates(BUSAN_INPUT.startDate, BUSAN_INPUT.endDate);
    expect(proposal.days.every(day => tripDates.includes(day.date))).toBe(true);
  });

  it('includes both selected places exactly once', () => {
    const names = proposal.days.flatMap(day => day.items.map(item => item.placeName));
    expect([...names].sort()).toEqual(['海雲台', '甘川文化村'].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it('preserves the saved placeIds and coordinates', () => {
    const items = proposal.days.flatMap(day => day.items);
    expect(items.map(item => item.placeId).sort()).toEqual(['place-gamcheon', 'place-haeundae']);
    expect(items.find(item => item.placeName === '海雲台')?.coordinates).toEqual({ latitude: 35.1587, longitude: 129.1604 });
  });

  it('marks both as saved inspiration, with provenance back to the source ids', () => {
    const items = proposal.days.flatMap(day => day.items);
    expect(items.every(item => item.source === 'saved_inspiration')).toBe(true);
    expect(items.find(item => item.placeName === '海雲台')?.sourceInspirationIds).toEqual(['insp-a']);
  });

  it('gives 海雲台 a late-day slot without warning about it', () => {
    const haeundae = proposal.days.flatMap(day => day.items).find(item => item.placeName === '海雲台');
    expect(haeundae?.suggestedStartTime).toBe('17:30');
    expect(proposal.warnings).toEqual([]);
  });

  it('does not mutate the planning input', () => {
    const snapshot = JSON.stringify(BUSAN_INPUT);
    normalizeTripInspirationProposal(wellFormedProposal, BUSAN_INPUT);
    expect(JSON.stringify(BUSAN_INPUT)).toBe(snapshot);
  });
});

describe('normalizeTripInspirationProposal — date bounds', () => {
  it('drops days outside the trip range and says so', () => {
    const raw = {
      days: [
        { date: '2026-09-30', items: [{ placeName: '海雲台', sourceInspirationIds: ['insp-a'] }] },
        { date: '2026-10-03', items: [{ placeName: '甘川文化村', sourceInspirationIds: ['insp-b'] }] },
        { date: '2026-10-20', items: [{ placeName: '松島天空步道', sourceInspirationIds: [] }] },
      ],
    };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.days.map(day => day.date)).toEqual(['2026-10-03']);
    expect(proposal.warnings.some(warning => warning.includes('不在旅程日期範圍內'))).toBe(true);
  });

  it('rejects a malformed date rather than letting it through', () => {
    const raw = { days: [{ date: '10/03', items: [{ placeName: '海雲台', sourceInspirationIds: ['insp-a'] }] }] };
    expect(normalizeTripInspirationProposal(raw, BUSAN_INPUT).days).toEqual([]);
  });
});

describe('normalizeTripInspirationProposal — place identity', () => {
  it('refuses a model-supplied placeId that contradicts the saved one', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', placeId: 'hallucinated-place', coordinates: { latitude: 1, longitude: 1 }, sourceInspirationIds: ['insp-a'] }] }] };
    const [item] = normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items;
    expect(item.placeId).toBe('place-haeundae');
    expect(item.coordinates).toEqual({ latitude: 35.1587, longitude: 129.1604 });
  });

  it('never gives an AI-suggested place a placeId', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '札嘎其市場', placeId: 'invented-id', coordinates: { latitude: 35.0966, longitude: 129.0306 }, sourceInspirationIds: [] }] }] };
    const [item] = normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items;
    expect(item.source).toBe('ai_suggestion');
    expect(item.placeId).toBeUndefined();
    expect(item.sourceInspirationIds).toEqual([]);
    // Plausible coordinates are still allowed through for an AI suggestion.
    expect(item.coordinates).toEqual({ latitude: 35.0966, longitude: 129.0306 });
  });

  it('never lets a bare name confer saved provenance', () => {
    // Names are not identities. An untagged item is an AI suggestion even when it
    // is spelled exactly like a saved place, so it cannot inherit that placeId.
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '  海雲台 ', sourceInspirationIds: [] }] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    const [item] = proposal.days[0].items;
    expect(item.source).toBe('ai_suggestion');
    expect(item.placeId).toBeUndefined();
    expect(item.sourceInspirationIds).toEqual([]);
    // ...and the saved place is honestly reported as unplaced rather than faked.
    expect(proposal.warnings.some(warning => warning.includes('海雲台'))).toBe(true);
  });

  it('drops a zero-island coordinate pair from an AI suggestion', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '某個地方', coordinates: { latitude: 0, longitude: 0 }, sourceInspirationIds: [] }] }] };
    expect(normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items[0].coordinates).toBeUndefined();
  });

  it('refuses to guess by name when the model cites inspiration ids that match nothing', () => {
    // Citing unknown ids means the item is not one of ours; inheriting 海雲台's
    // placeId here would hand a saved place's identity to an AI suggestion.
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', sourceInspirationIds: ['insp-does-not-exist'] }] }] };
    const [item] = normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items;
    expect(item.source).toBe('ai_suggestion');
    expect(item.placeId).toBeUndefined();
    expect(item.sourceInspirationIds).toEqual([]);
  });

  it('cannot pick between two selections that share a place name', () => {
    const twinInput: TripPlanningInput = {
      ...BUSAN_INPUT,
      selections: [
        { ...HAEUNDAE, groupId: 'place:sb-1', inspirationIds: ['insp-sb1'], placeId: 'sb-1', placeName: '스타벅스', experienceNotes: [] },
        { ...GAMCHEON, groupId: 'place:sb-2', inspirationIds: ['insp-sb2'], placeId: 'sb-2', placeName: '스타벅스', experienceNotes: [] },
      ],
    };
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '스타벅스', sourceInspirationIds: [] }] }] };
    const [item] = normalizeTripInspirationProposal(raw, twinInput).days[0].items;
    // Ambiguous, so it must not claim either one's identity.
    expect(item.source).toBe('ai_suggestion');
    expect(item.placeId).toBeUndefined();
  });

  it('still resolves an ambiguous name when the model supplies the ids', () => {
    const twinInput: TripPlanningInput = {
      ...BUSAN_INPUT,
      selections: [
        { ...HAEUNDAE, groupId: 'place:sb-1', inspirationIds: ['insp-sb1'], placeId: 'sb-1', placeName: '스타벅스', experienceNotes: [] },
        { ...GAMCHEON, groupId: 'place:sb-2', inspirationIds: ['insp-sb2'], placeId: 'sb-2', placeName: '스타벅스', experienceNotes: [] },
      ],
    };
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '스타벅스', sourceInspirationIds: ['insp-sb2'] }] }] };
    const [item] = normalizeTripInspirationProposal(raw, twinInput).days[0].items;
    expect(item.source).toBe('saved_inspiration');
    expect(item.placeId).toBe('sb-2');
  });
});

describe('normalizeTripInspirationProposal — duplicates and omissions', () => {
  it('keeps only the first slot when a place is scheduled twice', () => {
    const raw = {
      days: [
        { date: '2026-10-02', items: [{ placeName: '海雲台', suggestedStartTime: '09:00', sourceInspirationIds: ['insp-a'] }] },
        { date: '2026-10-04', items: [{ placeName: '海雲台', suggestedStartTime: '18:00', sourceInspirationIds: ['insp-a'] }, { placeName: '甘川文化村', suggestedStartTime: '11:00', sourceInspirationIds: ['insp-b'] }] },
      ],
    };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    const names = proposal.days.flatMap(day => day.items.map(item => item.placeName));
    expect(names.filter(name => name === '海雲台')).toHaveLength(1);
    expect(proposal.warnings.some(warning => warning.includes('重複安排'))).toBe(true);
  });

  it('drops an untagged duplicate of a place the AI also scheduled properly', () => {
    const raw = { days: [{ date: '2026-10-02', items: [
      { placeName: '海雲台', suggestedStartTime: '17:00', sourceInspirationIds: ['insp-a'] },
      { placeName: '海雲台', suggestedStartTime: '09:00', sourceInspirationIds: [] },
    ] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.days[0].items).toHaveLength(1);
    expect(proposal.days[0].items[0].source).toBe('saved_inspiration');
    expect(proposal.warnings.some(warning => warning.includes('重複安排'))).toBe(true);
  });

  it('lets the saved place win even when the untagged copy comes first', () => {
    // The pre-pass claims the name for the saved place regardless of ordering.
    const raw = { days: [
      { date: '2026-10-02', items: [{ placeName: '海雲台', suggestedStartTime: '09:00', sourceInspirationIds: [] }] },
      { date: '2026-10-04', items: [{ placeName: '海雲台', suggestedStartTime: '17:00', sourceInspirationIds: ['insp-a'] }] },
    ] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    const items = proposal.days.flatMap(day => day.items);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('saved_inspiration');
    expect(items[0].placeId).toBe('place-haeundae');
    expect(items[0].suggestedStartTime).toBe('17:00');
  });

  it('keeps two unresolved selections apart even when they share a place name', () => {
    const twinInput: TripPlanningInput = {
      ...BUSAN_INPUT,
      selections: [
        { ...HAEUNDAE, groupId: 'name:a', inspirationIds: ['insp-x'], placeId: undefined, coordinates: undefined, placeName: '스타벅스', missingPlaceIdentity: true, experienceNotes: [] },
        { ...GAMCHEON, groupId: 'name:b', inspirationIds: ['insp-y'], placeId: undefined, coordinates: undefined, placeName: '스타벅스', missingPlaceIdentity: true, experienceNotes: [] },
      ],
    };
    const raw = { days: [{ date: '2026-10-02', items: [
      { placeName: '스타벅스', sourceInspirationIds: ['insp-x'] },
      { placeName: '스타벅스', sourceInspirationIds: ['insp-y'] },
    ] }] };
    const proposal = normalizeTripInspirationProposal(raw, twinInput);
    // Both are real, distinct places; neither may swallow the other.
    expect(proposal.days[0].items).toHaveLength(2);
    expect(proposal.days[0].items.map(item => item.sourceInspirationIds)).toEqual([['insp-x'], ['insp-y']]);
    expect(proposal.warnings.some(warning => warning.includes('重複安排'))).toBe(false);
  });

  it('reports a selected inspiration the AI never placed', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', sourceInspirationIds: ['insp-a'] }] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.warnings.some(warning => warning.includes('甘川文化村'))).toBe(true);
  });
});

describe('normalizeTripInspirationProposal — experience notes', () => {
  it('warns when an evening-hinted place is scheduled in the morning', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', suggestedStartTime: '08:30', sourceInspirationIds: ['insp-a'] }, { placeName: '甘川文化村', suggestedStartTime: '13:00', sourceInspirationIds: ['insp-b'] }] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.warnings.some(warning => warning.includes('海雲台') && warning.includes('08:30'))).toBe(true);
  });

  it('stays quiet when a place with no evening hint is scheduled early', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '甘川文化村', suggestedStartTime: '08:30', sourceInspirationIds: ['insp-b'] }] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.warnings.some(warning => warning.includes('甘川文化村') && warning.includes('08:30'))).toBe(false);
  });
});

describe('normalizeTripInspirationProposal — malformed output', () => {
  it('survives null, a string, and a missing days array', () => {
    expect(normalizeTripInspirationProposal(null, BUSAN_INPUT).days).toEqual([]);
    expect(normalizeTripInspirationProposal('sorry, here is a markdown plan', BUSAN_INPUT).days).toEqual([]);
    expect(normalizeTripInspirationProposal({ warnings: ['x'] }, BUSAN_INPUT).days).toEqual([]);
  });

  it('skips junk items but keeps the good ones on the same day', () => {
    const raw = { days: [{ date: '2026-10-02', items: [null, 'nonsense', { placeName: '' }, { placeName: '海雲台', sourceInspirationIds: ['insp-a'] }] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.days[0].items.map(item => item.placeName)).toEqual(['海雲台']);
  });

  it('discards an out-of-range time and a nonsensical duration', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', suggestedStartTime: '25:99', durationMinutes: -30, sourceInspirationIds: ['insp-a'] }] }] };
    const [item] = normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items;
    // The model's 25:99 is rejected outright; scheduling then supplies a real
    // start rather than leaving the only activity of the day with no time.
    expect(item.suggestedStartTime).toBe('09:00');
    // A negative duration is nonsense and is not replaced with a guess.
    expect(item.durationMinutes).toBeUndefined();
  });

  it('keeps a single-digit hour instead of dropping the slot', () => {
    // Models routinely emit "9:00". Rejecting it silently lost the start time all
    // the way through to the official itinerary card.
    const raw = { days: [{ date: '2026-10-02', items: [
      { placeName: '海雲台', suggestedStartTime: '9:00', sourceInspirationIds: ['insp-a'] },
      { placeName: '甘川文化村', suggestedStartTime: ' 8:05 ', sourceInspirationIds: ['insp-b'] },
    ] }] };
    const items = normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items;
    // 8:05 is kept exactly: a deliberate early start is not overridden. The 9:00
    // that followed it is not survivable — 甘川文化村 and 海雲台 are ~15km apart — so
    // scheduling pushes the second activity to the first feasible slot instead.
    expect(items.map(item => item.placeName)).toEqual(['甘川文化村', '海雲台']);
    expect(items[0].suggestedStartTime).toBe('08:05');
    expect(items[1].suggestedStartTime! > '09:00').toBe(true);
  });

  it('accepts a full-width colon and still rejects genuine nonsense', () => {
    // Rejection is asserted where it happens. Downstream, an item left without a
    // time is given one by scheduling, so the normalizer can no longer be used to
    // observe which strings were refused.
    expect(toValidTime('9：30')).toBe('09:30');
    expect(toValidTime('23:59')).toBe('23:59');
    expect(toValidTime('24:00')).toBeUndefined();
    expect(toValidTime('11:60')).toBeUndefined();
    expect(toValidTime('上午十一點')).toBeUndefined();
    expect(toValidTime('11:00 AM')).toBeUndefined();
    expect(toValidTime(1130)).toBeUndefined();
  });

  it('carries a valid model time all the way through the proposal', () => {
    const timeOf = (value: unknown) => {
      const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', suggestedStartTime: value, sourceInspirationIds: ['insp-a'] }] }] };
      return normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items[0].suggestedStartTime;
    };
    expect(timeOf('9：30')).toBe('09:30');
    // A late but deliberate start is kept; the day-end cutoff only bounds times
    // that scheduling had to invent.
    expect(timeOf('23:59')).toBe('23:59');
  });

  it('orders a single-digit hour correctly rather than lexically', () => {
    // '9:00' would sort after '13:30' as raw text; normalising to '09:00' fixes it.
    const raw = { days: [{ date: '2026-10-02', items: [
      { placeName: '甘川文化村', suggestedStartTime: '13:30', sourceInspirationIds: ['insp-b'] },
      { placeName: '海雲台', suggestedStartTime: '9:00', sourceInspirationIds: ['insp-a'] },
    ] }] };
    const items = normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items;
    expect(items.map(item => item.placeName)).toEqual(['海雲台', '甘川文化村']);
  });

  it('caps an absurd duration at one day', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', durationMinutes: 99999, sourceInspirationIds: ['insp-a'] }] }] };
    expect(normalizeTripInspirationProposal(raw, BUSAN_INPUT).days[0].items[0].durationMinutes).toBe(1440);
  });

  it('keeps the model warnings alongside its own', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '海雲台', sourceInspirationIds: ['insp-a'] }] }], warnings: ['天氣可能有雨。'] };
    expect(normalizeTripInspirationProposal(raw, BUSAN_INPUT).warnings[0]).toBe('天氣可能有雨。');
  });
});

describe('normalizeTripInspirationProposal — ordering', () => {
  it('sorts days chronologically and items by their suggested time', () => {
    const raw = {
      days: [
        { date: '2026-10-05', items: [{ placeName: '海雲台', suggestedStartTime: '18:00', sourceInspirationIds: ['insp-a'] }] },
        { date: '2026-10-03', items: [{ placeName: '甘川文化村', suggestedStartTime: '14:00', sourceInspirationIds: ['insp-b'] }, { placeName: '札嘎其市場', suggestedStartTime: '09:00', sourceInspirationIds: [] }] },
      ],
    };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.days.map(day => day.date)).toEqual(['2026-10-03', '2026-10-05']);
    expect(proposal.days[0].items.map(item => item.placeName)).toEqual(['札嘎其市場', '甘川文化村']);
  });

  it('puts untimed items last rather than first', () => {
    const raw = { days: [{ date: '2026-10-02', items: [{ placeName: '札嘎其市場', sourceInspirationIds: [] }, { placeName: '海雲台', suggestedStartTime: '09:00', sourceInspirationIds: ['insp-a'] }] }] };
    const proposal = normalizeTripInspirationProposal(raw, BUSAN_INPUT);
    expect(proposal.days[0].items.map(item => item.placeName)).toEqual(['海雲台', '札嘎其市場']);
  });
});

/**
 * The ticket's preference fixture. The model is not asked to produce exact venues
 * or times, so what is asserted is the contract around a preference-driven answer:
 * a place the planner added because the user asked for it stays an AI suggestion,
 * and the selected saved places keep their own identity.
 */
describe('normalizeTripInspirationProposal — planning preferences', () => {
  const PREFERENCE_INPUT: TripPlanningInput = {
    ...BUSAN_INPUT,
    planningPreferences: '釜山輕旅行。想要安排汗蒸幕，每天11點才出門。有租車。',
  };

  const preferenceShapedProposal = {
    days: [
      {
        date: '2026-10-02',
        items: [
          { placeName: '甘川文化村', suggestedStartTime: '11:30', durationMinutes: 120, note: '晚出發，午前抵達剛好。', sourceInspirationIds: ['insp-b'] },
          { placeName: '虛月汗蒸幕', suggestedStartTime: '19:00', durationMinutes: 120, note: '你說想安排汗蒸幕，放在晚上收尾。', sourceInspirationIds: [] },
        ],
      },
      { date: '2026-10-04', items: [{ placeName: '海雲台', suggestedStartTime: '17:30', durationMinutes: 90, note: '收藏筆記說傍晚比較漂亮。', sourceInspirationIds: ['insp-a'] }] },
    ],
    warnings: [],
  };

  it('marks a place added for a preference as an AI suggestion with no provenance', () => {
    const proposal = normalizeTripInspirationProposal(preferenceShapedProposal, PREFERENCE_INPUT);
    const jjimjilbang = proposal.days[0].items.find(item => item.placeName === '虛月汗蒸幕');

    expect(jjimjilbang?.source).toBe('ai_suggestion');
    expect(jjimjilbang?.sourceInspirationIds).toEqual([]);
    expect(jjimjilbang?.placeId).toBeUndefined();
  });

  it('still prioritizes the selected saved inspirations and keeps their identity', () => {
    const proposal = normalizeTripInspirationProposal(preferenceShapedProposal, PREFERENCE_INPUT);
    const savedItems = proposal.days.flatMap(day => day.items).filter(item => item.source === 'saved_inspiration');

    expect(savedItems.map(item => item.placeName).sort()).toEqual(['海雲台', '甘川文化村'].sort());
    expect(savedItems.map(item => item.placeId).sort()).toEqual(['place-gamcheon', 'place-haeundae']);
    expect(proposal.warnings.some(warning => warning.includes('沒有被排進行程'))).toBe(false);
  });

  it('does not let a preference confer saved-inspiration identity by naming a saved place', () => {
    // The model echoes a selected place name on an item it did not tag. Provenance
    // comes from ids alone, so the untagged copy yields rather than inheriting it.
    const raw = {
      days: [{
        date: '2026-10-02',
        items: [
          { placeName: '海雲台', suggestedStartTime: '11:00', sourceInspirationIds: [] },
          { placeName: '海雲台', suggestedStartTime: '17:30', sourceInspirationIds: ['insp-a'] },
        ],
      }],
    };
    const proposal = normalizeTripInspirationProposal(raw, PREFERENCE_INPUT);
    const haeundae = proposal.days[0].items.filter(item => item.placeName === '海雲台');

    expect(haeundae).toHaveLength(1);
    expect(haeundae[0].source).toBe('saved_inspiration');
    expect(haeundae[0].sourceInspirationIds).toEqual(['insp-a']);
  });

  it('normalization ignores the preference text itself — it is prompt input, not data', () => {
    const withPreference = normalizeTripInspirationProposal(preferenceShapedProposal, PREFERENCE_INPUT);
    const withoutPreference = normalizeTripInspirationProposal(preferenceShapedProposal, BUSAN_INPUT);

    expect(withPreference).toEqual(withoutPreference);
  });

  it('sends the exact preference text through the existing proposal request', async () => {
    const preference = '釜山輕旅行。每天 11 點才出門，有租車，想安排汗蒸幕。';
    const input: TripPlanningInput = { ...PREFERENCE_INPUT, planningPreferences: preference };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ days: [], warnings: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(generateTripInspirationProposal(input)).resolves.toEqual({ days: [], warnings: [
        '這些收藏靈感沒有被排進行程：海雲台、甘川文化村。',
      ] });

      const [, request] = fetchMock.mock.calls[0];
      expect(JSON.parse(String(request.body)).planningPreferences).toBe(preference);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
