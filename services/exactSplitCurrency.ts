/**
 * An exact split, entered in the currency the bill was paid in.
 *
 * 「該筆帳的金額是用韓幣計價 但是分帳的時候只能顯示用台幣分帳 是錯誤的」. The boxes
 * were labelled TWD and held TWD, so splitting a 28,000 KRW dinner meant
 * converting it in your head before typing — while the number the traveller
 * actually has is the one printed on the bill in front of them.
 *
 * The ledger still settles in TWD, so the conversion happens on the way in and
 * out. Kept here rather than inline in the form because it is the arithmetic
 * that decides who owes what, and that is worth being able to test on its own.
 */

/** A rate that can be divided by; anything else means the amount is already TWD. */
const usableRate = (rate?: number): number | undefined =>
  (Number.isFinite(rate) && (rate as number) > 0 ? rate : undefined);

export const isForeignSplit = (currency?: string, rate?: number): boolean =>
  Boolean(currency) && currency!.toUpperCase() !== 'TWD' && usableRate(rate) !== undefined;

/** What a typed share is worth in the ledger's currency. */
export const splitEntryToTwd = (value: number, currency?: string, rate?: number): number =>
  (isForeignSplit(currency, rate) ? value * (rate as number) : value);

/** What a stored share reads as in the bill's own currency. */
export const splitTwdToEntry = (value: number, currency?: string, rate?: number): number =>
  (isForeignSplit(currency, rate) ? value / (rate as number) : value);

export interface ExactSplitInput {
  /** The bill as entered, in its own currency. */
  amount: number;
  currency?: string;
  exchangeRate?: number;
  /** The bill in TWD, which is what the stored shares must add up to. */
  totalTwd: number;
  /** What the traveller typed, in the bill's currency, keyed by member. */
  typed: Record<string, number>;
  /** The member whose share is whatever is left. */
  remainderMemberId?: string;
}

export interface ExactSplitResult {
  /** Shares in TWD, ready to store. */
  allocations: Record<string, number>;
  /** The share left for the last beneficiary, in the bill's own currency. */
  remainderEntry: number;
  /** True when the typed shares already exceed the bill. */
  exceedsTotal: boolean;
}

/**
 * Turns typed shares into stored ones.
 *
 * The remainder is taken from the TWD total rather than converted from the
 * leftover, so the parts always add up to the bill exactly: converting each
 * share separately leaves a rounding gap on every foreign-currency split, and
 * a settlement that is 1 短 is a settlement somebody has to argue about.
 */
export const resolveExactSplit = (input: ExactSplitInput): ExactSplitResult => {
  const totalEntry = isForeignSplit(input.currency, input.exchangeRate) ? input.amount : input.totalTwd;

  const allocations: Record<string, number> = {};
  let typedTotalEntry = 0;

  Object.entries(input.typed).forEach(([memberId, value]) => {
    if (memberId === input.remainderMemberId) return;
    const share = Math.max(0, Number.isFinite(value) ? value : 0);
    typedTotalEntry += share;
    if (share > 0) allocations[memberId] = splitEntryToTwd(share, input.currency, input.exchangeRate);
  });

  const exceedsTotal = typedTotalEntry > totalEntry + 0.0001;

  if (input.remainderMemberId) {
    allocations[input.remainderMemberId] = Math.max(
      0,
      input.totalTwd - splitEntryToTwd(typedTotalEntry, input.currency, input.exchangeRate),
    );
  }

  return {
    allocations,
    remainderEntry: Math.max(0, totalEntry - typedTotalEntry),
    exceedsTotal,
  };
};
