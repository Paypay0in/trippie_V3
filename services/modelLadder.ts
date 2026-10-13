/**
 * The order the model ladder is walked in, informed by what just happened.
 *
 * The ladder exists because the free tier meters per model, so four models are
 * four allowances. What it does not account for is that an allowance stays
 * spent: a model that answered 429 a second ago will answer 429 again, and the
 * next request still walks it first, with retries and backoff, before reaching
 * the one that works.
 *
 * Measured against this project's key, one flight screenshot:
 *
 *   gemini-3-flash-preview    429 quota exhausted
 *   gemini-3.5-flash          503 high demand
 *   gemini-3.5-flash-lite     503 high demand      (55.7s)
 *   gemini-3.1-flash-lite     200 read correctly   ( 6.1s)
 *
 * Over a minute spent on rungs that had already said no, for a six-second
 * answer. That is 「讀取很久」.
 *
 * A model that just failed is moved to the *back* of the ladder, not removed
 * from it. Skipping would throw away a real allowance on the strength of one
 * failure — a 429 can be the per-minute bucket rather than the daily one, and
 * a 503 is explicitly temporary. Reordering costs nothing if the guess is
 * wrong: every model is still tried, just in a better order.
 */

export type LadderFailure = 'quota' | 'busy';

/**
 * How long a failure is believed for.
 *
 * Long enough to cover the request that follows it — the traveller retrying
 * the upload they just watched fail is the case this exists for — and short
 * enough that a per-minute bucket which has refilled gets its turn back.
 */
const COOLDOWN_MS: Record<LadderFailure, number> = {
  quota: 5 * 60_000,
  busy: 60_000,
};

export interface ModelLadder {
  /** The models to try, in order, best first. Always all of them. */
  order: (models: readonly string[]) => string[];
  /** Records that a model refused, so the next request starts elsewhere. */
  note: (model: string, failure: LadderFailure) => void;
}

export const createModelLadder = (now: () => number = Date.now): ModelLadder => {
  const coolingUntil = new Map<string, number>();

  return {
    note: (model, failure) => {
      coolingUntil.set(model, now() + COOLDOWN_MS[failure]);
    },
    /*
      A stable sort on "is this one still cooling", so models that have not
      failed keep their hand-written order — that order encodes which model
      reads a boarding pass best, and nothing here knows better than it. Only
      the ones with a fresh refusal against them move, and they move together,
      keeping their relative order among themselves.
    */
    order: models => {
      const at = now();
      const cooling = (model: string) => (coolingUntil.get(model) ?? 0) > at;
      return [...models].sort((a, b) => Number(cooling(a)) - Number(cooling(b)));
    },
  };
};
