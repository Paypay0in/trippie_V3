/**
 * 「對方的帳又算到我這裡了」.
 *
 * The third time this has been reported, about a third screen. 旅行中支出總計
 * added up every expense in full — so Gina's own spending landed in his total,
 * and a bill they split down the middle was counted whole on both phones.
 *
 * The rule lives here now rather than being re-derived per screen, which is
 * how the Dashboard ended up as the one place that never got it.
 */
import { describe, expect, it } from 'vitest';
import { expenseCostToViewer, expenseNetAmount, ownerMemberIdOf, refundReceivedInTwd } from './viewerSpend';
import { Category, Expense, TripMember } from '../types';

const ME = 'trip:owner';
const GINA = 'seat-gina';

const members: TripMember[] = [
  { id: ME, name: 'Ann', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
];

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.OTHER, phase: 'during', date: '2026-10-02',
  payerId: ME, beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

describe('一筆帳對讀這個畫面的人而言花了多少', () => {
  it('對方自己的帳，對我是零', () => {
    const hers = bill({ amount: 888, twdAmount: 888, payerId: GINA, beneficiaries: [GINA] });

    expect(expenseCostToViewer(hers, ME, ME)).toBe(0);
  });

  it('分一半的帳只算一半', () => {
    const shared = bill({ amount: 12000, twdAmount: 12000, payerId: ME, beneficiaries: [ME, GINA] });

    expect(expenseCostToViewer(shared, ME, ME)).toBe(6000);
  });

  it('我自己付、沒有分攤者的帳，整筆算我的', () => {
    const mine = bill({ amount: 150, twdAmount: 150, payerId: ME, beneficiaries: [] });

    expect(expenseCostToViewer(mine, ME, ME)).toBe(150);
  });

  it('對方付、沒有分攤者的帳，對我還是零', () => {
    const hers = bill({ amount: 150, twdAmount: 150, payerId: GINA, beneficiaries: [] });

    expect(expenseCostToViewer(hers, ME, ME)).toBe(0);
  });

  it('她付錢但分我一半時，我這邊算一半', () => {
    const hers = bill({ amount: 726, twdAmount: 726, payerId: GINA, beneficiaries: [GINA, ME] });

    expect(expenseCostToViewer(hers, ME, ME)).toBe(363);
  });

  it('不知道讀的人是誰時，回報全額——單人帳本沒有要分給誰', () => {
    const shared = bill({ amount: 12000, twdAmount: 12000, payerId: ME, beneficiaries: [ME, GINA] });

    expect(expenseCostToViewer(shared, undefined, ME)).toBe(12000);
  });

  /*
    Not a formality: a non-finite amount sent the split calculator into a loop
    that pinned a core until the tab was killed, which is how this was found —
    the test itself hung. The guard sits before the calculator, not after it.
  */
  it('金額壞掉時算零，而且不會把壞值丟進分帳計算', () => {
    expect(expenseCostToViewer(bill({ twdAmount: Number.NaN }), ME, ME)).toBe(0);
    expect(expenseCostToViewer(bill({ twdAmount: Number.POSITIVE_INFINITY }), ME, ME)).toBe(0);
    expect(expenseCostToViewer(bill({ twdAmount: undefined as never }), ME, ME)).toBe(0);
  });
});

describe('整本帳加起來', () => {
  /** His ledger, as the screenshot shows it. */
  const ledger = [
    bill({ id: 'e-air', amount: 12500, twdAmount: 12500, payerId: ME, beneficiaries: [ME, GINA] }),
    bill({ id: 'e-stay', amount: 20000, twdAmount: 20000, payerId: ME, beneficiaries: [ME, GINA] }),
    bill({ id: 'e-hers', amount: 888, twdAmount: 888, payerId: GINA, beneficiaries: [GINA] }),
    bill({ id: 'e-noodle', amount: 726, twdAmount: 726, payerId: GINA, beneficiaries: [GINA, ME] }),
    bill({ id: 'e-coffee', amount: 150, twdAmount: 150, payerId: ME, beneficiaries: [] }),
  ];

  const totalFor = (viewer?: string) =>
    ledger.reduce((sum, entry) => sum + expenseCostToViewer(entry, viewer, ME), 0);

  it('我的總計不含她自己的 888，分帳的只算我那一半', () => {
    // 6250 + 10000 + 0 + 363 + 150
    expect(totalFor(ME)).toBe(16763);
  });

  it('她的總計不含我自己的咖啡', () => {
    // 6250 + 10000 + 888 + 363
    expect(totalFor(GINA)).toBe(17501);
  });

  it('兩個人的總計加起來等於整本帳——沒有錢消失，也沒有錢被算兩次', () => {
    const whole = ledger.reduce((sum, entry) => sum + entry.twdAmount, 0);

    expect(totalFor(ME) + totalFor(GINA)).toBe(whole);
  });
});

describe('誰是這趟的擁有者', () => {
  it('從成員名單裡認出來', () => {
    expect(ownerMemberIdOf(members)).toBe(ME);
  });

  it('沒有擁有者時回傳 undefined，而不是亂挑一個', () => {
    expect(ownerMemberIdOf([{ id: GINA, name: 'Gina', type: 'guest' }])).toBeUndefined();
    expect(ownerMemberIdOf()).toBeUndefined();
  });
});

/**
 * 「我們不能每次都這樣修 所以之後應該怎麼做一次產出就要是正確的」.
 *
 * This arithmetic was written out by hand in four components and left out of a
 * fifth, which is why the same complaint arrived three times about three
 * different screens. The rule has one home now, and this says so — if a screen
 * starts deriving its own again, this is the line that should have stopped it.
 */
import { readFileSync } from 'fs';

describe('每個畫面都用同一條規則', () => {
  const sourceOf = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  it.each([
    'components/Dashboard.tsx',
    'components/TripSummaryModal.tsx',
    'components/WalletPreScreen.tsx',
  ])('%s 用的是共用的那一個，不是自己算一份', path => {
    // The call, not the import: a file can import this and still go on doing
    // its own arithmetic, which is exactly the failure being guarded against.
    expect(sourceOf(path)).toMatch(/expenseCostToViewer\s*\(/);
  });

  it.each([
    'components/Dashboard.tsx',
    'components/TripSummaryModal.tsx',
    'components/WalletPreScreen.tsx',
  ])('%s 不再自己從 responsibility 挑出讀者那一份', path => {
    expect(sourceOf(path)).not.toMatch(/responsibility\[viewerMemberId\]/);
  });
});

/**
 * 「若是在結帳時已退稅，要回頭去去掉該筆帳的總額。點開可看到計算」.
 *
 * Money handed back at the till never left. Counting the sticker price as spend
 * overstates the trip by the whole refund, and the figure the traveller sees
 * then matches neither their receipt nor their card bill.
 */
describe('已經退回來的錢', () => {
  const lipstick = bill({
    id: 'e-lipstick', description: '口紅', amount: 18000, twdAmount: 414,
    currency: 'KRW', exchangeRate: 0.023, payerId: ME, beneficiaries: [],
    taxRefundedAtPurchase: true, taxRefundActual: 1080,
  });

  it('從那筆帳的金額扣掉，換算成記帳幣別', () => {
    // 1,080 KRW × 0.023 = 24.84 TWD off 414.
    expect(Math.round(refundReceivedInTwd(lipstick))).toBe(25);
    expect(Math.round(expenseNetAmount(lipstick))).toBe(389);
  });

  it('沒有填實際金額時不扣——估算不是收到的錢', () => {
    const estimatedOnly = bill({ ...lipstick, taxRefundActual: undefined });

    expect(refundReceivedInTwd(estimatedOnly)).toBe(0);
    expect(expenseNetAmount(estimatedOnly)).toBe(414);
  });

  it('總計用的是扣完之後的金額', () => {
    expect(Math.round(expenseCostToViewer(lipstick, ME, ME))).toBe(389);
  });

  it('分帳的人各自分攤扣完之後的金額', () => {
    const shared = bill({ ...lipstick, beneficiaries: [ME, GINA] });

    // Half of 389, not half of 414.
    expect(Math.round(expenseCostToViewer(shared, ME, ME))).toBe(195);
    expect(Math.round(expenseCostToViewer(shared, GINA, ME))).toBe(195);
  });

  it('退稅比購買金額還大時歸零，不會變成一筆收入', () => {
    const typo = bill({ ...lipstick, taxRefundActual: 999999 });

    expect(expenseNetAmount(typo)).toBe(0);
    expect(expenseCostToViewer(typo, ME, ME)).toBe(0);
  });

  it('機場退的也一樣扣——錢回來就是回來了，不管在哪裡回來', () => {
    const atAirport = bill({ ...lipstick, taxRefundedAtPurchase: undefined, taxRefundChannel: 'airport' });

    expect(Math.round(expenseNetAmount(atAirport))).toBe(389);
  });
});
