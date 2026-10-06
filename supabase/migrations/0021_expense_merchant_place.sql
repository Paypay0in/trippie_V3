-- The shop as a place, rather than as a line of text.
--
-- 「地址更能協助大數據分析」, and then 「把地址解析成座標 + 商家 Place ID … 好啊」.
--
-- A printed address is enough to read and useless to count with: the same
-- Olive Young prints as 「부산광역시 부산진구 중앙대로 737 2-02호(부전동, 서면역구내)」
-- on one receipt and shorter on the next, so a shared ledger could never say
-- 「four travellers went to this shop」. A place id can.
--
-- Written only when the place service returned an address carrying the same
-- street number the receipt printed. A lookup always returns something, and a
-- confidently wrong coordinate is worse than an empty column — it does not
-- look missing, so nobody checks it, and it lands in whatever is aggregated
-- later. Null here means nobody could pin the shop down, which is the honest
-- record.
alter table public.expenses
  add column if not exists merchant_place_id text,
  add column if not exists merchant_latitude double precision,
  add column if not exists merchant_longitude double precision;
