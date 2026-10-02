-- The trip's want-to-go list, shared like everything else on it.
--
-- 「跟朋友會先把想去的地方列一個表單」, and then: 「好啊 收藏可以同步 也要可以檢查
-- 是否重複」. The collection lived in one browser's localStorage, so the one
-- thing it was for — two people building a list together — was the one thing it
-- could not do. A friend's screenshot became places only its reader could see.
--
-- Trip-scoped rather than account-scoped, and keyed on membership rather than
-- ownership, for the same reason `itinerary_items` and `flight_anchors` are:
-- both travellers add to this, and only the owner may write the `trips` row, so
-- a companion saving a place there would fail silently.
--
-- Place identity gets real columns because that is what the planner reads to
-- arrange a day by geography — 「根據收藏行程的地址去安排」. The notes that came
-- with a place are JSONB: they are read as a block, never queried across.

begin;

create table if not exists public.trip_inspirations (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,

  -- Who put it on the list. Kept so a row can say whose find it was, never
  -- used to restrict reading: the whole point is that both travellers see it.
  saved_by_user_id text not null default '',

  place_name text not null,
  country text not null default '',
  city text not null default '',

  place_id text,
  resolved_place_name text,
  formatted_address text,
  latitude double precision,
  longitude double precision,
  place_photo_url text,

  -- Provenance. A community save carries the post and slice it came from; a
  -- screenshot carries a `screenshot:` marker instead, because no creator wrote
  -- it and nobody should be credited for it.
  source_post_id text not null default '',
  source_slice_id text not null default '',
  source_creator_id text not null default '',
  source_note_ids jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,

  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_inspirations_trip_id_idx
  on public.trip_inspirations (trip_id);

-- 「也要可以檢查是否重複」, enforced where it cannot be forgotten.
--
-- Two travellers screenshotting the same friend's list produce the same place
-- twice, and a client-side check only catches what one device can see. A place
-- resolved to a Google id is the same place however it was typed; one that
-- never resolved falls back to its name, lowercased so 「Panier」 and 「panier」
-- are not two entries on the same list.
create unique index if not exists trip_inspirations_place_unique
  on public.trip_inspirations (trip_id, coalesce(nullif(place_id, ''), lower(trim(place_name))));

alter table public.trip_inspirations enable row level security;

drop policy if exists trip_inspirations_select on public.trip_inspirations;
create policy trip_inspirations_select on public.trip_inspirations
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists trip_inspirations_insert on public.trip_inspirations;
create policy trip_inspirations_insert on public.trip_inspirations
  for insert to authenticated
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_inspirations_update on public.trip_inspirations;
create policy trip_inspirations_update on public.trip_inspirations
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_inspirations_delete on public.trip_inspirations;
create policy trip_inspirations_delete on public.trip_inspirations
  for delete to authenticated
  using (public.is_trip_member(trip_id));

drop trigger if exists trip_inspirations_touch_updated_at on public.trip_inspirations;
create trigger trip_inspirations_touch_updated_at
  before update on public.trip_inspirations
  for each row execute function public.touch_updated_at();

commit;
