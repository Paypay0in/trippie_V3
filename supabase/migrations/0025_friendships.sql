-- Who is friends with whom.
--
-- 「我希望可以互相加好友」.
--
-- The app has had a `friends` list since the beginning: read from localStorage
-- at startup, passed down to the trip roster and the companions sheet, and
-- never written to by anything. There is no code path that makes anyone a
-- friend, so the list is empty on every device and always has been. This is
-- the table that was missing underneath it.
--
-- One row per direction of asking, not one per pair: a request has a sender,
-- and 「A asked B」 and 「B asked A」 are different events that may both exist
-- before either is answered. The pair is the primary key so the same person
-- cannot queue two requests at the same person.
create table if not exists public.friendships (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  -- Nobody is their own friend, and the question would break every query that
  -- joins this table to itself.
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- Both directions are read constantly: 「who are my friends」 asks for rows where
-- I am either side.
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

-- You can see a row only if you are in it. A friend list is not public: who
-- somebody knows is as private as what they post to those people.
drop policy if exists friendships_visible_to_both on public.friendships;
create policy friendships_visible_to_both on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- You may only ask on your own behalf.
drop policy if exists friendships_request_as_self on public.friendships;
create policy friendships_request_as_self on public.friendships
  for insert with check (auth.uid() = requester_id);

-- Only the person who was asked may accept, and only their own row.
drop policy if exists friendships_answer_as_addressee on public.friendships;
create policy friendships_answer_as_addressee on public.friendships
  for update using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);

-- Either side may end it: unfriending is not something you need permission for,
-- and withdrawing a request you sent is the same operation.
drop policy if exists friendships_remove_by_either on public.friendships;
create policy friendships_remove_by_either on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);
