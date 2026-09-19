-- Joining someone else's trip.
--
-- Before this there was no way in. A companion existed as a name on the
-- owner's device; the person it named had no account attached, so the roster
-- said "Gina" while Gina's phone showed an empty app.
--
-- The chicken-and-egg is the whole problem. `trip_members_select` requires
-- already being a member and `trip_members_write` requires being the owner,
-- so the one person who needs to write a row is the one person refused by
-- both. Loosening either policy would open every trip to everyone. So the
-- join happens inside a security-definer function instead: a narrow, audited
-- hole rather than a wide one.
--
-- The token is the authorisation. Knowing the link is what grants the right
-- to claim the seat, which is why the table has no select policy at all —
-- nothing reads it directly, only the functions below.

create table if not exists public.trip_invites (
  token text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  -- The seat being offered. An invite claims an existing companion row rather
  -- than creating one, which is what stops 「Gina」 and 「Gina」 both appearing
  -- on the roster after she joins.
  member_id text not null references public.trip_members (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  -- One live invite per seat. Re-inviting the same companion replaces the
  -- old link rather than leaving two valid ways in.
  unique (trip_id, member_id)
);

create index if not exists trip_invites_trip_id_idx on public.trip_invites (trip_id);

alter table public.trip_invites enable row level security;
-- Deliberately no policies. Every path goes through the functions below, so
-- the table cannot be enumerated even by someone holding one valid token.

-- ---------------------------------------------------------------------------
-- Create
-- ---------------------------------------------------------------------------

create or replace function public.create_trip_invite(
  target_trip_id text,
  target_member_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  -- Only the owner hands out seats.
  if not exists (
    select 1 from public.trips t
    where t.id = target_trip_id and t.owner_id = auth.uid()
  ) then
    raise exception 'not the trip owner';
  end if;

  if not exists (
    select 1 from public.trip_members m
    where m.id = target_member_id and m.trip_id = target_trip_id
  ) then
    raise exception 'member does not belong to this trip';
  end if;

  new_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.trip_invites (token, trip_id, member_id, created_by)
  values (new_token, target_trip_id, target_member_id, auth.uid())
  on conflict (trip_id, member_id) do update
    set token = excluded.token,
        created_by = excluded.created_by,
        created_at = now(),
        expires_at = now() + interval '30 days',
        claimed_by = null,
        claimed_at = null;

  return new_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Peek — what am I being invited to?
-- ---------------------------------------------------------------------------

-- Readable before signing in, so the page can say 「North 邀請你加入 釜山」
-- rather than demanding an account for an unexplained link. Returns the trip's
-- name and the seat's name and nothing else: no dates, no itinerary, no
-- members, nothing that would make a leaked link worth harvesting.
create or replace function public.peek_trip_invite(invite_token text)
returns table (trip_name text, member_name text, already_claimed boolean)
language sql
security definer
set search_path = public
as $$
  select t.name, m.name, i.claimed_at is not null
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  join public.trip_members m on m.id = i.member_id
  where i.token = invite_token
    and i.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------------------

create or replace function public.claim_trip_invite(invite_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.trip_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to join';
  end if;

  select * into invite
  from public.trip_invites
  where token = invite_token and expires_at > now();

  if not found then
    raise exception 'invite not found or expired';
  end if;

  -- Already on this trip through some other seat: hand back the trip and
  -- change nothing. Joining twice must not produce a second roster entry,
  -- and re-opening the link later must not fail in the traveller's face.
  if exists (
    select 1 from public.trip_members m
    where m.trip_id = invite.trip_id and m.user_id = auth.uid()
  ) then
    return invite.trip_id;
  end if;

  -- The seat is claimed, not created.
  update public.trip_members
  set user_id = auth.uid()
  where id = invite.member_id
    and trip_id = invite.trip_id
    -- Never steal a seat somebody already holds.
    and user_id is null;

  if not found then
    raise exception 'this seat has already been taken';
  end if;

  update public.trip_invites
  set claimed_by = auth.uid(), claimed_at = now()
  where token = invite_token;

  return invite.trip_id;
end;
$$;

revoke all on function public.create_trip_invite(text, text) from public;
revoke all on function public.peek_trip_invite(text) from public;
revoke all on function public.claim_trip_invite(text) from public;

grant execute on function public.create_trip_invite(text, text) to authenticated;
-- Anonymous may look, never join.
grant execute on function public.peek_trip_invite(text) to anon, authenticated;
grant execute on function public.claim_trip_invite(text) to authenticated;
