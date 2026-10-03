-- What the refund actually came to, and where it happened.
--
-- 「如果按下去 可以輸入正確退稅金額 你之後就能反推退稅的規則？」 — an estimate is
-- the app's arithmetic; this is what the counter handed back. Where it exists it
-- replaces the estimate for that purchase, and the card can say how much of its
-- total is confirmed rather than guessed.
--
-- The channel matters because 즉시환급 at the till and the airport desk are
-- different schemes with different fee tables: an observation from one says
-- nothing about the other, and averaging them would fit one curve to two.
--
-- Null means unknown, which is not zero -- a traveller who refunded a purchase
-- without noting the figure has still refunded it.
alter table public.expenses
  add column if not exists tax_refund_actual numeric,
  add column if not exists tax_refund_channel text
    check (tax_refund_channel is null or tax_refund_channel in ('at_till', 'airport'));
