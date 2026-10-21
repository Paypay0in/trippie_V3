-- 「日記只給自己看」.
--
-- The first version of this wrote into `itinerary_items.notes`, which is the
-- trip's own note on a stop: it syncs, and everybody on the trip reads it. For
-- 「what time do we need to leave」 that is exactly right. For 「雷門比想像中大，
-- 我有點想哭」 it is a diary handed to your travelling companion.
--
-- So the journal is its own row, owned by whoever wrote it. One per person per
-- stop: two travellers standing in the same temple have two different days, and
-- neither of them is an edit of the other's.
--
-- Not a device-local store, which was the obvious shortcut and is the trap this
-- project spent a morning in: a note that lives only in one browser is lost to
-- a new phone, a cleared cache, or opening the app from a different icon, and
-- nothing on screen ever says so.
create table if not exists public.itinerary_journals (
  item_id text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  trip_id text not null,
  text text not null default '',
  -- Downscaled data URLs, as receipt photos already are. One storage idea for
  -- one kind of thing.
  photos text[],
  updated_at timestamptz not null default now(),
  primary key (item_id, author_id)
);

create index if not exists itinerary_journals_trip_author
  on public.itinerary_journals (trip_id, author_id);

alter table public.itinerary_journals enable row level security;

-- The whole point of the table: nobody reads anybody else's, including the
-- trip's owner. Enforced here rather than by what the client happens to ask
-- for, because a privacy rule a query can forget is not a privacy rule.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'itinerary_journals' and policyname = 'itinerary_journals_own'
  ) then
    create policy itinerary_journals_own on public.itinerary_journals
      for all
      using (author_id = auth.uid())
      with check (author_id = auth.uid());
  end if;
end $$;
