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
