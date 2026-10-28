import { TravelRulesRequestError } from './travelRulesService';

/**
 * The one place that decides what a failed travel-rules lookup says.
 *
 * `travelRulesService` throws a single class for every non-ok response and
 * carries the HTTP status on it. That status is the only thing that separates
 * 「press it again in a minute」 from 「pressing it again will never work」, so it
 * is read here and nowhere else — two lookup buttons asking two different
 * functions is how the same failure ended up reading as two problems.
 *
 * The wording is ours in every branch. The API's own message stays in the log:
 * it arrives in English as often as not, and a status line is not an
 * instruction to anybody.
 *
 * Founder decision, 2026-10-28:
 *   400, 403, 404, 422 → permanent. Either the destination has no rules to
 *     find, or we sent something the server will refuse again identically.
 *   429 → the daily lookup allowance, which returns tomorrow. Its own wording,
 *     because 「try later」 and 「never」 are both wrong for it.
 *   anything else, including every 5xx and a dead network → transient.
 */
export const PERMANENT_MESSAGE = '這個目的地目前查不到旅行規定，請手動建立入境待辦。';
export const QUOTA_MESSAGE = '今日旅行規定查詢次數已用完，明天會恢復。你仍可以手動建立入境待辦。';
export const TRANSIENT_MESSAGE = '旅行規定暫時無法更新，稍後可再試。';

const PERMANENT_STATUSES = new Set([400, 403, 404, 422]);

export const travelRulesErrorMessage = (error: unknown): string => {
  if (error instanceof TravelRulesRequestError) {
    if (error.status === 429) return QUOTA_MESSAGE;
    return PERMANENT_STATUSES.has(error.status) ? PERMANENT_MESSAGE : TRANSIENT_MESSAGE;
  }
  /*
    Everything else reaching here is a precondition the lookup refused on — no
    destination, or a passport with no country code. Those messages are written
    for the traveller and name the one thing to fix, so they are shown as-is.
  */
  const message = error instanceof Error ? error.message.trim() : '';
  return message || TRANSIENT_MESSAGE;
};
