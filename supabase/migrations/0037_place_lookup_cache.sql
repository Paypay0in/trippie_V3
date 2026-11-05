-- 0037 — the place lookup cache: buy a place's identity once, not every morning.
--
-- WHY THIS EXISTS
-- `placeBasicsCache`, `placeReviewsCache` and the resolve path all cache in
-- process memory, and Render's free instance sleeps. Every morning the whole
-- working set is bought from Google again, which is why the call counts in
-- CLB-183 were a lower bound rather than an estimate.
--
-- WHAT MAY BE STORED HERE, AND WHAT MAY NOT
-- Google's policies exempt `place_id` from the caching restrictions and allow
-- it to be kept indefinitely. Other fields do not get that exemption, and I
-- have not established their limit, so this table stores the IDENTITY of a
-- lookup only:
--
--   query  ->  place_id
--
-- No name, no address, no coordinates, no rating, and never reviews. The saving
-- is the search: a cached query skips Text Search Pro ($32/1000) and goes
-- straight to a Place Details call for the fields it needs. If a later ticket
-- wants to cache the fields too, that is a separate decision with a separate
-- reading of the policy — do not widen this table to get it.
--
-- IDEMPOTENT. Safe to paste twice; creates nothing it already finds.

create table if not exists public.place_lookup_cache (
  -- The normalised query, which is the cache key. Lower-cased and
  -- whitespace-collapsed by the caller so two spellings of one search do not
  -- buy the same place twice.
  query text primary key,
  -- The country the query was asked under, because `/api/places/resolve`
  -- re-ranks on it: 「7-ELEVEN 信義」 resolves to a different shop in Taipei than
  -- in Nantou, and a key that forgets the country would serve one for the
  -- other. Empty string, not null, so it is part of a usable primary key.
  country text not null default '',
  -- The only Google field kept. See the policy note above.
  place_id text not null,
  first_seen_at timestamptz not null default now(),
  -- Touched on every hit, so a later ticket can evict by disuse rather than by
  -- guessing a TTL.
  last_used_at timestamptz not null default now(),
  use_count integer not null default 1
);

-- The real key is (query, country); `query` alone is the primary key above only
-- because Postgres wants one. Replace it with the pair.
alter table public.place_lookup_cache drop constraint if exists place_lookup_cache_pkey;
alter table public.place_lookup_cache add constraint place_lookup_cache_pkey
  primary key (query, country);

create index if not exists place_lookup_cache_last_used_idx
  on public.place_lookup_cache (last_used_at);

-- NOT per-traveller data: this is a cache of public facts about public places,
-- shared by everybody, and it holds nothing a traveller wrote. So RLS is on with
-- read open to any authenticated user, and writes restricted to the service role
-- the server uses — a traveller's own session must never be able to poison
-- another traveller's lookup by inserting a wrong place_id.
alter table public.place_lookup_cache enable row level security;

drop policy if exists place_lookup_cache_read on public.place_lookup_cache;
create policy place_lookup_cache_read on public.place_lookup_cache
  for select to authenticated using (true);

-- No insert/update/delete policy is created on purpose. The service role
-- bypasses RLS, so the server can write; nobody else can.

comment on table public.place_lookup_cache is
  'query -> Google place_id, so one search is bought once. place_id only: Google exempts it from caching limits, other fields are not established. See 0037 header.';

-- ROLLBACK
--   drop table if exists public.place_lookup_cache;
