-- What the traveller thought of the place, recorded where they were already typing.
--
-- 「在記帳的帳目中希望就能順便給星等評分（但這是選填）這樣能讓用戶直接無痛紀錄他
-- 經歷的事情 也能摘取這些紀錄在收藏或是之後做總覽」.
--
-- A rating is asked for at the one moment somebody reliably opens this app
-- about a place they have just been to: paying for it. Anywhere else it is a
-- second errand.
--
-- Optional, and absent is a real answer — most bills are a train ticket or a
-- konbini and have nothing to say. `null` means 「not rated」 and must never be
-- read as 「rated zero」, which is why there is no default and no NOT NULL.
--
-- Syncs with the expense because both travellers read the same ledger, and
-- because 總覽 and the collection read it back from there rather than from
-- whichever phone typed it.
alter table public.expenses
  add column if not exists rating smallint;

-- One to five, or nothing. A number outside that range is a bug, not an
-- opinion, and the database is the one place it can be refused outright.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_rating_range'
  ) then
    alter table public.expenses
      add constraint expenses_rating_range
      check (rating is null or (rating >= 1 and rating <= 5));
  end if;
end $$;
