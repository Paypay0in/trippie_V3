-- A purchase whose refund was taken off at the till.
--
-- 「退稅有些店家是直接可以在購物結帳時扣除，所以要讓我每筆都點選已經扣除」. Korea
-- calls it 즉시환급: under certain limits the shop deducts the tax on the spot,
-- and the traveller leaves with it already settled.
--
-- Without this the airport estimate counts those purchases again, inflating a
-- figure somebody is about to stand in a queue for — and the two travellers
-- need to agree on which ones are already done, so it syncs with the expense.
--
-- Defaults to false: an unmarked purchase is still worth taking to the counter,
-- which is the safe direction to be wrong in.
alter table public.expenses
  add column if not exists tax_refunded_at_purchase boolean not null default false;
