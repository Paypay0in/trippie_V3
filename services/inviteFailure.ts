/**
 * Turning the invite function's refusal into something the traveller can fix.
 *
 * `create_trip_invite` refuses for two reasons, and both are ordinary: the
 * trip has not reached the server, or this companion has not. Both arrived on
 * screen as 「產生邀請連結失敗」, which names no cause and suggests no action
 * — two days before a trip, that is the difference between a fixable state
 * and an app that appears broken.
 */
import i18n from '../i18n/config';

/** What to tell the traveller, given whatever the database said. */
export const inviteFailureMessage = (raw?: string): string => {
  const message = (raw || '').toLowerCase();

  // i18n-data: Postgres/PostgREST error text, matched not shown.
  if (message.includes('member does not belong')) {
    // The companion exists locally but has no row on the server, so there is
    // no seat to hand out. Saving the trip is what pushes them.
    return i18n.t('joinTrip.invite.memberNotSynced');
  }
  // i18n-data: Postgres/PostgREST error text, matched not shown.
  if (message.includes('not the trip owner')) {
    return i18n.t('joinTrip.invite.tripNotSynced');
  }
  // i18n-data: Supabase auth error text, matched not shown.
  if (message.includes('jwt') || message.includes('auth')) {
    return i18n.t('joinTrip.invite.sessionExpired');
  }
  // i18n-data: Postgres missing-function error text, matched not shown.
  if (message.includes('function') && message.includes('does not exist')) {
    return i18n.t('joinTrip.invite.functionMissing');
  }
  // Unknown reasons are shown rather than replaced. A generic sentence hides
  // exactly the cases nobody anticipated, which are the ones worth reading.
  return raw
    ? i18n.t('joinTrip.invite.failedWithReason', { message: raw })
    : i18n.t('joinTrip.invite.failed');
};

/** The same, for the person on the other end of the link. */
export const claimFailureMessage = (raw?: string): string => {
  const message = (raw || '').toLowerCase();

  // i18n-data: invite RPC error text, matched not shown.
  if (message.includes('must be signed in')) {
    return i18n.t('joinTrip.claim.signInFirst');
  }
  // i18n-data: invite RPC error text, matched not shown.
  if (message.includes('invite not found') || message.includes('expired')) {
    return i18n.t('joinTrip.claim.linkUnusable');
  }
  /*
    The seat is held by somebody else's account.

    This reached the reader as 「加入失敗：this seat has already been taken」 —
    raw English, inside a Chinese sentence, describing a thing nobody calls a
    seat. It is also the most likely real failure: the owner invites one
    person per row, and a link forwarded to a second one lands here.
  */
  // i18n-data: invite RPC error text, matched not shown.
  if (message.includes('seat has already been taken')) {
    return i18n.t('joinTrip.claim.seatTaken');
  }
  // i18n-data: Supabase auth error text, matched not shown.
  if (message.includes('jwt') || message.includes('auth')) {
    return i18n.t('joinTrip.claim.sessionExpired');
  }
  return raw
    ? i18n.t('joinTrip.claim.failedWithReason', { message: raw })
    : i18n.t('joinTrip.claim.failed');
};
