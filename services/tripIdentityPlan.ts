/**
 * Who decides what a trip is called, and when that travels.
 *
 * A trip's identity — its name, destination and dates — was written to the
 * cloud once, when the row was inserted, and never again. So renaming a trip
 * reached nobody: 「我把東京加他了」 and the other phone still showed whatever
 * the trip was called the day it was made. The same gap is what let a local
 * accident go unnoticed for an hour, because nothing on either side could
 * disagree out loud.
 *
 * The rule follows the one the database already enforces. `trips_update` lets
 * only the owner change the row, so:
 *
 * - **the owner's device writes.** It is the only device allowed to, which also
 *   means two devices can never fight over the name.
 * - **everybody else reads.** A member's local copy follows the cloud, because
 *   their device cannot publish a correction even if it wanted to.
 *
 * And on open, nothing moves. 「我的釜山不見了」 was a local overwrite; if
 * opening a trip published whatever this device happened to be holding, that
 * accident would have reached the server before anybody saw it. An owner
 * publishes when the name *changes* — which is a person typing — and a
 * disagreement that was already there stays a question for the shelf to ask.
 */

export interface TripIdentity {
  name: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
}

/** What to do about the two copies. */
export type IdentityPlan =
  /** This device owns the trip and the traveller has just changed it. */
  | { action: 'push'; identity: TripIdentity }
  /** Somebody else owns the trip and the cloud's copy is the real one. */
  | { action: 'pull'; identity: TripIdentity }
  | { action: 'nothing' };

const text = (value?: string): string => (value || '').trim();

export const sameIdentity = (left?: TripIdentity, right?: TripIdentity): boolean =>
  Boolean(left) && Boolean(right)
  && text(left?.name) === text(right?.name)
  && text(left?.destination) === text(right?.destination)
  && text(left?.startDate) === text(right?.startDate)
  && text(left?.endDate) === text(right?.endDate);

export const identityPlan = ({
  local,
  remote,
  isOwner,
  /**
   * What this device held when the trip was opened.
   *
   * The difference between 「the traveller just renamed this」 and 「these two
   * copies were already apart」. Only the first is a decision, and only a
   * decision gets published.
   */
  openedWith,
}: {
  local: TripIdentity;
  remote?: TripIdentity;
  isOwner: boolean;
  openedWith?: TripIdentity;
}): IdentityPlan => {
  // Nothing read yet, or a row this device just created: it already carries
  // what was inserted.
  if (!remote) return { action: 'nothing' };
  if (sameIdentity(local, remote)) return { action: 'nothing' };

  if (!isOwner) {
    // A name with nothing in it is not a correction. An empty cloud name would
    // otherwise blank a trip on the one device that cannot fix it back.
    return text(remote.name) ? { action: 'pull', identity: remote } : { action: 'nothing' };
  }

  // The owner publishes a change, not a difference. See the note above.
  if (!openedWith || sameIdentity(local, openedWith)) return { action: 'nothing' };
  return text(local.name) ? { action: 'push', identity: local } : { action: 'nothing' };
};
