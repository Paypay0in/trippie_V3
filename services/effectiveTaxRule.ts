import { TaxRule, TravelRules } from '../types';

/**
 * The refund rule the expense form should be using.
 *
 * 「怎麼都沒跳出可退稅的提示」. A 30,800 KRW purchase is well over Korea's 15,000
 * threshold and the refund card had been estimating it all day — but the form
 * stayed silent, because the two read different fields.
 *
 * `taxRule` is the old shape, filled in by picking a country from the trip
 * setup. `travelRules.taxRefund.numericRule` is what the grounded research
 * writes, and it is what every refund screen built since then reads. A trip
 * researched rather than picked therefore has the second and not the first, and
 * the form was the one place still asking the first.
 *
 * One fact, two places to find it, is how two screens come to disagree. This
 * resolves to whichever exists, preferring the one the traveller's own research
 * produced.
 */
export const effectiveTaxRule = (
  taxRule?: TaxRule | null,
  travelRules?: TravelRules | null,
  destination?: string,
): TaxRule | null => {
  const refund = travelRules?.taxRefund;
  const numeric = refund?.numericRule;

  if (
    refund?.numericCalculationAvailable === true
    && numeric
    && numeric.refundMethod?.type === 'rate'
    && Number.isFinite(numeric.refundMethod.rate)
    && numeric.refundMethod.rate > 0
    && Number.isFinite(numeric.minSpend)
    && typeof numeric.currency === 'string'
    && numeric.currency.trim()
  ) {
    return {
      // The country is only a label here; the trip's own destination is the
      // honest one, and the researched rule does not carry a country name.
      country: travelRules?.destination || destination || taxRule?.country || '',
      currency: numeric.currency.trim().toUpperCase(),
      minSpend: numeric.minSpend,
      refundRate: numeric.refundMethod.rate,
      /*
        The research's own wording, where it has any.

        An estimate presented without the sentence that says it is an estimate
        reads as a promise, and this one is shown beside a number somebody is
        deciding whether to queue for.
      */
      notes: refund.summary || refund.guidance || taxRule?.notes || '',
    };
  }

  // Nothing researched: whatever the country picker left behind still stands.
  return taxRule ?? null;
};
