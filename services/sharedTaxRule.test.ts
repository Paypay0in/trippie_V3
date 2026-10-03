/**
 * 「Gina的介面無法看到退稅資訊」.
 *
 * The research lived on one phone's trip draft, which does not sync, so
 * whoever happened to run it was the only person with a working refund card.
 * She stood in the same shop reading 「目前無法安全估算退稅金額」.
 *
 * Only the tax rule is shared. Entry rules depend on whose passport it is —
 * the research carries a passport country and a residence status, which are
 * facts about one traveller and nobody else's business.
 */
import { describe, expect, it } from 'vitest';
import { mergeSharedTaxRule, toSharedTaxRule } from './sharedTaxRule';
import { TravelRules } from '../types';

const researched = {
  destination: '釜山',
  passportCountryCode: 'TWN',
  context: { passportCountryCode: 'TWN', residenceCountryCode: 'TWN', residenceStatus: 'known', destination: '釜山' },
  entry: { guidance: '持中華民國護照可免簽入境', summary: '免簽 90 天' },
  taxRefund: {
    numericCalculationAvailable: true,
    numericRuleSource: 'model_knowledge',
    fetchedAt: '2026-10-02T00:00:00.000Z',
    numericRule: { currency: 'KRW', minSpend: 15000, thresholdScope: 'per_transaction', refundMethod: { type: 'rate', rate: 0.06 } },
  },
} as unknown as TravelRules;

describe('要分享出去的那一部分', () => {
  it('帶著退稅規則', () => {
    const shared = toSharedTaxRule(researched);

    expect(shared?.rule.numericRule?.minSpend).toBe(15000);
    expect(shared?.ruleSource).toBe('model_knowledge');
    expect(shared?.destination).toBe('釜山');
  });

  it('不帶護照國籍、居留身分或入境規定——那是某一個人的事', () => {
    const serialised = JSON.stringify(toSharedTaxRule(researched));

    expect(serialised).not.toContain('TWN');
    expect(serialised).not.toContain('passportCountryCode');
    expect(serialised).not.toContain('免簽');
  });

  it('還沒研究出數字規則時不分享任何東西', () => {
    expect(toSharedTaxRule({ taxRefund: { guidance: '查詢中' } } as TravelRules)).toBeUndefined();
    expect(toSharedTaxRule(undefined)).toBeUndefined();
  });
});

describe('收到別人分享的規則', () => {
  const shared = toSharedTaxRule(researched);

  it('自己沒有研究過時就採用——這就是她那台的情況', () => {
    const merged = mergeSharedTaxRule(undefined, shared, '釜山');

    expect(merged?.taxRefund?.numericRule?.minSpend).toBe(15000);
  });

  it('自己已經研究過就用自己的，不被對方覆蓋', () => {
    const own = {
      taxRefund: {
        numericCalculationAvailable: true,
        numericRule: { currency: 'KRW', minSpend: 30000, thresholdScope: 'per_transaction', refundMethod: { type: 'rate', rate: 0.08 } },
      },
    } as unknown as TravelRules;

    expect(mergeSharedTaxRule(own, shared, '釜山')?.taxRefund?.numericRule?.minSpend).toBe(30000);
  });

  it('不會把自己的入境規定洗掉', () => {
    const own = { entry: { guidance: '我自己查到的入境說明' } } as TravelRules;

    expect(mergeSharedTaxRule(own, shared, '釜山')?.entry?.guidance).toBe('我自己查到的入境說明');
  });

  it('目的地不一樣就不採用——寧可沒有，也不要引用別國的門檻', () => {
    expect(mergeSharedTaxRule(undefined, shared, '東京')?.taxRefund).toBeUndefined();
  });

  it('沒有收到東西時維持原狀', () => {
    const own = { entry: { guidance: '原本的' } } as TravelRules;

    expect(mergeSharedTaxRule(own, undefined, '釜山')).toBe(own);
  });
});
