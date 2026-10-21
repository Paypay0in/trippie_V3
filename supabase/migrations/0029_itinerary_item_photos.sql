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
