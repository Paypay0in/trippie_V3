/**
 * A seat remembers whose it is.
 *
 * The local roster could hold a name and nothing else, so a seat linked by
 * claiming an invite was indistinguishable from a name somebody typed. Three
 * consequences, all of them seen on a real trip the night before departure:
 * the owner's phone called a traveller who had joined 「訪客」; every device
 * asked "which member is using me" and answered "the owner", filing her
 * expenses under his name; and that nameless roster was written back to the
 * server, clearing the account off the seat and removing her from the trip
 * minutes after each invite she accepted.
 */
import { describe, expect, it } from 'vitest';
import { buildTripRoster } from '../services/tripRoster';
import { resolveViewer } from '../services/tripRoster';

const TRIP = 'trip-1';
const OWNER_SEAT = `${TRIP}:owner`;

describe('a roster built from companions', () => {
  it('keeps the account a claimed seat carries', () => {
    const roster = buildTripRoster({
      tripId: TRIP,
      ownerUserId: 'account-ann',
      ownerName: 'Ann',
      companions: [{ id: 'seat-gina', name: 'Gina', userId: 'account-gina', type: 'member' }],
    });

    expect(roster[1]).toMatchObject({
      id: 'seat-gina',
      name: 'Gina',
      userId: 'account-gina',
      type: 'member',
    });
  });

  it('lets that account recognise itself instead of answering "the owner"', () => {
    const roster = buildTripRoster({
      tripId: TRIP,
      ownerUserId: 'account-ann',
      ownerName: 'Ann',
      companions: [{ id: 'seat-gina', name: 'Gina', userId: 'account-gina', type: 'member' }],
    });

    expect(resolveViewer({ roster, authUserId: 'account-gina', tripOwnerMemberId: OWNER_SEAT }))
      .toMatchObject({ memberId: 'seat-gina', isResolved: true });
  });

  it('still calls a typed-in name a guest', () => {
    const roster = buildTripRoster({
      tripId: TRIP,
      ownerUserId: 'account-ann',
      ownerName: 'Ann',
      companions: [{ id: 'seat-typed', name: '小明' }],
    });

    expect(roster[1]).toMatchObject({ id: 'seat-typed', type: 'guest' });
    expect(roster[1].userId).toBeUndefined();
  });
});
