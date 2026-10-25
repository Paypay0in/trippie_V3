-- 公開的行程 — a trip somebody chose to let strangers read.
--
-- Until now a trip could only be shared *into*: `trip_invites` adds a person
-- as a member, and a member sees the bills. That is the wrong shape for
-- 「公開的旅行列表」 and 「公開行程頁」, where a visitor reads the days and saves
-- the stops they like, and has no business anywhere near the money.
--
-- So publishing is a separate thing from membership, and deliberately so:
-- a published trip grants *reading of the itinerary*, nothing else. No
-- expenses, no settlement, no member list, no companion names. Those tables
-- are not referenced here at all, which is the only way to be sure.
--
-- Snapshot or live? Collections snapshot (`0034`), and the reason given there
-- was that a collection points into places that live only in the saver's
-- localStorage — there is nothing on the server to point at. An itinerary is
-- already on the server, row per stop, so a snapshot here would be a second
-- copy of rows we already have, drifting from the first. A rule with two
-- homes is a rule with two answers. This reads live, through one function
-- that decides what a visitor may see.
--
-- Private by default, like everything else that can leave this device.

alter table public.trips
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trips_visibility_values'
  ) then
    alter table public.trips
      add constraint trips_visibility_values
      check (visibility in ('public', 'link', 'private'));
  end if;
end $$;

-- The 公開內容 switches, worded as the share sheet words them. Stored because
-- each is a decision, not a default: 「行程與景點」 is the trip itself and is
-- always included, the rest are the owner's to withhold.
alter table public.trips
  add column if not exists shares_own_notes boolean not null default true;
alter table public.trips
  add column if not exists shares_photos boolean not null default true;
alter table public.trips
  add column if not exists shares_place_details boolean not null default true;

-- Only a 僅連結 trip needs one; null means there is no link to leak.
alter table public.trips
  add column if not exists share_token text;
alter table public.trips
  add column if not exists published_at timestamptz;
-- Revoked is not deleted. The trip is still the owner's, and they may publish
-- it again; this only says that the link stops answering.
alter table public.trips
  add column if not exists revoked_at timestamptz;

create unique index if not exists trips_share_token_unique
  on public.trips (share_token) where share_token is not null;
create index if not exists trips_public_idx
  on public.trips (visibility, published_at)
  where visibility = 'public' and revoked_at is null;

/*
  What a visitor may read of one trip.

  Returns nothing at all unless the trip is published, unrevoked, and either
  public or asked for with its own token — the same gate `read_public_collection`
  uses, for the same reason: a token is not an identity, so no row policy can
  answer this and a security-definer function has to.

  The owner's switches are applied *here*, not in the client. A note the owner
  withheld must not be sitting in the payload for anybody who opens the network
  tab; withheld means not sent.
*/
create or replace function public.read_public_trip(
  trip_id text,
  token text default null
)
returns table (
  id text,
  owner_id uuid,
  name text,
  destination text,
  start_date text,
  end_date text,
  published_at timestamptz,
  items jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.owner_id, t.name, t.destination, t.start_date, t.end_date,
    t.published_at,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', i.id,
                  'date', i.date,
                  'time', i.time,
                  'title', i.title,
                  'type', i.type,
                  'duration_minutes', i.duration_minutes,
                  'rating', i.rating,
                  /*
                    Where it is, only when 地點資訊 is on. Name and city stay
                    visible either way — the share sheet says so in as many
                    words — and those live in `title` and the trip itself.
                  */
                  'place_id', case when t.shares_place_details then i.place_id end,
                  'location', case when t.shares_place_details then i.location end,
                  'address', case when t.shares_place_details then i.address end,
                  'latitude', case when t.shares_place_details then i.latitude end,
                  'longitude', case when t.shares_place_details then i.longitude end,
                  /* 我撰寫的心得筆記 */
                  'notes', case when t.shares_own_notes then i.notes else '' end,
                  'saved_travel_notes', case
                    when t.shares_own_notes then i.saved_travel_notes
                    else '[]'::jsonb end,
                  /* 照片（我上傳的） */
                  'photos', case when t.shares_photos then to_jsonb(i.photos) end
                )
                order by i.date, nullif(i.time, ''), i.sort_order, i.created_at)
         from public.itinerary_items i
        where i.trip_id = t.id),
      '[]'::jsonb
    ) as items
  from public.trips t
  where t.id = trip_id
    and t.published_at is not null
    and t.revoked_at is null
    and (
      t.visibility = 'public'
      or (t.visibility = 'link' and token is not null and t.share_token = token)
    );
$$;

revoke all on function public.read_public_trip(text, text) from public;
grant execute on function public.read_public_trip(text, text) to anon, authenticated;

/*
  Somebody's published trips, for their profile — 「公開的旅行列表」.

  Only 公開 ones. A 僅連結 trip is not listed anywhere; listing it would make
  the token pointless, which is the whole difference between the two.

  `stop_count` is what the card shows next to the dates (「7 天・32 個地點」),
  and `save_count` is the 收藏 figure, counted from `content_saves` so the one
  counter serves collections, posts and trips alike.
*/
create or replace function public.list_public_trips(owner uuid)
returns table (
  id text,
  name text,
  destination text,
  start_date text,
  end_date text,
  published_at timestamptz,
  stop_count bigint,
  save_count bigint,
  cover_photo text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.name, t.destination, t.start_date, t.end_date, t.published_at,
    (select count(*) from public.itinerary_items i where i.trip_id = t.id),
    (select count(*) from public.content_saves s
      where s.source_type = 'trip' and s.source_id = t.id),
    /*
      A cover, when the owner shares photographs and some stop has one. Never
      somebody else's picture of the same place: an absent cover is an ordinary
      state and the client draws a gradient for it.
    */
    (select p.photo from public.itinerary_items i
       cross join lateral unnest(i.photos) as p(photo)
      where i.trip_id = t.id and t.shares_photos
      order by i.date, i.created_at
      limit 1)
  from public.trips t
  where t.owner_id = owner
    and t.visibility = 'public'
    and t.published_at is not null
    and t.revoked_at is null
  order by t.published_at desc;
$$;

revoke all on function public.list_public_trips(uuid) from public;
grant execute on function public.list_public_trips(uuid) to anon, authenticated;

/*
  The three numbers on somebody's profile — 旅行 / 城市 / 收藏.

  Counted from what they have actually published, never from what they own:
  a profile that says 12 旅行 while listing 3 is a profile that is lying about
  a stranger. 城市 is distinct destinations across those published trips plus
  the cities of their published collections, because that is the figure the
  screen puts under 「城市」 and both halves are places they have been.
*/
create or replace function public.public_profile_counts(owner uuid)
returns table (
  trip_count bigint,
  city_count bigint,
  collection_count bigint,
  save_count bigint
)
language sql
security definer
set search_path = public
as $$
  with published_trips as (
    select t.id, t.destination
      from public.trips t
     where t.owner_id = owner
       and t.visibility = 'public'
       and t.published_at is not null
       and t.revoked_at is null
  ), published_collections as (
    select c.id, c.city
      from public.saved_collections c
     where c.owner_id = owner
       and c.visibility = 'public'
       and c.published_at is not null
       and c.revoked_at is null
  )
  select
    (select count(*) from published_trips),
    (select count(distinct city) from (
        select nullif(trim(destination), '') as city from published_trips
        union
        select nullif(trim(city), '') from published_collections
     ) cities where city is not null),
    (select count(*) from published_collections),
    (select count(*) from public.content_saves s
      where (s.source_type = 'trip'
             and s.source_id in (select id from published_trips))
         or (s.source_type = 'collection'
             and s.source_id in (select id from published_collections)));
$$;

revoke all on function public.public_profile_counts(uuid) from public;
grant execute on function public.public_profile_counts(uuid) to anon, authenticated;
