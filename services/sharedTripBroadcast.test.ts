import { describe, expect, it } from 'vitest';
import { createSharedTripBroadcastState, optionalBroadcastList } from './sharedTripBroadcast';

describe('anonymous trip broadcasts', () => {
  it('carries itinerary beside expenses', () => {
    const state = createSharedTripBroadcastState({
      expenses: [{ id: 'e1' }],
      itinerary: [{ id: 'i1' }],
      name: '釜山',
    });

    expect(state.itinerary).toEqual([{ id: 'i1' }]);
  });

  it('preserves an intentionally empty itinerary so the last item is deleted', () => {
    expect(optionalBroadcastList([])).toEqual([]);
  });

  it('distinguishes an old payload that omitted itinerary', () => {
    expect(optionalBroadcastList(undefined)).toBeUndefined();
  });
});
