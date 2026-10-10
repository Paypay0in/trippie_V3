/**
 * Who actually put money down, and how much each of them did.
 *
 * 「付款者（可多人）· 選擇實際付款的人與金額」.
 *
 * The form has always kept a map of payers and the ledger has always been able
 * to read one — `calculateExpenseLedger` credits each payer what they paid. In
 * between, the submit handler took the first key and assigned it the whole
 * amount. So a bill where North put down 1,200 and Gina 800 was stored as
 * North paying 2,000, and the settlement that followed was wrong by 800 with
 * nothing on screen to show it.
 *
 * The earlier form answered this by allowing only one payer, reasoning that
 * two people each putting money down is two bills. It is not: a 2,000 dinner
 * where each hands over part of the cash is one receipt, one thing bought, and
 * one amount to divide. Splitting it into two records to record who paid would
 * invent a purchase that never happened.
 */

/** A member's typed amount, which may be blank, partial, or nonsense. */
export type PayerDraft = Record<string, string>;

export const parseAmount = (value: string | undefined): number => {
  const parsed = parseFloat((value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** The members with a tick against them, in the order the list shows them. */
export const selectedPayerIds = (draft: PayerDraft, memberIds: string[]): string[] =>
  memberIds.filter(id => draft[id] !== undefined);

/** What the typed amounts add up to. */
export const payersTotal = (draft: PayerDraft, memberIds: string[]): number =>
  selectedPayerIds(draft, memberIds).reduce((sum, id) => sum + parseAmount(draft[id]), 0);

/**
 * Spread the bill evenly across whoever is ticked.
 *
 * 「平均分配金額」, for the ordinary case of two people splitting the cash down
 * the middle. The last person absorbs the rounding so the parts still add up
 * to the bill — a 1,000 three ways is 333/333/334, and three 333s would leave
 * the ledger a dollar short for ever.
 */
export const spreadEvenly = (
  draft: PayerDraft,
  memberIds: string[],
  total: number,
): PayerDraft => {
  const ids = selectedPayerIds(draft, memberIds);
  if (ids.length === 0 || !Number.isFinite(total) || total <= 0) return draft;
  const each = Math.floor(total / ids.length);
  const next: PayerDraft = { ...draft };
  ids.forEach((id, index) => {
    const amount = index === ids.length - 1 ? total - each * (ids.length - 1) : each;
    next[id] = String(amount);
  });
  return next;
};

/**
 * What is wrong with this set of payers, in words, or nothing.
 *
 * Checked at a dollar, not exactly: the amounts are typed by a person reading
 * a paper receipt, and refusing 1,999.99 against 2,000 would be pedantry about
 * a rounding they did not cause.
 */
export const payerAllocationError = (
  draft: PayerDraft,
  memberIds: string[],
  total: number,
): string | undefined => {
  const ids = selectedPayerIds(draft, memberIds);
  if (ids.length === 0) return '請選擇實際付款的人。';
  if (ids.length === 1) return undefined;
  if (!Number.isFinite(total) || total <= 0) return undefined;

  const blank = ids.filter(id => parseAmount(draft[id]) <= 0);
  if (blank.length > 0) return '多人付款時，每位付款者都要填金額。';

  const sum = payersTotal(draft, memberIds);
  const gap = Math.round(sum - total);
  if (gap === 0) return undefined;
  return gap > 0
    ? `付款金額比總額多 NT$ ${gap.toLocaleString()}，請調整。`
    : `付款金額比總額少 NT$ ${Math.abs(gap).toLocaleString()}，請調整。`;
};

/**
 * The map to store, in trip currency.
 *
 * One payer carries the whole bill whatever the box says — the amount field is
 * meaningless when there is nobody to share the paying with, and honouring a
 * half-typed figure there would file a 2,000 dinner as a 1,200 one.
 */
export const payerAllocationsToSave = (
  draft: PayerDraft,
  memberIds: string[],
  total: number,
): Record<string, number> => {
  const ids = selectedPayerIds(draft, memberIds);
  if (ids.length === 0) return {};
  if (ids.length === 1) return { [ids[0]]: total };
  return Object.fromEntries(ids.map(id => [id, parseAmount(draft[id])]));
};

/**
 * The single name a record still has to carry.
 *
 * `payerId` predates the map and the whole app reads it. With several payers
 * the largest contributor is the least wrong answer: they are who a human
 * would name if asked 「who paid for this」, and the map beside it holds the
 * truth that the single field cannot.
 */
export const principalPayerId = (
  draft: PayerDraft,
  memberIds: string[],
): string | undefined => {
  const ids = selectedPayerIds(draft, memberIds);
  if (ids.length === 0) return undefined;
  if (ids.length === 1) return ids[0];
  return ids.reduce((best, id) =>
    (parseAmount(draft[id]) > parseAmount(draft[best]) ? id : best), ids[0]);
};
