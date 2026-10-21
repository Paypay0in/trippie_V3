-- The traveller's own photographs of a stop.
--
-- 「淺草寺啊啥的 應該要讓我點擊可以寫下日記與放照片」.
--
-- The diary half of that needed nothing: an itinerary item has always had
-- `notes`, and it has always synced. Photographs had nowhere to go — the only
-- pictures this app held were of receipts, so a temple, a park, a walk, every
-- stop that costs nothing, could be written about but not shown.
--
-- Stored the same way receipt photos already are: downscaled data URLs in a
-- text array, because that is what the rest of this schema does and a second
-- storage mechanism for the same kind of thing is how two answers to one
-- question get born.
--
-- Absent means no photographs, which is an ordinary state for most stops and
-- must never be filled in with somebody else's picture of the same place.
alter table public.itinerary_items
  add column if not exists photos text[];

-- 「如何給淺草寺評價」.
--
-- Ratings were asked for at the till, which is the one moment somebody
-- reliably opens this app about a place they have just been to. It is also
-- why a temple could not be rated: 淺草寺 is free, so it has no bill, and the
-- stops worth the most to a traveller are routinely the ones that cost
-- nothing — a view, a walk, a park.
--
-- So a stop carries its own. Where both exist the stop's is the later and
-- more deliberate statement: the till's star was given while paying, this one
-- while looking back.
alter table public.itinerary_items
  add column if not exists rating smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'itinerary_items_rating_range'
  ) then
    alter table public.itinerary_items
      add constraint itinerary_items_rating_range
      check (rating is null or (rating >= 1 and rating <= 5));
  end if;
end $$;
