/**
 * What a thing on a shopping list could actually cost.
 *
 * A last line rather than a judgement about products: 「青春露 ¥98,200」 came
 * off a duty-free brand index and 「蒸氣眼罩 ¥13」 came off a page whose own
 * writing was read too eagerly. Neither is a price, and neither can be told
 * apart from one by anything upstream — a number with a currency mark beside
 * a price label is exactly what a price looks like.
 *
 * One module because the rule had been living in the snippet reader alone,
 * and the day the page reader was written it quoted ¥13. A rule with two
 * homes is a rule with two answers; a rule with one home and two callers is
 * the same rule twice.
 *
 * Deliberately wide. This is not 「is this a good price」 — that is the
 * traveller's judgement and nothing here should pre-empt it. It is only 「is
 * this a price at all」.
 */
export const PLAUSIBLE: Record<string, { min: number; max: number }> = {
  TWD: { min: 10, max: 100_000 },
  JPY: { min: 50, max: 500_000 },
  KRW: { min: 500, max: 5_000_000 },
  HKD: { min: 5, max: 50_000 },
  USD: { min: 1, max: 10_000 },
};

/** Whether a figure could be what something on a shopping list costs. */
export const plausiblePrice = (amount: number, currency: string): boolean => {
  const bounds = PLAUSIBLE[currency];
  if (!bounds) return true;
  return amount >= bounds.min && amount <= bounds.max;
};
