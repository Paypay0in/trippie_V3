import { describe, expect, it } from 'vitest';
import { applicableBroadcastFields, cloudOwnsSharedState } from './sharedStateOwnership';

const broadcast = {
  expenses: [{ id: 'e1' }],
  companions: [{ id: 'c1' }],
  shoppingList: [{ id: 's1' }],
  startDate: '2026-10-02',
  name: '釜山',
  destination: '釜山',
};

describe('who owns shared state', () => {
  it('is the database once someone is signed in and sync is configured', () => {
    expect(cloudOwnsSharedState({ signedIn: true, syncAvailable: true })).toBe(true);
  });

  it('is the socket when either half is missing', () => {
    // Without an account there are no row-level-security grants, and without
    // a client there is no database. Gating the socket in either case would
    // leave two people unable to see each other at all.
    expect(cloudOwnsSharedState({ signedIn: false, syncAvailable: true })).toBe(false);
    expect(cloudOwnsSharedState({ signedIn: true, syncAvailable: false })).toBe(false);
    expect(cloudOwnsSharedState({ signedIn: false, syncAvailable: false })).toBe(false);
  });
});

describe('what a broadcast may still write', () => {
  it('refuses the fields the database owns', () => {
    // This is the money bug. A broadcast that cannot know about the expense
    // the other phone added a moment ago must not be allowed to replace the
    // list, because the next push deletes whatever the list is missing.
    const applied = applicableBroadcastFields(broadcast, true);

    expect(applied.expenses).toBeUndefined();
    expect(applied.companions).toBeUndefined();
  });

  it('still carries what has no table behind it', () => {
    // The checklist and the trip's own details have no shared table, so the
    // broadcast is the only sharing they have. Gating them would take away
    // working behaviour to fix a bug they do not have.
    const applied = applicableBroadcastFields(broadcast, true);

    expect(applied.shoppingList).toEqual([{ id: 's1' }]);
    expect(applied.startDate).toBe('2026-10-02');
    expect(applied.name).toBe('釜山');
    expect(applied.destination).toBe('釜山');
  });

  it('changes nothing for two people sharing without accounts', () => {
    expect(applicableBroadcastFields(broadcast, false)).toEqual(broadcast);
  });

  it('leaves the payload it was given alone', () => {
    const original = { ...broadcast };
    applicableBroadcastFields(broadcast, true);
    expect(broadcast).toEqual(original);
  });

  it('copes with a partial broadcast from an older client', () => {
    expect(applicableBroadcastFields({ name: '釜山' }, true)).toEqual({ name: '釜山' });
    expect(applicableBroadcastFields({}, true)).toEqual({});
  });
});
