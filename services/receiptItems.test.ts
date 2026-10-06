import { describe, expect, it } from 'vitest';
import { normalizeParsedExpense, parseIsThin } from './expenseIntake';
import { fromExpenseRow, toExpenseRow } from './tripSyncMapping';
import { Expense } from '../types';

/**
 * 「記帳部分新增可以讓用戶直接拍照上傳收據，幫用戶條列商品項目並翻譯用戶使用的語言」.
 *
 * His receipt: 베러미약국, 107,000 원, four lines of Korean and a −30,000 원
 * discount. The ledger kept the total and the shop, which is unreadable by the
 * time anybody needs it.
 */
const RECEIPT = {
  amount: 107000,
  currency: 'KRW',
  merchant: '베러미약국',
  items: [
    { name: '블루CPR 4개', translatedName: 'Blue CPR 4入', quantity: 1, amount: 120000 },
    { name: '큐립연고 마일드허브향 8g', translatedName: 'Q-Lip 軟膏 溫和草本 8g', quantity: 1, amount: 8000 },
    { name: '닥터리쥬몰 머드벤스드 립세럼', translatedName: 'Dr. Rejumol 泥漾唇部精華', quantity: 1, amount: 16000 },
    { name: '일반의약품 할인', translatedName: '一般醫藥品折扣', amount: -30000 },
  ],
};

describe('reading a receipt', () => {
  it('keeps every line, in printed order', () => {
    const parsed = normalizeParsedExpense(RECEIPT);

    expect(parsed?.items?.map(line => line.name)).toEqual([
      '블루CPR 4개', '큐립연고 마일드허브향 8g', '닥터리쥬몰 머드벤스드 립세럼', '일반의약품 할인',
    ]);
  });

  it('keeps the printed name beside the translation, never instead of it', () => {
    // The original is what is on the paper somebody is holding at a counter.
    const line = normalizeParsedExpense(RECEIPT)?.items?.[0];

    expect(line?.name).toBe('블루CPR 4개');
    expect(line?.translatedName).toBe('Blue CPR 4入');
  });

  it('keeps a discount as a negative line', () => {
    // −30,000 is why 120,000 + 8,000 + 16,000 is not the 107,000 charged.
    // Hiding it would make the receipt look wrong.
    expect(normalizeParsedExpense(RECEIPT)?.items?.[3].amount).toBe(-30000);
  });

  it('drops a translation that only repeats the original', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW', items: [{ name: 'CPR', translatedName: 'CPR' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('drops a line with no name at all', () => {
    // Numbers beside a blank name look like data and say nothing.
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW', items: [{ name: '  ', amount: 50 }, { name: '口紅', amount: 50 }],
    });

    expect(parsed?.items?.map(line => line.name)).toEqual(['口紅']);
  });

  it('records no lines at all for a receipt that had none', () => {
    expect(normalizeParsedExpense({ amount: 100, currency: 'KRW', items: [] })?.items).toBeUndefined();
    expect(normalizeParsedExpense({ amount: 100, currency: 'KRW' })?.items).toBeUndefined();
  });

  it('ignores anything in the list that is not a line', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW', items: ['口紅', null, 42, { name: '口紅' }],
    });

    expect(parsed?.items).toHaveLength(1);
  });

  it('keeps the shop as printed', () => {
    expect(normalizeParsedExpense(RECEIPT)?.merchant).toBe('베러미약국');
  });
});

describe('the lines travelling with the bill', () => {
  const expense = {
    id: 'e-pharmacy', description: '藥局', amount: 107000, currency: 'KRW', exchangeRate: 0.023,
    twdAmount: 2461, category: '購物', paymentMethod: '信用卡', phase: 'during', date: '2026-10-05',
    payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
    receiptItems: [{ name: '블루CPR 4개', translatedName: 'Blue CPR 4入', amount: 120000 }],
  } as unknown as Expense;

  it('survives the round trip to the shared table', () => {
    // Both travellers settle from the same bill, so what the bill was for
    // belongs on it rather than on whichever phone took the photo.
    const back = fromExpenseRow(toExpenseRow(expense, 'trip-1') as never);

    expect(back.receiptItems).toEqual(expense.receiptItems);
  });

  it('reads a row written before the column existed as having none', () => {
    const row = toExpenseRow(expense, 'trip-1') as Record<string, unknown>;
    delete row.receipt_items;

    expect(fromExpenseRow(row as never).receiptItems).toBeUndefined();
  });
});

/**
 * 「會代入但不會翻譯」 — 광안리 대교밀면 went into the title untranslated, so the
 * ledger could not be read at a glance.
 */
describe('the shop, in both languages', () => {
  it('keeps the printed name alongside the translated title', () => {
    const parsed = normalizeParsedExpense({
      amount: 22000, currency: 'KRW', description: '廣安里 大橋麥麵', merchant: '광안리 대교밀면',
    });

    expect(parsed?.description).toBe('廣安里 大橋麥麵');
    expect(parsed?.merchant).toBe('광안리 대교밀면');
  });

  it('carries the shop through the shared table', () => {
    const expense = {
      id: 'e-noodles', description: '廣安里 大橋麥麵', merchant: '광안리 대교밀면',
      amount: 22000, currency: 'KRW', exchangeRate: 0.023, twdAmount: 528,
      category: '餐飲', paymentMethod: '信用卡', phase: 'during', date: '2026-10-06',
      payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
    } as unknown as Expense;

    expect(fromExpenseRow(toExpenseRow(expense, 'trip-1') as never).merchant).toBe('광안리 대교밀면');
  });

  it('reads a bill with no shop recorded as having none', () => {
    expect(normalizeParsedExpense({ amount: 100, currency: 'KRW' })?.merchant).toBeUndefined();
  });
});

/**
 * 「這沒有翻譯跟項目解析」 — an Olive Young receipt.
 *
 * The lines came back as the department subtotals the shop prints (화장품,
 * 잡화) rather than the products, and the translation field held a paragraph
 * explaining that very fact.
 */
describe('a model explaining itself in a name field', () => {
  const essay = '化妝品類商品組合包裝/化妝品類商品總計(代稱分類，非單一品項，可能包含多項美妝商品)';

  it('drops the explanation and keeps the printed line', () => {
    // The caveat may even be true. It is still not what the field is for, and
    // a paragraph where 「護唇膏」 belongs is unreadable in a list.
    const parsed = normalizeParsedExpense({
      amount: 19900, currency: 'KRW', items: [{ name: '화장품', translatedName: essay, amount: 19900 }],
    });

    expect(parsed?.items?.[0].name).toBe('화장품');
    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('drops a name that explains itself in parentheses', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW',
      items: [{ name: '잡화', translatedName: '雜貨（這是收據上的分類小計）' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('drops a translation long enough to be a sentence, punctuation or not', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW',
      items: [{ name: '화장품', translatedName: '化妝品類商品組合包裝與總計金額依照收據直接列示' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('keeps an ordinary product name', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW',
      items: [
        { name: '큐립연고 마일드허브향 8g', translatedName: 'Q-Lip 軟膏 溫和草本 8g' },
        { name: '블루CPR', translatedName: 'Blue CPR' },
      ],
    });

    expect(parsed?.items?.map(line => line.translatedName)).toEqual(['Q-Lip 軟膏 溫和草本 8g', 'Blue CPR']);
  });
});

/**
 * 「這收據上已經有實際退稅的資訊 功能應該要識別實際退稅資訊直接帶入」.
 *
 * His Olive Young slip: GLOBAL TAXFREE 즉시환급, 판매 가격 19,000, V.A.T 1,726,
 * 즉시환급 1,000, 결제금액 18,000. The refund was already settled at the till and
 * the traveller was retyping it — or, more often, not noticing it and leaving
 * the purchase inside a refund estimate it had already been taken out of.
 */
describe('a refund the till already gave back', () => {
  const SLIP = {
    amount: 19000, currency: 'KRW', merchant: 'CJ올리브영(주) 서면역사점',
    taxRefundedAtPurchase: true, taxRefundActual: 1000, amountChargedAfterRefund: 18000,
  };

  it('records the refund and that it was settled at the till', () => {
    const parsed = normalizeParsedExpense(SLIP);

    expect(parsed?.taxRefundedAtPurchase).toBe(true);
    expect(parsed?.taxRefundActual).toBe(1000);
  });

  it('keeps the gross price as the amount, not what was charged', () => {
    // The ledger subtracts the refund from the amount wherever it asks what a
    // bill cost, so recording 18,000 here would take the 1,000 off twice.
    expect(normalizeParsedExpense(SLIP)?.amount).toBe(19000);
  });

  it('refuses a refund the receipt own numbers do not support', () => {
    // V.A.T mistaken for the refund: 19,000 − 1,726 is not 18,000, so one of
    // the three was misread and a wrong refund silently shrinks the bill.
    const parsed = normalizeParsedExpense({ ...SLIP, taxRefundActual: 1726 });

    expect(parsed?.taxRefundActual).toBeUndefined();
    expect(parsed?.taxRefundedAtPurchase).toBeUndefined();
  });

  it('accepts a slip that does not print the charged amount', () => {
    const { amountChargedAfterRefund: _unused, ...withoutCharged } = SLIP;

    expect(normalizeParsedExpense(withoutCharged)?.taxRefundActual).toBe(1000);
  });

  it('records nothing on an ordinary receipt', () => {
    expect(normalizeParsedExpense({ amount: 19000, currency: 'KRW' })?.taxRefundedAtPurchase).toBeUndefined();
  });

  it('refuses a refund larger than the purchase', () => {
    expect(normalizeParsedExpense({
      amount: 900, currency: 'KRW', taxRefundedAtPurchase: true, taxRefundActual: 1000,
    })?.taxRefundActual).toBeUndefined();
  });
});

/**
 * 「收據上如果有地址 我希望帳上可以記錄地址，因為未來有一個功能會希望用戶願意分享
 * 帳本給其他用戶參考，能有實際經驗。地址更能協助大數據分析」.
 */
describe('where the shop is', () => {
  const ADDRESS = '부산광역시 부산진구 중앙대로 737 2-02호(부전동, 서면역구내)';

  it('keeps the address as printed', () => {
    // As printed, not geocoded: the characters on the paper are the fact, and
    // a lookup can be run over them later.
    const parsed = normalizeParsedExpense({
      amount: 19000, currency: 'KRW', merchant: 'CJ올리브영(주) 서면역사점', merchantAddress: ADDRESS,
    });

    expect(parsed?.merchantAddress).toBe(ADDRESS);
  });

  it('records none when the receipt printed none', () => {
    // Never inferred from the shop's name.
    expect(normalizeParsedExpense({ amount: 19000, currency: 'KRW', merchant: 'OLIVE YOUNG' })?.merchantAddress)
      .toBeUndefined();
  });

  it('travels with the bill to the shared table', () => {
    const expense = {
      id: 'e-oy', description: 'OLIVE YOUNG 購物', merchant: 'CJ올리브영(주) 서면역사점',
      merchantAddress: ADDRESS, amount: 19000, currency: 'KRW', exchangeRate: 0.023, twdAmount: 437,
      category: '美妝保養', paymentMethod: '信用卡', phase: 'during', date: '2026-10-06',
      payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
    } as unknown as Expense;

    expect(fromExpenseRow(toExpenseRow(expense, 'trip-1') as never).merchantAddress).toBe(ADDRESS);
  });
});

/**
 * 「把地址解析成座標 + 商家 Place ID … 好啊」.
 */
describe('the shop as a place', () => {
  const expense = {
    id: 'e-oy2', description: 'OLIVE YOUNG 購物', merchant: 'CJ올리브영(주) 서면역사점',
    merchantAddress: '부산광역시 부산진구 중앙대로 737', merchantPlaceId: 'g-oliveyoung-seomyeon',
    merchantLatitude: 35.1578, merchantLongitude: 129.0594,
    amount: 19000, currency: 'KRW', exchangeRate: 0.023, twdAmount: 437,
    category: '美妝保養', paymentMethod: '信用卡', phase: 'during', date: '2026-10-06',
    payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
  } as unknown as Expense;

  it('travels with the bill, id and coordinates together', () => {
    const back = fromExpenseRow(toExpenseRow(expense, 'trip-1') as never);

    expect(back.merchantPlaceId).toBe('g-oliveyoung-seomyeon');
    expect(back.merchantLatitude).toBe(35.1578);
    expect(back.merchantLongitude).toBe(129.0594);
  });

  it('reads a bill nobody could pin down as having no place', () => {
    // Absent is the honest record for a shop the lookup could not confirm.
    const { merchantPlaceId: _id, merchantLatitude: _lat, merchantLongitude: _lng, ...unpinned } = expense;

    const back = fromExpenseRow(toExpenseRow(unpinned as Expense, 'trip-1') as never);

    expect(back.merchantPlaceId).toBeUndefined();
    expect(back.merchantLatitude).toBeUndefined();
  });
});

/**
 * 「這筆有確定的退稅金額在收據中 沒有直接在帳上扣除」.
 *
 * His Olive Young till receipt: six lines adding to 40,500, 판매 계 40,500,
 * 텍스리펀드 2,000, 결제금액 38,500 — and the live parse came back with a total
 * of 42,500, a plain misreading of the one figure the whole record rests on.
 */
describe('a total the rest of the receipt disagrees with', () => {
  const lines = [
    { name: '닥터 포켓몬 콤부차 포도', amount: 5000 },
    { name: '닥터 포켓몬 콤부차 납작복숭', amount: 5000 },
    { name: '닥터 포켓몬 콤부차 레몬', amount: 5000 },
    { name: '테트라스 망고씨드버터 퍼퓸', amount: 8900 },
    { name: '케이트리스 커버업 블레미쉬', amount: 4900 },
    { name: '라운드랩 1025 독도 클렌저', amount: 11700 },
  ];
  const TILL = {
    currency: 'KRW', items: lines,
    taxRefundedAtPurchase: true, taxRefundActual: 2000, amountChargedAfterRefund: 38500,
  };

  it('corrects the total when the lines and the charged amount both say otherwise', () => {
    // 38,500 + 2,000 = 40,500, and the six lines add to 40,500. Two
    // independent figures agreeing against one is not a tie.
    expect(normalizeParsedExpense({ ...TILL, amount: 42500 })?.amount).toBe(40500);
  });

  it('records the refund against the corrected total', () => {
    const parsed = normalizeParsedExpense({ ...TILL, amount: 42500 });

    expect(parsed?.taxRefundActual).toBe(2000);
    expect(parsed?.taxRefundedAtPurchase).toBe(true);
  });

  it('leaves a total alone when only one witness is present', () => {
    // One of them could just as easily be the misread, and rewriting an amount
    // on that would be the app inventing what somebody spent.
    const noItems = normalizeParsedExpense({ ...TILL, items: [], amount: 42500 });
    const noCharged = normalizeParsedExpense({
      ...TILL, amountChargedAfterRefund: undefined, amount: 42500,
    });

    expect(noItems?.amount).toBe(42500);
    expect(noCharged?.amount).toBe(42500);
  });

  it('leaves a total alone when the witnesses disagree with each other', () => {
    const mismatched = normalizeParsedExpense({
      ...TILL, items: [{ name: 'x', amount: 1000 }], amount: 42500,
    });

    expect(mismatched?.amount).toBe(42500);
  });

  it('changes nothing on a receipt that already adds up', () => {
    expect(normalizeParsedExpense({ ...TILL, amount: 40500 })?.amount).toBe(40500);
  });
});

/**
 * 「目前又突然沒有翻譯明細了」.
 *
 * My own fix for the previous round did this: a flat twenty-character limit on
 * a translation, measured against two short examples, which then ate half the
 * lines on a till receipt. Brand plus flavour plus size plus promotion is
 * simply how these products are named.
 */
describe('a long product name is still a name', () => {
  const longLine = {
    name: '닥터 포켓몬 콤부차 포도 10+3 매기행사',
    translatedName: 'Dr. 寶可夢 康普茶 葡萄 10+3 特價活動',
    amount: 5000,
  };

  it('keeps a translation that is as long as what it translates', () => {
    const parsed = normalizeParsedExpense({ amount: 5000, currency: 'KRW', items: [longLine] });

    expect(parsed?.items?.[0].translatedName).toBe('Dr. 寶可夢 康普茶 葡萄 10+3 特價活動');
  });

  it('still drops a paragraph that replaced a three-character line', () => {
    // 「화장품」 is three characters; the explanation was forty-four. Proportion
    // tells the two cases apart where a flat limit could not.
    const parsed = normalizeParsedExpense({
      amount: 19900, currency: 'KRW',
      items: [{ name: '화장품', translatedName: '化妝品類商品組合包裝與總計金額依照收據直接列示其數量' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('keeps every line of a real till receipt translated', () => {
    const parsed = normalizeParsedExpense({
      amount: 40500, currency: 'KRW',
      items: [
        longLine,
        { name: '테트라스 망고씨드버터 퍼퓸 매기행사', translatedName: 'Tetras 芒果種子奶油香水', amount: 8900 },
        { name: '라운드랩 1025 독도 클렌저 15 매기행사', translatedName: 'Round Lab 1025 獨島洗面乳', amount: 11700 },
      ],
    });

    expect(parsed?.items?.every(line => Boolean(line.translatedName))).toBe(true);
  });
});

/**
 * 「又沒有翻譯了」, traced to the record it produced: 「未命名消費 54,500」, zero
 * lines, zero translations.
 *
 * `未命名消費` is the fallback the form writes when no name came back at all,
 * so that answer carried a number and nothing else — the schema requires only
 * an amount and a currency, and the weaker models in the fallback list meet
 * exactly that bar.
 */
describe('an answer that is only a number', () => {
  it('is recognised as worth asking another model about', () => {
    expect(parseIsThin(normalizeParsedExpense({ amount: 54500, currency: 'KRW' }))).toBe(true);
  });

  it('is not rejected on its own — a card slip really can be just a number', () => {
    // Recognising it as thin only means 「ask the next model first」; the last
    // model's answer is recorded whatever it says.
    expect(normalizeParsedExpense({ amount: 54500, currency: 'KRW' })?.amount).toBe(54500);
  });

  it('counts a receipt with a name, a shop, or lines as a real answer', () => {
    expect(parseIsThin(normalizeParsedExpense({ amount: 1, currency: 'KRW', description: '咖啡' }))).toBe(false);
    expect(parseIsThin(normalizeParsedExpense({ amount: 1, currency: 'KRW', merchant: '올리브영' }))).toBe(false);
    expect(parseIsThin(normalizeParsedExpense({
      amount: 1, currency: 'KRW', items: [{ name: '화장품' }],
    }))).toBe(false);
  });

  it('counts a failed parse as thin', () => {
    expect(parseIsThin(null)).toBe(true);
  });
});

/**
 * 「這筆」 — the Olive Young receipt that carries a shop discount as well as a
 * refund, which is why its refund was being thrown away.
 *
 * 판매 계 54,500, OY할인 1,000, 텍스리펀드 3,000, 승인금액 50,500. The two-term
 * identity the check was built on — total − refund = charged — cannot hold on
 * a receipt with a discount in the middle of it.
 */
describe('a receipt with a discount as well as a refund', () => {
  const lines = [
    { name: '(부산 전용) 라운드어라운드', amount: 5900 },
    { name: '빌리밀리 톤어쓰는 머프미니밈', amount: 7900 },
    { name: '1,000원 할인쿠폰', amount: -1000 },
    { name: '카그린 후레쉬브레스 민트 15ml', amount: 15800 },
    { name: '빌리밀리 히팅부러 충전타입', amount: 24900 },
  ];

  it('keeps the refund when the amount is the one after discounts', () => {
    // 53,500 − 3,000 = 50,500, which is what the card was charged.
    const parsed = normalizeParsedExpense({
      amount: 53500, currency: 'KRW', items: lines,
      taxRefundedAtPurchase: true, taxRefundActual: 3000, amountChargedAfterRefund: 50500,
    });

    expect(parsed?.amount).toBe(53500);
    expect(parsed?.taxRefundActual).toBe(3000);
  });

  it('corrects a total read before the discount, since the lines include it', () => {
    // The lines add to 53,500 with the coupon in them, and so does charged
    // plus refund. 54,500 is the goods before the coupon, which is not what
    // this bill cost.
    const parsed = normalizeParsedExpense({
      amount: 54500, currency: 'KRW', items: lines,
      taxRefundedAtPurchase: true, taxRefundActual: 3000, amountChargedAfterRefund: 50500,
    });

    expect(parsed?.amount).toBe(53500);
    expect(parsed?.taxRefundActual).toBe(3000);
  });

  it('still refuses a refund the numbers do not support', () => {
    const parsed = normalizeParsedExpense({
      amount: 53500, currency: 'KRW', items: lines,
      taxRefundedAtPurchase: true, taxRefundActual: 4863, amountChargedAfterRefund: 50500,
    });

    expect(parsed?.taxRefundActual).toBeUndefined();
  });
});
