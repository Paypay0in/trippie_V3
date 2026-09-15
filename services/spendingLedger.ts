import { Expense, Phase } from '../types';

/**
 * Spending is spending. Settlement changes who still owes whom; it never erases
 * or reduces the underlying spending record.
 *
 * Every Dashboard / Wallet figure whose label means spending or money flow —
 * 支出總計, 花費類別, 現金流, 預估帳單總額, 購物支出總額, 預估退稅總額 — reads
 * from this ledger. Settlement-aware accounting
 * (`services/settlementConsumption`) is used only for debt and settlement
 * displays.
 *
 * These helpers take no batches on purpose: there is no parameter through which
 * settlement state could reach a spending total.
 */

/** The spending ledger for a screen: the raw expenses, never settlement-filtered. */
export const selectSpendingExpenses = (expenses: Expense[]): Expense[] => [...expenses];

/** The spending ledger for one phase. `undefined` means every phase. */
export const selectPhaseSpendingExpenses = (
  expenses: Expense[],
  phase?: Phase,
): Expense[] =>
  phase ? expenses.filter(expense => expense.phase === phase) : selectSpendingExpenses(expenses);
