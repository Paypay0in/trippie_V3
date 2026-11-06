/**
 * Offers of a cloud trip this device has already turned down.
 *
 * 「你看這個藍色會一直顯示 / 我希望我可以回應他說 我不要同步 那這個藍色就消失」.
 *
 * The banner above it is right to exist: a trip deleted here is never put back
 * by the sign-in merge, and a silent refusal is indistinguishable from a lost
 * trip. So it says the refusal out loud. What it had was one button —
 * 「取回」 — and a traveller who does not want the trip back had no way to
 * answer, so the notice stayed on his home screen for good. A question with
 * only one acceptable answer is not a question.
 *
 * Kept apart from `deletedTrips` on purpose, even though both are lists of
 * ids this device holds against a trip. They answer different questions:
 * 「did I delete this?」 and 「have I already been asked about it?」. Folding
 * them into one list would mean 「stop telling me」 and 「I deleted it」 could
 * never disagree — and the day they need to, somebody's trip is the cost.
 *
 * Device-local and non-destructive, like the tombstone it sits beside. The
 * cloud row is untouched: another phone, or this one after a re-invite, still
 * finds the trip. 「Do not offer me this」 must never be the thing that destroys
 * the ledger a travelling companion is still settling from.
 */

export const DECLINED_RECOVERIES_STORAGE_KEY = 'trippie_declined_recoveries_v1';

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(DECLINED_RECOVERIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
  } catch {
    return [];
  }
};

const write = (ids: string[]): void => {
  try {
    // Capped and newest-kept: a list of answers, not a history.
    localStorage.setItem(DECLINED_RECOVERIES_STORAGE_KEY, JSON.stringify(ids.slice(-300)));
  } catch {
    /*
      A blocked store costs the banner coming back next launch — the behaviour
      this replaces. Worth nothing, costs nothing, and never worth failing the
      tap over.
    */
  }
};

export const declinedRecoveryIds = (): string[] => read();

export const rememberDeclinedRecovery = (id: string): void => {
  if (!id) return;
  const current = read();
  if (current.includes(id)) return;
  write([...current, id]);
};

/**
 * Asked for it back after all.
 *
 * Pulling a trip back clears the refusal too, so the banner can offer it again
 * if it is ever deleted again. Leaving it set would silence a future notice
 * about a trip the traveller has since chosen to keep.
 */
export const forgetDeclinedRecovery = (id: string): void => {
  if (!id) return;
  const current = read();
  if (!current.includes(id)) return;
  write(current.filter(existing => existing !== id));
};
