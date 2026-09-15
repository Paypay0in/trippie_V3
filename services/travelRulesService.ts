import { EntryActionType, TaxRefundNumericRule, TravelRules } from '../types';

const ACTION_TYPES: EntryActionType[] = ['visa_or_eta', 'passport_validity', 'health_declaration', 'customs_declaration', 'arrival_form', 'required_documents', 'onward_travel', 'other'];

const normalizeNumericRule = (value: unknown): TaxRefundNumericRule | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const rule = value as Record<string, unknown>;
  if (typeof rule.currency !== 'string' || !rule.currency.trim()) return undefined;
  if (typeof rule.minSpend !== 'number' || !Number.isFinite(rule.minSpend) || rule.minSpend < 0) return undefined;
  if (!['per_transaction', 'per_receipt', 'same_day_same_merchant', 'same_merchant', 'unknown'].includes(rule.thresholdScope as string)) return undefined;
  if (!rule.refundMethod || typeof rule.refundMethod !== 'object' || !['rate', 'not_calculable'].includes((rule.refundMethod as Record<string, unknown>).type as string)) return undefined;
  const method = rule.refundMethod as Record<string, unknown>;
  if (method.type === 'rate' && (typeof method.rate !== 'number' || !Number.isFinite(method.rate) || method.rate <= 0 || method.rate >= 1)) return undefined;
  const normalized: TaxRefundNumericRule = { currency: rule.currency.trim().toUpperCase(), minSpend: rule.minSpend, thresholdScope: rule.thresholdScope as TaxRefundNumericRule['thresholdScope'], refundMethod: method.type === 'rate' ? { type: 'rate', rate: method.rate as number } : { type: 'not_calculable' } };
  for (const field of ['eligibleCategories', 'excludedCategories'] as const) {
    if (rule[field] !== undefined) {
      if (!Array.isArray(rule[field]) || !rule[field].every((item: unknown) => typeof item === 'string')) return undefined;
      normalized[field] = (rule[field] as string[]).map(item => item.trim()).filter(Boolean);
    }
  }
  return normalized;
};

const normalizeTravelRulesResponse = (value: TravelRules): TravelRules => {
  const entry = value.entry;
  if (!entry?.actionableItems) {
  const taxRefund = value.taxRefund ? { ...value.taxRefund, numericRule: normalizeNumericRule(value.taxRefund.numericRule), numericRuleSource: value.taxRefund.numericRuleSource === 'grounded' || value.taxRefund.numericRuleSource === 'model_knowledge' ? value.taxRefund.numericRuleSource : undefined } : undefined;
    return { ...value, taxRefund };
  }
  const seen = new Set<EntryActionType>();
  const actionableItems = entry.actionableItems.filter(item => {
    const actionType = ACTION_TYPES.includes(item.actionType) ? item.actionType : 'other';
    if (actionType === 'other') return true;
    if (seen.has(actionType)) return false;
    seen.add(actionType);
    return true;
  }).map(item => ({ ...item, actionType: ACTION_TYPES.includes(item.actionType) ? item.actionType : 'other' }));
  const taxRefund = value.taxRefund ? { ...value.taxRefund, numericRule: normalizeNumericRule(value.taxRefund.numericRule), numericRuleSource: value.taxRefund.numericRuleSource === 'grounded' || value.taxRefund.numericRuleSource === 'model_knowledge' ? value.taxRefund.numericRuleSource : undefined } : value.taxRefund;
  const numericRule = taxRefund?.numericRule;
  return { ...value, taxRefund: taxRefund ? { ...taxRefund, numericCalculationAvailable: taxRefund.numericCalculationAvailable === true && Boolean(numericRule && numericRule.thresholdScope === 'per_transaction' && numericRule.refundMethod.type === 'rate') } : undefined, entry: { ...entry, actionableItems } };
};

export class TravelRulesRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TravelRulesRequestError';
    this.status = status;
  }
}

export const researchTravelRules = async (input: {
  tripId?: string;
  destination: string;
  passportCountryCode?: string;
  residenceCountryCode?: string;
  startDate?: string;
  endDate?: string;
}): Promise<TravelRules> => {
  const response = await fetch('/api/travel-rules/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as { travelRules?: TravelRules; error?: string } | null;
  if (!response.ok || !payload?.travelRules) {
    throw new TravelRulesRequestError(payload?.error || 'Travel rules research failed.', response.status);
  }
  return normalizeTravelRulesResponse(payload.travelRules);
};
