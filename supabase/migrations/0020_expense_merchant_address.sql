-- Where the shop is, as printed on the receipt.
--
-- 「收據上如果有地址 我希望帳上可以記錄地址，因為未來有一個功能會希望用戶願意分享
-- 帳本給其他用戶參考，能有實際經驗。地址更能協助大數據分析」.
--
-- A ledger shared with another traveller says 「somebody actually went here and
-- paid this」, and 「CJ올리브영(주) 서면역사점」 is only a name until something says
-- where it is.
--
-- Stored as printed rather than geocoded. The characters on the paper are the
-- fact; a lookup can be run over them whenever it is needed, without having
-- guessed a coordinate at a moment when nobody was asking for one.
--
-- A shop's address, not a person's — the same line printed on a receipt anyone
-- could be handed. RLS is unchanged: this is trip data like every other column
-- here, and nothing is shared outside the trip until a sharing feature exists
-- and asks.
alter table public.expenses
  add column if not exists merchant_address text;
