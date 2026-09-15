-- Trip sharing: the storage layer the multi-member model has been missing.
--
-- Until now a trip lived in localStorage, so scanning a share code produced two
-- separate books that happened to agree on an id. Ownership, roster, disputes
-- and proposals are all built and tested; they have simply had nowhere shared
-- to live.
--
-- Run this in the Supabase SQL editor. It is idempotent: safe to re-run.
--
-- Ids are text, not uuid, because the client already mints them
-- (`<tripId>:owner`, companion ids, expense ids) and existing local data must
-- migrate without being renumbered. Renaming an id would orphan every expense
-- that references it.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  destination text,
  start_date text,
  end_date text,
  currency text,
  budget numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per member of a trip. `user_id` is null for a name-only guest, which
-- is how most companions start; it is filled in when that person is linked to
-- a real account. Permission depends on it, so it must stay nullable rather
-- than forcing a fake account per guest.
create table if not exists public.trip_members (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  type text not null check (type in ('owner', 'member', 'guest')),
  created_at timestamptz not null default now()
);

create index if not exists trip_members_trip_id_idx on public.trip_members (trip_id);
create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

create table if not exists public.expenses (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  -- Who entered the record. Ownership for edit/delete is decided by this alone,
  -- never by payer_id. Nullable for rows written before the field existed.
  created_by_member_id text,
  description text not null default '',
  amount numeric not null default 0,
  currency text not null default 'TWD',
  exchange_rate numeric not null default 1,
  handling_fee numeric not null default 0,
  twd_amount numeric not null default 0,
  category text,
  payment_method text,
  phase text,
  date text,
  payer_id text,
  -- Allocations, beneficiaries and disputes keep the client's own shapes.
  -- Normalising them into tables would split the split calculator's inputs
  -- across joins for no gain at this size.
  payer_allocations jsonb not null default '{}'::jsonb,
  beneficiaries jsonb not null default '[]'::jsonb,
  split_method text not null default 'EQUAL',
  split_allocations jsonb not null default '{}'::jsonb,
  disputes jsonb not null default '[]'::jsonb,
  needs_review boolean not null default false,
  linked_shopping_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_trip_id_idx on public.expenses (trip_id);

-- ---------------------------------------------------------------------------
-- Membership check
-- ---------------------------------------------------------------------------

-- A policy on trip_members that queries trip_members recurses. This runs as the
-- definer so the lookup is not re-filtered by the policy that calls it.
create or replace function public.is_trip_member(target_trip_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members m
    where m.trip_id = target_trip_id
      and m.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_trip_member(text) from public;
grant execute on function public.is_trip_member(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.expenses enable row level security;

-- Trips: any member may read; only the owner may create, change or delete the
-- trip itself. Deleting a trip destroys its whole ledger, so it stays with the
-- one person who is accountable for it.
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select to authenticated
  using (owner_id = auth.uid() or public.is_trip_member(id));

drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete to authenticated
  using (owner_id = auth.uid());

-- Members: any member may read the roster — you cannot settle with people you
-- cannot see. Only the trip owner changes who is on the trip.
drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists trip_members_write on public.trip_members;
create policy trip_members_write on public.trip_members
  for all to authenticated
  using (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

-- Expenses: every member reads the whole ledger, and every member may write to
-- it. Creator-only edit, admin delete and the dispute rules are enforced in the
-- application, against a viewer identity the database cannot see — a guest
-- companion has no account, so RLS cannot tell "Gina" from "Bob" here.
--
-- Consequence worth stating plainly: a determined member could bypass those
-- rules by calling the API directly. Tightening this needs member identity to
-- reach the database, which is the next ticket, not this one.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function public.touch_updated_at();
