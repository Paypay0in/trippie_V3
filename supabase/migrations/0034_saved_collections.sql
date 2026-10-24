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
