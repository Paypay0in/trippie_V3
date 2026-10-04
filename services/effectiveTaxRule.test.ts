import { describe, expect, it } from 'vitest';
import { effectiveTaxRule } from './effectiveTaxRule';
import { TaxRule, TravelRules } from '../types';

/**
 * 「怎麼都沒跳出可退稅的提示」.
 *
 * A 30,800 KRW purchase is twice Korea's 15,000 threshold and the refund card
 * had been estimating it all day, while the expense form stayed silent — they
 * were reading different fields. `taxRule` is filled in by picking a country;
 * `travelRules.taxRefund.numericRule` is what the grounded research writes, and
 * a trip that was researched has the second and not the first.
 */

const researched = (over: Record<string, unknown> = {}): TravelRules => ({
  destination: '韓國',
  taxRefund: {
    numericCalculationAvailable: true,
    numericRuleSource: 'grounded',
    summary: '單筆滿 15,000 KRW 可退稅，概估可退約 6%',
    numericRule: {
      currency: 'KRW',
      minSpend: 15000,
      thresholdScope: 'per_transaction',
      refundMethod: { type: 'rate', rate: 0.06 },
    },
    ...over,
  },
} as unknown as TravelRules);

const picked: TaxRule = { country: '日本', currency: 'JPY', minSpend: 5000, refundRate: 0.08, notes: '舊規則' };

describe('effectiveTaxRule', () => {
  it('uses the researched rule when there is one', () => {
    expect(effectiveTaxRule(null, researched())).toMatchObject({
      currency: 'KRW',
      minSpend: 15000,
      refundRate: 0.06,
    });
  });

  it('prefers the research over a stale country pick', () => {
    // Both exist on a trip whose country was picked and then researched; the
    // research is the one every refund screen is already reading.
    expect(effectiveTaxRule(picked, researched())).toMatchObject({ currency: 'KRW', minSpend: 15000 });
  });

  it('keeps the country pick when nothing was researched', () => {
    expect(effectiveTaxRule(picked, undefined)).toBe(picked);
    expect(effectiveTaxRule(picked, {} as TravelRules)).toBe(picked);
  });

  it('carries the research’s own wording, so an estimate still reads as one', () => {
    expect(effectiveTaxRule(null, researched()).notes).toContain('概估');
  });

  it('refuses a rule the research said is not calculable', () => {
    // 「可退多少說不出來」 is not a rate, and inventing one puts a number on a
    // card somebody plans a queue around.
    const notCalculable = researched({
      numericRule: { currency: 'KRW', minSpend: 15000, thresholdScope: 'per_transaction', refundMethod: { type: 'not_calculable' } },
    });

    expect(effectiveTaxRule(null, notCalculable)).toBeNull();
    expect(effectiveTaxRule(picked, notCalculable)).toBe(picked);
  });

  it('refuses a rule the research has not confirmed', () => {
    expect(effectiveTaxRule(null, researched({ numericCalculationAvailable: false }))).toBeNull();
  });

  it('is null when there is nothing at all', () => {
    expect(effectiveTaxRule(null, undefined)).toBeNull();
  });

  it('falls back to the trip’s destination for the label', () => {
    const noDestination = { taxRefund: researched().taxRefund } as TravelRules;
    expect(effectiveTaxRule(null, noDestination, '釜山')?.country).toBe('釜山');
  });
});
