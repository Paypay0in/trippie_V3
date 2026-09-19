-- The itinerary, shared.
--
-- Until now the itinerary existed only in this device's localStorage. Two
-- people on one trip could split a bill together and still be looking at two
-- different days — the one thing a trip is actually made of was the one thing
-- nobody else could see.
--
-- Columns for what decides behaviour: the day, the order within it, whether
-- the AI may touch it. JSONB for the shapes the client already owns, following
-- the same call made for the expense table — normalising provenance and notes
-- into their own tables would split one card's contents across joins for no
-- gain at this size.
--
-- Membership reuses `public.is_trip_member` from 0001 rather than restating
-- the rule. Two spellings of who belongs to a trip is two answers waiting to
-- disagree.

create table if not exists public.itinerary_items (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,

  -- The day this sits on. Kept as text to match the client's plain dates and
  -- the rest of this schema; a trip is planned in local calendar days, and a
  -- timestamp would invite a timezone this product has no answer for.
  date text,
  time text not null default '',
  title text not null default '',
  location text not null default '',
  notes text not null default '',
  type text not null default 'ACTIVITY'
    check (type in ('FLIGHT', 'HOTEL', 'ACTIVITY', 'FOOD', 'TRANSPORT')),

  -- Place identity, and only ever from the map service. The model is not
  -- allowed to produce these, so a row carrying a place_id is a row whose
  -- venue was actually resolved.
  place_id text,
  address text,
  latitude double precision,
  longitude double precision,

  duration_minutes integer,
  is_completed boolean not null default false,

  -- Explicit position within its day, set only once someone has dragged that
  -- day into an order of their own. Null means fall back to chronological,
  -- exactly as the client already does.
  sort_order integer,

  -- 📌 The AI planner may never move, retime, relocate or remove this.
  -- Manual editing is unaffected. Shared because the protection has to travel
  -- with the trip: an item one person pinned must not be reschedulable by the
  -- other person's planner.
  is_pinned boolean not null default false,
  schedule_flexibility text check (schedule_flexibility in ('fixed', 'flexible')),
  fixed_event_kind text,

  origin text,
  linked_expense_id text,
  derived_from_flight_anchor_id text,

  -- Provenance and the notes copied from a saved inspiration. Client shapes,
  -- stored as the client holds them.
  source_inspiration_ids jsonb not null default '[]'::jsonb,
  saved_travel_notes jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists itinerary_items_trip_id_idx
  on public.itinerary_items (trip_id);
-- The list is read a day at a time, in order.
create index if not exists itinerary_items_trip_day_idx
  on public.itinerary_items (trip_id, date, sort_order);

alter table public.itinerary_items enable row level security;

-- Everyone on the trip reads and writes the same itinerary. A companion who
-- cannot add the restaurant they just booked is a companion who goes back to
-- the group chat, which is the thing this replaces.
drop policy if exists itinerary_items_select on public.itinerary_items;
create policy itinerary_items_select on public.itinerary_items
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists itinerary_items_insert on public.itinerary_items;
create policy itinerary_items_insert on public.itinerary_items
  for insert to authenticated
  with check (public.is_trip_member(trip_id));

-- Update is required, not optional: the client writes the whole list back with
-- upsert, so every save after the first takes this path. A table with insert
-- but no update policy accepts the first write and refuses every one after —
-- the exact fault found in 0003 before it was applied anywhere.
drop policy if exists itinerary_items_update on public.itinerary_items;
create policy itinerary_items_update on public.itinerary_items
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists itinerary_items_delete on public.itinerary_items;
create policy itinerary_items_delete on public.itinerary_items
  for delete to authenticated
  using (public.is_trip_member(trip_id));
