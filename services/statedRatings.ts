/**
 * Star ratings, until the column they belong in exists.
 *
 * 「在記帳的帳目中希望就能順便給星等評分」, and then 「先記著本機 我在日本沒帶電
 * 腦」 — the migration adding `expenses.rating` has not been run, and the
 * standing rule is that nothing is wired to a column before the column exists.
 *
 * Keeping the rating on the expense object alone would have lost it silently.
 * A synced bill is replaced by the server's row on every read （see
 * `mergeWithUnpushed`, which returns remote ahead of local）, and the server's
 * row has no rating in it. Every star given today would have survived until
 * the next read and then vanished with nothing on screen to say so — which is
 * the exact failure shape this app has spent two days removing.
 *
 * So the ratings live beside the ledger rather than inside it, keyed by
 * expense id, the same way `statedVisits` and `emptiedSlots` do. The expense
 * carries `rating` as a field, and this is the thing that fills it in: one
 * writer, one reader, no second copy to disagree.
 *
 * Device-local, and that is the known cost: a rating given here is not on
 * Sherry's phone. It becomes a sync field the day the column lands, and these
 * stored ratings are what gets written up when it does.
 */
const STORAGE_KEY = 'trippie_expense_ratings_v1';

/** Expense id → 1–5. An id that is absent was never rated. */
export type StatedRatings = Record<string, number>;

const valid = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;

export const loadStatedRatings = (storage?: Storage): StatedRatings => {
  const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => valid(entry[1]),
      ),
    );
  } catch {
    // A ledger that cannot read one key is still a ledger.
    return {};
  }
};

export const saveStatedRatings = (ratings: StatedRatings, storage?: Storage): void => {
  const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    // Out of quota. Losing a star is survivable; throwing mid-save is not.
  }
};

/** Records a rating, or forgets it when the traveller cleared the stars. */
export const setStatedRating = (
  ratings: StatedRatings,
  expenseId: string,
  rating: number | undefined,
): StatedRatings => {
  if (!expenseId) return ratings;
  if (!valid(rating)) {
    if (!(expenseId in ratings)) return ratings;
    const { [expenseId]: _cleared, ...rest } = ratings;
    return rest;
  }
  return { ...ratings, [expenseId]: rating };
};

/**
 * The bills with their ratings put back on.
 *
 * A rating already on the expense wins: once the column exists the server's
 * value is the real one, and this must stop overriding it the moment that is
 * true, without anybody having to remember to come back here.
 */
export const withStatedRatings = <T extends { id: string; rating?: number }>(
  expenses: T[],
  ratings: StatedRatings,
): T[] => {
  if (Object.keys(ratings).length === 0) return expenses;
  return expenses.map(expense => (
    expense.rating === undefined && ratings[expense.id] !== undefined
      ? { ...expense, rating: ratings[expense.id] }
      : expense
  ));
};
