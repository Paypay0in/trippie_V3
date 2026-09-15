export interface SettlementTransfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export function buildMinimumSettlementTransfers(
  balances: Record<string, number>,
  epsilon = 0.5,
): SettlementTransfer[] {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > epsilon)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < -epsilon)
    .map(([id, amount]) => ({ id, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const transfers: SettlementTransfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > epsilon) {
      transfers.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amount });
    }
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount <= epsilon) creditorIndex += 1;
    if (debtor.amount <= epsilon) debtorIndex += 1;
  }
  return transfers;
}
