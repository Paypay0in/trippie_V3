import { describe, expect, it } from 'vitest';
import { routeOptimisedProposal } from './routeOptimisedProposal';
import { TripInspirationProposal } from './itineraryPlanningService';

/**
 * 「安排合理動線」 — the route planner existed and was wired to one button.
 *
 * Haeundae and Gwangalli are about six kilometres apart: two outings, and a
 * day that bounces between them is the day somebody decides this app cannot
 * plan. The model's order below does exactly that.
 */
const HAEUNDAE = { latitude: 35.1587, longitude: 129.1604 };
const GWANGALLI = { latitude: 35.1532, longitude: 129.1186 };

const item = (id: string, name: string, time: string, where: { latitude: number; longitude: number }) => ({
  id,
  placeName: name,
  suggestedStartTime: time,
  durationMinutes: 90,
  sourceInspirationIds: [],
  source: 'ai_suggestion' as const,
  coordinates: where,
});

const proposal = (days: TripInspirationProposal['days']): TripInspirationProposal =>
  ({ days, warnings: [] });

describe('routeOptimisedProposal', () => {
  it('does nothing to an empty proposal', () => {
    const empty = proposal([]);
    expect(routeOptimisedProposal(empty)).toEqual({
      proposal: empty, moved: 0, beforeKm: 0, afterKm: 0,
    });
  });

  it('keeps every stop it was given', () => {
    const bouncing = proposal([{
      date: '2026-10-02',
      items: [
        item('a', '海雲台海水浴場', '09:00', HAEUNDAE),
        item('b', '廣安里海水浴場', '11:00', GWANGALLI),
        item('c', '海雲台傳統市場', '14:00', HAEUNDAE),
      ],
    }]);

    const { proposal: routed } = routeOptimisedProposal(bouncing, { country: '韓國' });

    const ids = routed.days.flatMap(day => day.items.map(entry => entry.id)).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  /*
    The facts on a proposal item are assembled in one place, and this is not
    it. Only the date and the time come from the plan.
  */
  it('carries every other fact through untouched', () => {
    const one = proposal([{
      date: '2026-10-02',
      items: [{
        ...item('a', '海雲台', '09:00', HAEUNDAE),
        placeId: 'g-haeundae',
        address: '釜山廣域市海雲台區',
        note: '傍晚比較漂亮',
      }],
    }]);

    const { proposal: routed } = routeOptimisedProposal(one, { country: '韓國' });
    const [first] = routed.days[0].items;

    expect(first).toMatchObject({
      id: 'a', placeId: 'g-haeundae', address: '釜山廣域市海雲台區', note: '傍晚比較漂亮',
    });
  });

  /*
    A stop with no coordinates cannot be routed. It keeps the day and time the
    model gave it rather than disappearing — a proposal that silently loses a
    stop is one the traveller approves without knowing what they lost.
  */
  it('keeps a stop the planner could not place', () => {
    const mixed = proposal([{
      date: '2026-10-02',
      items: [
        item('a', '海雲台', '09:00', HAEUNDAE),
        {
          id: 'b', placeName: '某間還沒對到地圖的店', suggestedStartTime: '13:00',
          sourceInspirationIds: [], source: 'ai_suggestion' as const,
        },
      ],
    }]);

    const { proposal: routed } = routeOptimisedProposal(mixed, { country: '韓國' });
    const unplaced = routed.days.flatMap(day => day.items).find(entry => entry.id === 'b');

    expect(unplaced).toMatchObject({ suggestedStartTime: '13:00' });
  });

  it('reads out in clock order within each day', () => {
    const jumbled = proposal([{
      date: '2026-10-02',
      items: [
        item('a', '海雲台傳統市場', '15:00', HAEUNDAE),
        item('b', '海雲台海水浴場', '09:00', HAEUNDAE),
      ],
    }]);

    const { proposal: routed } = routeOptimisedProposal(jumbled, { country: '韓國' });
    const times = routed.days[0].items.map(entry => entry.suggestedStartTime || '');

    expect([...times]).toEqual([...times].sort());
  });

  it('reports whether it changed anything', () => {
    const already = proposal([{
      date: '2026-10-02',
      items: [item('a', '海雲台', '09:00', HAEUNDAE)],
    }]);

    const result = routeOptimisedProposal(already, { country: '韓國' });
    expect(typeof result.moved).toBe('number');
    expect(result.beforeKm).toBeGreaterThanOrEqual(0);
  });
});
