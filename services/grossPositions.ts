import { Expense } from '../types';
import { calculateExpenseLedger } from './splitCalculator';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * What the trip owes in both directions, before the two sides cancel out.
 *
 * 「還沒按下結算前應該我要有應付的金額」, and again: 「結算前 是不是要將目前累積下來
 * 的帳先顯示？」
 *
 * The settlement screen showed 應收 15,108 and 應付 0, which is the truth about
 * the payment that closes the trip — one transfer, in one direction — and not
 * the truth about the trip. The reader had fronted meals and been fronted
 * others; the second of those facts had been subtracted into nothing before it
 * ever reached the screen.
 *
 * So: two gross figures, one per direction. What the net transfer will be is
 * answered underneath, by the member rows and 最簡結算方式, which are unchanged.
 */

export interface GrossPosition {
  /** Money others owe the viewer on bills the viewer fronted. */
  receivable: number;
  /** Money the viewer owes on bills somebody else fronted. */
  payable: number;
  /** How many other travellers each side involves. */
  owingMemberCount: number;
  owedMemberCount: number;
}

/** Below this, a balance is rounding noise rather than a debt. */
const TOLERANCE = 0.5;

export const grossPositionFor = ({
  expenses,
  viewerMemberId,
  ownerMemberId,
}: {
  expenses: Expense[];
  viewerMemberId?: string;
  ownerMemberId?: string;
}): GrossPosition => {
  const empty: GrossPosition = {
    receivable: 0,
    payable: 0,
    owingMemberCount: 0,
    owedMemberCount: 0,
  };
  if (!viewerMemberId) return empty;
  const me = normalizeOwnerMemberId(viewerMemberId, ownerMemberId);

  let receivable = 0;
  let payable = 0;
  const owing = new Set<string>();
  const owed = new Set<string>();

  expenses.forEach(expense => {
    if (!Number.isFinite(expense.twdAmount)) return;
    const { responsibility, paid } = calculateExpenseLedger(expense, ownerMemberId);

    const totalPaid = Object.values(paid).reduce((sum, amount) => sum + (amount || 0), 0);
    if (totalPaid <= 0) return;
    const myPaidShare = (paid[me] || 0) / totalPaid;

    Object.entries(responsibility).forEach(([memberId, owes]) => {
      if (!Number.isFinite(owes) || owes <= 0) return;

      if (memberId === me) {
        /*
          What this bill left me owing, to whoever fronted it.

          Only the part somebody else paid for. A bill I both paid and consumed
          is my own spending, and counting it here would turn every solo coffee
          into a debt.
        */
        const owedByMe = owes * (1 - myPaidShare);
        if (owedByMe > TOLERANCE) {
          payable += owedByMe;
          Object.keys(paid).forEach(payerId => {
            if (payerId !== me && (paid[payerId] || 0) > 0) owed.add(payerId);
          });
        }
        return;
      }

      // Their share, to the extent I am the one who fronted it.
      const owedToMe = owes * myPaidShare;
      if (owedToMe > TOLERANCE) {
        receivable += owedToMe;
        owing.add(memberId);
      }
    });
  });

  return {
    receivable,
    payable,
    owingMemberCount: owing.size,
    owedMemberCount: owed.size,
  };
};
