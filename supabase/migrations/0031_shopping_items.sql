-- The shopping list, on the trip rather than on one phone.
--
-- 「這照片好像不會存」 was a full device, but underneath it was this: the list
-- has only ever lived inside the local draft. Change phone, clear a cache, or
-- open the app from a different icon and 待買清單 is empty — and because it
-- never reached the server, nothing anywhere could say so.
--
-- Shared with the trip, like the itinerary and for the same reason: 「幫我帶一
-- 條」 is the whole of why two people keep one list, and a companion who cannot
-- tick off what they just bought goes back to the group chat, which is what
-- this product replaces.
--
-- Membership reuses `public.is_trip_member` from 0001 rather than restating
-- the rule. Two spellings of who belongs to a trip is two answers waiting to
-- disagree.

create table if not exists public.shopping_items (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,

  name text not null default '',
  -- 行前採買 / 旅行中 / 回國後, as the client's phases are spelled.
  phase text not null default 'during',
  is_purchased boolean not null default false,

  -- What was read off a screenshot: the brand and the size, the shop, the
  -- chip it sorts under. All optional; a line typed by hand has none of them.
  description text,
  shop text,
  category text,
  priority text,
  quantity integer,

  -- What it is expected to cost, when somebody has said. Never read off a
  -- screenshot and never guessed — see §6 of docs/PRODUCT.md.
  estimated_amount numeric,
  estimated_currency text,

  -- The picture of the thing, as a downscaled data URL, the way receipt
  -- photos and a stop's photographs are already stored. One storage idea for
  -- one kind of thing.
  photo text,
  -- Where that picture came from, when it is not the traveller's own
  -- screenshot. A product shot nobody can place is believed because it looks
  -- like a product shot.
  photo_source text,

  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_trip on public.shopping_items (trip_id);

alter table public.shopping_items enable row level security;

drop policy if exists shopping_items_select on public.shopping_items;
create policy shopping_items_select on public.shopping_items
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists shopping_items_insert on public.shopping_items;
create policy shopping_items_insert on public.shopping_items
  for insert to authenticated
  with check (public.is_trip_member(trip_id));

-- Update is required, not optional: the client writes the whole list back with
-- upsert, so every save after the first takes this path. A table with insert
-- but no update policy accepts the first write and refuses every one after.
drop policy if exists shopping_items_update on public.shopping_items;
create policy shopping_items_update on public.shopping_items
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists shopping_items_delete on public.shopping_items;
create policy shopping_items_delete on public.shopping_items
  for delete to authenticated
  using (public.is_trip_member(trip_id));
