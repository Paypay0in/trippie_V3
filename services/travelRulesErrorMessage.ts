import i18n from '../i18n/config';
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
/*
  Functions rather than constants, and that is not a style choice.

  A module-level `i18n.t(...)` is evaluated while the import graph is being
  built, and `index.tsx` calls `initI18n` only after `import App from './App'`
  has pulled this module in — so a constant would freeze to its own key before
  any bundle exists. Every migrated service in this repo calls `i18n.t` inside a
  function for that reason. These three used to be exported strings; they are
  now read at the moment the failure is shown, which is also what lets a reader
  who changes language see the message in the new one.
*/
export const permanentMessage = (): string => i18n.t('plan.researchError.permanent');
export const quotaMessage = (): string => i18n.t('plan.researchError.quota');
export const transientMessage = (): string => i18n.t('plan.researchError.transient');

const PERMANENT_STATUSES = new Set([400, 403, 404, 422]);

export const travelRulesErrorMessage = (error: unknown): string => {
  if (error instanceof TravelRulesRequestError) {
    if (error.status === 429) return quotaMessage();
    return PERMANENT_STATUSES.has(error.status) ? permanentMessage() : transientMessage();
  }
  /*
    Everything else reaching here is a precondition the lookup refused on — no
    destination, or a passport with no country code. Those messages are written
    for the traveller and name the one thing to fix, so they are shown as-is.
  */
  const message = error instanceof Error ? error.message.trim() : '';
  return message || transientMessage();
};
