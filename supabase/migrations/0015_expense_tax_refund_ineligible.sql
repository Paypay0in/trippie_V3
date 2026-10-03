-- A purchase that cannot be refunded at all.
--
-- 「要加一個按鈕：不可退稅」. The refund rule knows a threshold and a rate and
-- nothing about what was bought or where: a meal, a service, a ticket, or a shop
-- that is simply not tax-free registered all get counted in. The headline then
-- promises money nobody can collect, and somebody queues for it.
--
-- Distinct from `tax_refunded_at_purchase`, which says the refund already
-- happened at the till. This says there was never one to have — so the purchase
-- is excluded from the estimate and is never used to infer a rate, because it is
-- not a measurement of a refund.
--
-- Syncs with the expense: both travellers have to agree on which purchases are
-- worth carrying to the counter.
--
-- Defaults to false, which is the safe direction to be wrong in: an unmarked
-- purchase is still worth asking about.
alter table public.expenses
  add column if not exists tax_refund_ineligible boolean not null default false;
