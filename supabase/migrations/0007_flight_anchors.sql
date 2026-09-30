-- Flight anchors, shared like everything else on a trip.
--
-- They were local-only. The two itinerary items each anchor derives did sync,
-- which is worse than not syncing at all: a companion received "航班起飛" with
-- no anchor behind it, and her device's reconciliation then deleted those rows
-- for both travellers.
--
-- Its own table rather than a column on `trips` for one reason: only the owner
-- may write the `trips` row (`owner_id = auth.uid()`), so a companion editing
-- a flight there would fail silently. Membership is the right permission for
-- something both people on the trip need to change, which is exactly what
-- `itinerary_items` and `expenses` already use.
--
-- Columns, not JSONB, for the fields that decide behaviour — the date and time
-- an anchor fixes, and the direction it belongs to — because those are what
-- sorting, validation and the derived items read.

begin;

create table if not exists public.flight_anchors (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  direction text not null check (direction in ('OUTBOUND', 'RETURN')),

  departure_date text not null default '',
  departure_time text not null default '',
  departure_airport text not null default '',
  departure_airport_iata text,
  departure_airport_city text,
  departure_airport_country text,
  departure_airport_address text,
  departure_airport_place_id text,
  departure_airport_latitude double precision,
  departure_airport_longitude double precision,

  arrival_date text,
  arrival_time text,
  arrival_airport text,
  arrival_airport_iata text,
  arrival_airport_city text,
  arrival_airport_country text,
  arrival_airport_address text,
  arrival_airport_place_id text,
  arrival_airport_latitude double precision,
  arrival_airport_longitude double precision,

  -- Minutes before departure the traveller wants to be at the airport. The
  -- derived "抵達機場" item is this many minutes before take-off.
  airport_arrival_buffer_minutes integer not null default 120,
  source text not null default 'MANUAL',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One outbound and one return per trip. Uploading a second boarding pass for
  -- the same leg replaces it rather than producing two conflicting departures.
  unique (trip_id, direction)
);

create index if not exists flight_anchors_trip_id_idx
  on public.flight_anchors (trip_id);

alter table public.flight_anchors enable row level security;

drop policy if exists flight_anchors_select on public.flight_anchors;
create policy flight_anchors_select on public.flight_anchors
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists flight_anchors_insert on public.flight_anchors;
create policy flight_anchors_insert on public.flight_anchors
  for insert to authenticated
  with check (public.is_trip_member(trip_id));

drop policy if exists flight_anchors_update on public.flight_anchors;
create policy flight_anchors_update on public.flight_anchors
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists flight_anchors_delete on public.flight_anchors;
create policy flight_anchors_delete on public.flight_anchors
  for delete to authenticated
  using (public.is_trip_member(trip_id));

drop trigger if exists flight_anchors_touch_updated_at on public.flight_anchors;
create trigger flight_anchors_touch_updated_at
  before update on public.flight_anchors
  for each row execute function public.touch_updated_at();

commit;
