-- Who found this place, kept on the itinerary item itself.
--
-- An accepted itinerary item already carries `source_inspiration_ids` and
-- `saved_travel_notes`, and between them they were the whole of what survived
-- the journey from somebody's shared collection into a traveller's plan. That
-- is not enough: the creator's identity lives only *inside* each note object,
-- so a place somebody recommended without writing anything about it arrives
-- with nobody's name on it.
--
-- 「來自 Ann 的東京咖啡地圖 · 收藏於 2024/03/10」 is the line the place detail
-- screen has to print. It needs two facts the item cannot currently state.
--
-- Deliberately ids and not names. §8: 「Use stable IDs and explicit lineage,
-- not title or place-name similarity」. A Google Place ID identifies the
-- physical place; it does not identify who recommended it.

alter table public.itinerary_items
  add column if not exists source_creator_id text,
  add column if not exists source_collection_id text;

comment on column public.itinerary_items.source_creator_id is
  'The user who originally shared this place, when it came from somebody else. Never the saver.';
comment on column public.itinerary_items.source_collection_id is
  'The shared collection or trip this place was taken from, for the 「來自 X 的 Y」 line.';
