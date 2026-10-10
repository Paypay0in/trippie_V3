import { describe, expect, it } from 'vitest';
import {
  payerAllocationError,
  payerAllocationsToSave,
  payersTotal,
  principalPayerId,
  selectedPayerIds,
  spreadEvenly,
} from './payerAllocations';

/**
 * 「付款者（可多人）· 選擇實際付款的人與金額」.
 *
 * A 2,000 dinner where North hands over 1,200 and Gina 800 is one receipt, not
 * two bills. The form kept both figures and the ledger could read both; the
 * submit handler in between took the first name and gave it everything.
 */
const MEMBERS = ['me', 'seat-gina', 'seat-brian'];

describe('選了誰付款', () => {
  it('打了勾的才算，沒填金額也算選了', () => {
    expect(selectedPayerIds({ me: '1200', 'seat-gina': '' }, MEMBERS))
      .toEqual(['me', 'seat-gina']);
  });

  it('不在成員名單上的不算', () => {
    expect(selectedPayerIds({ me: '1200', ghost: '500' }, MEMBERS)).toEqual(['me']);
  });

  it('順序跟著名單走，不是跟著打字順序', () => {
    expect(selectedPayerIds({ 'seat-gina': '800', me: '1200' }, MEMBERS))
      .toEqual(['me', 'seat-gina']);
  });
});

describe('加起來是多少', () => {
  it('把填的金額加總', () => {
    expect(payersTotal({ me: '1200', 'seat-gina': '800' }, MEMBERS)).toBe(2000);
  });

  it('空白的算 0，不是 NaN', () => {
    expect(payersTotal({ me: '1200', 'seat-gina': '' }, MEMBERS)).toBe(1200);
  });

  it('亂打的字算 0', () => {
    expect(payersTotal({ me: '1200', 'seat-gina': 'abc' }, MEMBERS)).toBe(1200);
  });

  it('負數算 0 —— 沒有人付了負的錢', () => {
    expect(payersTotal({ me: '1200', 'seat-gina': '-500' }, MEMBERS)).toBe(1200);
  });
});

describe('平均分配金額', () => {
  it('兩個人對半', () => {
    const next = spreadEvenly({ me: '', 'seat-gina': '' }, MEMBERS, 2000);
    expect(next).toMatchObject({ me: '1000', 'seat-gina': '1000' });
  });

  it('除不盡的時候，最後一個人吸收零頭 —— 加起來還是整數', () => {
    const next = spreadEvenly({ me: '', 'seat-gina': '', 'seat-brian': '' }, MEMBERS, 1000);
    expect(payersTotal(next, MEMBERS)).toBe(1000);
    expect(next['seat-brian']).toBe('334');
  });

  it('沒選人就不動它', () => {
    expect(spreadEvenly({}, MEMBERS, 2000)).toEqual({});
  });

  it('沒有總額就不亂填', () => {
    const draft = { me: '', 'seat-gina': '' };
    expect(spreadEvenly(draft, MEMBERS, 0)).toEqual(draft);
  });
});

describe('什麼情況下不給存', () => {
  it('一個人都沒選', () => {
    expect(payerAllocationError({}, MEMBERS, 2000)).toContain('請選擇實際付款的人');
  });

  it('只有一個付款者，金額框寫什麼都不管', () => {
    expect(payerAllocationError({ me: '' }, MEMBERS, 2000)).toBeUndefined();
  });

  it('多人付款但有人沒填', () => {
    expect(payerAllocationError({ me: '1200', 'seat-gina': '' }, MEMBERS, 2000))
      .toContain('每位付款者都要填金額');
  });

  it('加起來比總額多', () => {
    expect(payerAllocationError({ me: '1500', 'seat-gina': '800' }, MEMBERS, 2000))
      .toContain('多 NT$ 300');
  });

  it('加起來比總額少', () => {
    expect(payerAllocationError({ me: '1000', 'seat-gina': '800' }, MEMBERS, 2000))
      .toContain('少 NT$ 200');
  });

  it('剛好對上就放行', () => {
    expect(payerAllocationError({ me: '1200', 'seat-gina': '800' }, MEMBERS, 2000))
      .toBeUndefined();
  });

  it('差一塊以內不刁難 —— 那是收據的進位，不是使用者的錯', () => {
    expect(payerAllocationError({ me: '1200.4', 'seat-gina': '800' }, MEMBERS, 2000))
      .toBeUndefined();
  });
});

describe('存下去的樣子', () => {
  it('多人付款照實存', () => {
    expect(payerAllocationsToSave({ me: '1200', 'seat-gina': '800' }, MEMBERS, 2000))
      .toEqual({ me: 1200, 'seat-gina': 800 });
  });

  /**
   * The amount box is meaningless with nobody to share the paying with, and a
   * half-typed figure there would file a 2,000 dinner as a 1,200 one.
   */
  it('單一付款者扛全額，不管框裡剩下什麼', () => {
    expect(payerAllocationsToSave({ me: '1200' }, MEMBERS, 2000)).toEqual({ me: 2000 });
  });

  it('沒選人就是空的', () => {
    expect(payerAllocationsToSave({}, MEMBERS, 2000)).toEqual({});
  });
});

describe('payerId 這個單一欄位要寫誰', () => {
  it('只有一個人的時候就是他', () => {
    expect(principalPayerId({ me: '2000' }, MEMBERS)).toBe('me');
  });

  it('多人的時候寫出錢最多的那個', () => {
    expect(principalPayerId({ me: '1200', 'seat-gina': '800' }, MEMBERS)).toBe('me');
    expect(principalPayerId({ me: '800', 'seat-gina': '1200' }, MEMBERS)).toBe('seat-gina');
  });

  it('沒人付款就沒有答案', () => {
    expect(principalPayerId({}, MEMBERS)).toBeUndefined();
  });
});
