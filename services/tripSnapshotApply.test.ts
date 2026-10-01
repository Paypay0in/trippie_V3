import { describe, expect, it } from 'vitest';
import { shouldHydrateInitialSnapshot } from './tripSnapshotApply';

describe('initial snapshot authority', () => {
  it('hydrates an existing trip even when every remote list is empty', () => {
    // Empty is data here: it removes the last expense or itinerary item that
    // another client deleted.
    expect(shouldHydrateInitialSnapshot(false)).toBe(true);
  });

  it('preserves the local draft for a newly-created cloud row', () => {
    // The row has no children because this device has not made its first push,
    // not because another client deliberately cleared them.
    expect(shouldHydrateInitialSnapshot(true)).toBe(false);
  });
});
