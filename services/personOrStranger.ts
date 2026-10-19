import { Person } from './friendships';

/**
 * Somebody this device has a relationship with but cannot name.
 *
 * 「沒動」. The friends list and the pending list both dropped any row whose
 * person was missing from the profile cache — so one profile that failed to
 * resolve took the whole relationship off the screen: no pending request, no
 * friend, a count of 0, and nothing saying why. The row was in the database
 * the entire time, and ✓ had been pressed into a void.
 *
 * A placeholder name is a small wrong. A relationship that renders as nothing
 * is a wrong nobody can even see to report.
 *
 * 旅人 rather than the id: a uuid on a friends list is not more honest than
 * 「旅人」, it is just less readable. The id is kept as the identity, which is
 * what every action here is addressed by.
 */
export const personOrStranger = (person: Person | undefined, id: string): Person =>
  person || { id, displayName: '旅人' };
