-- Whose itinerary item this is.
--
-- 「行程並不是所有人的都會相同，所以要有可以共享本行程或是個人行程的選項」 and
-- 「你的朋友可以在他的行程表上看到你的行程」.
--
-- Two travellers on one trip do not do the same things all day, but the
-- itinerary assumed they did: one list, every row joint. A haircut that
-- concerned one of them either sat on both plans as though it were joint, or
-- was left off the trip entirely.
--
-- Null means shared. Every row that exists today was everybody's, and that has
-- to keep being true — a default of 'personal' would hand the whole plan to
-- whoever happened to have written it and empty the other phone.
--
-- `owner_user_id` is not a foreign key to a member row: members come and go
-- from a trip, and an item losing its attribution because somebody left is
-- worse than an id that no longer resolves. The client falls back to 同行者.
--
-- No RLS change. A personal item is still the trip's data and still readable by
-- the trip's members — being personal decides whose day it occupies and whose
-- name it carries, not who may read it. Hiding it at the database would make
-- the third request impossible.
alter table public.itinerary_items
  add column if not exists visibility text,
  add column if not exists owner_user_id text;

alter table public.itinerary_items
  drop constraint if exists itinerary_items_visibility_check;

alter table public.itinerary_items
  add constraint itinerary_items_visibility_check
  check (visibility is null or visibility in ('shared', 'personal'));
