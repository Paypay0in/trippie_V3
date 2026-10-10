import { describe, expect, it } from 'vitest';
import { rateFromDatedFxResponse } from './expenseIntake';

/**
 * 「10/3的 有辦法讓匯率 就用10/3的嗎」.
 *
 * 18,000 KRW spent on 2026-10-03 was converted at whatever rate the day the
 * ledger happened to be opened, so the same purchase was worth 408, then 427,
 * then 432 TWD. What was paid is a fact about one date.
 */
describe('一天的匯率表', () => {
  const day = { date: '2026-10-03', krw: { twd: 0.023694, usd: 0.00071 } };

  it('讀出該幣別對台幣的匯率', () => {
    expect(rateFromDatedFxResponse(day, 'KRW', 'TWD')).toBeCloseTo(0.023694);
  });

  it('幣別代碼大小寫都認得', () => {
    expect(rateFromDatedFxResponse(day, 'krw', 'twd')).toBeCloseTo(0.023694);
  });

  it('表上沒有的幣別回 null，不亂猜', () => {
    expect(rateFromDatedFxResponse(day, 'KRW', 'JPY')).toBeNull();
    expect(rateFromDatedFxResponse(day, 'EUR', 'TWD')).toBeNull();
  });

  it('不是數字、零或離譜的值都不採用', () => {
    expect(rateFromDatedFxResponse({ krw: { twd: '0.02' } }, 'KRW', 'TWD')).toBeNull();
    expect(rateFromDatedFxResponse({ krw: { twd: 0 } }, 'KRW', 'TWD')).toBeNull();
    expect(rateFromDatedFxResponse({ krw: { twd: 1e9 } }, 'KRW', 'TWD')).toBeNull();
  });

  it('整包壞掉也不會丟例外', () => {
    expect(rateFromDatedFxResponse(null, 'KRW', 'TWD')).toBeNull();
    expect(rateFromDatedFxResponse('nope', 'KRW', 'TWD')).toBeNull();
    expect(rateFromDatedFxResponse({}, 'KRW', 'TWD')).toBeNull();
  });
});
