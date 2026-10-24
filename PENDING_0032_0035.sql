-- Trippie — paste this whole file into the Supabase SQL Editor and run it once.
--
-- 0032  shopping_items.price_urls        指定商品頁網址（已上線但未接線）
-- 0033  itinerary_items provenance       「來自 Ann 的…」需要的兩個欄位
-- 0034  saved_collections + items        有名字的收藏集，含公開讀取函式
-- 0035  content_saves                    真實收藏數
--
-- Safe to run more than once: every statement is if-not-exists or
-- create-or-replace. Delete this file once it has been run.


-- ======================================================================
-- 0032_shopping_item_price_urls.sql
-- ======================================================================
-- Product pages the traveller named, when the search cannot find them.
--
-- 「這兩個我隨便搜都知道價格」 — about two CHANEL rows. Chanel publishes no price
-- anywhere a program can reach, not even one written for a person, and every
-- page a search returns is a department store's brand index. Nothing about
-- searching better reaches it, and a traveller can produce the right page in
-- thirty seconds.
--
-- One page per country, keyed by ISO code: {"JP": "https://…", "TW": "https://…"}.
-- jsonb rather than two columns, because the pair being compared is a per-trip
-- choice out of twelve countries and not a fixed 日本/台灣.
--
-- Nullable with no default: absent means nobody named one, which is almost
-- every row, and the lookup searches as it always did.

alter table public.shopping_items
  add column if not exists price_urls jsonb;

comment on column public.shopping_items.price_urls is
  'Product page URLs chosen by the traveller, keyed by ISO country code. Read instead of searching when present.';


-- ======================================================================
-- 0033_itinerary_item_provenance.sql
-- ======================================================================
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


-- ======================================================================
-- 0034_saved_collections.sql
-- ======================================================================
-- 收藏集 — a list somebody named, as opposed to a bucket the app computed.
--
-- 「東京咖啡地圖」, 「大阪美食口袋名單」, 「京都寺廟與景點」. The app groups saved
-- places by country and city today (`services/savedGrouping.ts:66`), and that
-- key is a trimmed string: rename a city, spell it differently, and the group
-- is a different group. A collection somebody shares has to survive being
-- renamed, so it needs an identity of its own.
--
-- The items carry a snapshot of the place rather than pointing into the
-- saver's own store. Two reasons, and both matter. The device-wide 收藏 lives
-- only in localStorage, so there is nothing on the server to point at; and a
-- recipient's copy must not change when the creator edits theirs — 「snapshot,
-- not live」 is the approved behaviour.
--
-- Private by default: `visibility` defaults to 'private' and `published_at`
-- is null until somebody publishes. Nothing is readable by anyone else until
-- both say otherwise.

create table if not exists public.saved_collections (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  cover_url text,
  country text not null default '',
  city text not null default '',
  -- 公開 / 僅連結 / 私人, as the share sheet words it.
  visibility text not null default 'private'
    check (visibility in ('public', 'link', 'private')),
  -- The 公開內容 switches, stored because they are a decision and not a default.
  shares_own_notes boolean not null default true,
  shares_photos boolean not null default true,
  shares_place_details boolean not null default true,
  -- Only a 僅連結 collection needs one; null means there is no link to leak.
  share_token text unique,
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_collections_owner_idx
  on public.saved_collections (owner_id);
create index if not exists saved_collections_public_idx
  on public.saved_collections (visibility, published_at)
  where visibility = 'public' and revoked_at is null;

create table if not exists public.saved_collection_items (
  id text primary key,
  collection_id text not null references public.saved_collections (id) on delete cascade,
  position integer not null default 0,
  -- Google's identity for the physical place, when it was resolved.
  place_id text,
  place_name text not null,
  formatted_address text,
  latitude double precision,
  longitude double precision,
  place_photo_url text,
  category text,
  country text not null default '',
  city text not null default '',
  district text,
  -- Only the owner's own notes reach here. A third party's words are theirs
  -- to publish, not the curator's: 「我撰寫的心得筆記」.
  notes jsonb not null default '[]',
  /*
    Lineage, kept even when this collection is itself a re-share. §8: a
    curator may share content originally created by another traveller, and
    the latest sharer's identity must never overwrite the original author's.
  */
  source_creator_id text,
  source_collection_id text,
  source_inspiration_id text,
  created_at timestamptz not null default now()
);

create index if not exists saved_collection_items_collection_idx
  on public.saved_collection_items (collection_id, position);
create unique index if not exists saved_collection_items_place_unique
  on public.saved_collection_items
  (collection_id, coalesce(nullif(place_id, ''), lower(trim(place_name))));

alter table public.saved_collections enable row level security;
alter table public.saved_collection_items enable row level security;

/*
  Owner-only at the table. A 公開 collection is readable by strangers and a
  僅連結 one by whoever holds the token, and neither of those is a question a
  row policy can answer — a token is not an identity. Both go through a
  security-definer function instead, which is the pattern `trip_invites`
  already proved: the table is unreadable, the function decides.
*/
create policy "saved_collections_owner_select" on public.saved_collections
  for select to authenticated using (owner_id = auth.uid());
create policy "saved_collections_owner_write" on public.saved_collections
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "saved_collection_items_owner_select" on public.saved_collection_items
  for select to authenticated using (
    exists (select 1 from public.saved_collections c
            where c.id = collection_id and c.owner_id = auth.uid())
  );
create policy "saved_collection_items_owner_write" on public.saved_collection_items
  for all to authenticated
  using (
    exists (select 1 from public.saved_collections c
            where c.id = collection_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.saved_collections c
            where c.id = collection_id and c.owner_id = auth.uid())
  );

/*
  What a visitor may read.

  Returns nothing at all unless the collection is published, unrevoked, and
  either public or asked for with its own token. 「Revoked shares cannot be
  fetched through stale public endpoints」 is enforced here, in the one place
  that can enforce it.
*/
create or replace function public.read_public_collection(
  collection_id text,
  token text default null
)
returns table (
  id text,
  owner_id uuid,
  title text,
  description text,
  cover_url text,
  country text,
  city text,
  published_at timestamptz,
  items jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.id, c.owner_id, c.title, c.description, c.cover_url,
    c.country, c.city, c.published_at,
    coalesce(
      (select jsonb_agg(to_jsonb(i) - 'collection_id' order by i.position)
         from public.saved_collection_items i
        where i.collection_id = c.id),
      '[]'::jsonb
    ) as items
  from public.saved_collections c
  where c.id = collection_id
    and c.published_at is not null
    and c.revoked_at is null
    and (
      c.visibility = 'public'
      or (c.visibility = 'link' and token is not null and c.share_token = token)
    );
$$;

revoke all on function public.read_public_collection(text, text) from public;
grant execute on function public.read_public_collection(text, text) to anon, authenticated;

/*
  Somebody's published collections, for their profile.

  Only 公開 ones. A 僅連結 collection is not listed anywhere — that is the
  whole difference between the two, and listing it would make the token
  pointless.
*/
create or replace function public.list_public_collections(owner uuid)
returns table (
  id text,
  title text,
  description text,
  cover_url text,
  country text,
  city text,
  published_at timestamptz,
  item_count bigint
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.title, c.description, c.cover_url, c.country, c.city, c.published_at,
         (select count(*) from public.saved_collection_items i where i.collection_id = c.id)
  from public.saved_collections c
  where c.owner_id = owner
    and c.visibility = 'public'
    and c.published_at is not null
    and c.revoked_at is null
  order by c.published_at desc;
$$;

revoke all on function public.list_public_collections(uuid) from public;
grant execute on function public.list_public_collections(uuid) to anon, authenticated;


-- ======================================================================
-- 0035_content_saves.sql
-- ======================================================================
-- Who saved what, recorded once, on the server.
--
-- The screen says 「4.8K 收藏」. What produces that number today is
-- `services/postSaveCounts.ts`, which counts distinct `savedByUserId` values
-- in the reader's **own localStorage** — so a creator looking at their own
-- collection sees how many times they saved it themselves. The number is not
-- small or stale; it is about the wrong person.
--
-- One row per saver per shared thing. The unique index is what makes the
-- count a count: saving the same collection twice must not say two people
-- liked it, and 「Saving the same collection twice must not silently create
-- duplicate places」 has the same shape one layer down.
--
-- This table is also the attribution record §8 asks for. It is the only place
-- that knows all four parties at once: who created it, who shared it, who
-- saved it, and which item. The recipient's own saved places are theirs and
-- live in their own store; this says where they came from.

create table if not exists public.content_saves (
  id text primary key,
  saved_by_user_id uuid not null references auth.users (id) on delete cascade,
  -- 'collection' | 'trip' | 'post', so one counter serves every shared thing.
  source_type text not null check (source_type in ('collection', 'trip', 'post')),
  source_id text not null,
  -- Null when the whole thing was saved; set when one place was picked out.
  source_item_id text,
  /*
    The original author, copied at save time and never recomputed.

    A curator may share somebody else's find, and §8 forbids the latest
    sharer's identity overwriting the original author's. Recomputing this
    later from whatever the source says *now* is exactly how that happens.
  */
  original_creator_id text,
  -- Who handed it on, when that is not the original creator.
  shared_by_user_id text,
  saved_at timestamptz not null default now()
);

create unique index if not exists content_saves_unique
  on public.content_saves
  (saved_by_user_id, source_type, source_id, coalesce(source_item_id, ''));
create index if not exists content_saves_source_idx
  on public.content_saves (source_type, source_id);
create index if not exists content_saves_creator_idx
  on public.content_saves (original_creator_id);

alter table public.content_saves enable row level security;

/*
  A saver owns their own save rows and nobody else's.

  Note what this deliberately does not grant: a creator cannot read the list
  of people who saved their collection. They get a count, through the
  function below, and a count is the thing the screen asks for. Handing over
  the identities would be a social graph nobody consented to.
*/
create policy "content_saves_own_select" on public.content_saves
  for select to authenticated using (saved_by_user_id = auth.uid());
create policy "content_saves_own_write" on public.content_saves
  for all to authenticated
  using (saved_by_user_id = auth.uid()) with check (saved_by_user_id = auth.uid());

/** How many people saved one shared thing. A number, never a list. */
create or replace function public.count_content_saves(
  kind text,
  target text
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct saved_by_user_id)
  from public.content_saves
  where source_type = kind and source_id = target and source_item_id is null;
$$;

revoke all on function public.count_content_saves(text, text) from public;
grant execute on function public.count_content_saves(text, text) to anon, authenticated;


