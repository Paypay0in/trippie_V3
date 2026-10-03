import { TravelRules } from '../types';

/**
 * The part of the travel research both travellers may see.
 *
 * 「Gina的介面無法看到退稅資訊」. The research lived on one phone's trip draft, so
 * whoever happened to run it was the only person with a refund estimate — the
 * other stood in the same shop reading 「目前無法安全估算退稅金額」.
 *
 * Only the tax rule is shared, and the split is not arbitrary. Entry rules
 * depend on whose passport it is: the research carries a `passportCountryCode`
 * and a residence status, which are facts about one traveller. A refund
 * threshold and rate are facts about Korea. One of those belongs on a shared
 * trip row and the other does not.
 */

export interface SharedTaxRule {
  rule: NonNullable<TravelRules['taxRefund']>;
  ruleSource?: string;
  destination?: string;
  fetchedAt?: string;
}

/** Anything the card needs to compute an estimate, and nothing personal. */
export const toSharedTaxRule = (rules?: TravelRules | null): SharedTaxRule | undefined => {
  const taxRefund = rules?.taxRefund;
  if (!taxRefund || !taxRefund.numericRule) return undefined;
  return {
    rule: taxRefund,
    ruleSource: taxRefund.numericRuleSource,
    destination: rules?.destination || rules?.context?.destination,
    fetchedAt: taxRefund.fetchedAt,
  };
};

/**
 * Folds a shared rule into whatever this device already knows.
 *
 * The local research wins when there is one: it was run for this traveller, and
 * a companion's copy cannot be newer than the research this device just did.
 * What this fills is the empty case — the phone that never ran it.
 *
 * A rule researched for another destination is ignored rather than shown. A
 * trip that changed country would otherwise keep quoting the old threshold,
 * which is worse than quoting none.
 */
export const mergeSharedTaxRule = (
  local: TravelRules | undefined,
  shared: SharedTaxRule | undefined,
  destination?: string,
): TravelRules | undefined => {
  if (!shared?.rule?.numericRule) return local;
  if (local?.taxRefund?.numericRule) return local;

  const wantedFor = (destination || '').trim().toLocaleLowerCase();
  const researchedFor = (shared.destination || '').trim().toLocaleLowerCase();
  if (wantedFor && researchedFor && wantedFor !== researchedFor) return local;

  return {
    ...(local || {}),
    taxRefund: shared.rule,
  };
};
