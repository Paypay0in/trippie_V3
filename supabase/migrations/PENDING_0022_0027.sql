-- Trippie — 待執行的六個 migration，0022 到 0027。
-- 全部可重複執行（if not exists / or replace / drop policy if exists）。
-- 產生於 2026-10-14 01:33，對應 6f5b7dc。

-- ───────────────────────────────────────────
-- 0022_expense_not_duplicate_of.sql
-- ───────────────────────────────────────────
-- Bills already declared to be different purchases.
--
-- 「這每次都跳出詢問 我已經回答過了」.
--
-- The duplicate check pairs records that share a currency, an amount and a day.
-- Korean prices are round, so it pairs a 2,000 won coffee with a 2,000 won
-- packet of stomach medicine, and a traveller tidying an old ledger is asked
-- about fourteen such pairs at once. Answering is fine. Being asked again every
-- single time the trip is opened is not — it turns a question into something to
-- tap through, which is how the one real duplicate in the list gets merged by
-- accident along with thirteen that are not.
--
-- The answer was first written onto the record and then kept on the device,
-- because the cloud had nowhere to put it: a shared trip hydrates from this
-- table on every open, so anything the mapping cannot carry is wiped by the
-- next snapshot. On the device it survives, and the other traveller is asked
-- the same fourteen questions for themselves.
--
-- Here it is shared, which is what it always was: a fact about two purchases,
-- not an opinion one phone holds. Written on both sides so the pair is settled
-- whichever record is looked at next, and nullable because a bill nobody has
-- been asked about is simply unasked.
alter table public.expenses
  add column if not exists not_duplicate_of text[];

-- ───────────────────────────────────────────
-- 0023_post_likes.sql
-- ───────────────────────────────────────────
-- Who liked which post.
--
-- 「有留言跟愛心數」.
--
-- The heart in the feed has always been component state rendering
-- `{isLiked ? 1 : 0}` — a public-looking tally that was only ever the reader's
-- own tap, reset by the next reload and never seen by anyone else. A post
-- somebody did like still read 0 to its author.
--
-- Comments went to the server a while ago and are real; likes never did. This
-- is the missing half, shaped the same way: one row per person per post, so a
-- count is a count of people rather than a number somebody typed.
--
-- The primary key is the pair, which makes liking twice impossible at the
-- database rather than at whichever screen happens to call it — the UI already
-- gets this wrong once per round trip on a slow connection.
create table if not exists public.post_likes (
  post_id text not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Counting a post's likes is the common read, and it is a lookup by post.
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

-- Anyone signed in can see the count; a like is public by the nature of being
-- a public signal on a public post.
drop policy if exists post_likes_readable on public.post_likes;
create policy post_likes_readable on public.post_likes
  for select using (true);

-- You may only add and remove your own. Without this a client could like on
-- somebody else's behalf, which is the whole value of the number gone.
drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
  for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────
-- 0024_profile_cover_url.sql
-- ───────────────────────────────────────────
-- The photo across the top of a profile.
--
-- 「100%還原」 — the account page opens on a cover with 更換封面 on it, and
-- `profiles` has display_name, avatar_url and bio and nowhere to put it. The
-- screen was built anyway and keeps the cover on the device, keyed by account,
-- so it works today and does not follow anybody to a second phone.
--
-- Nullable, because a profile without a cover is an ordinary profile and not
-- an incomplete one. Text rather than a storage reference, matching avatar_url
-- and cover_image on community_posts: images in this app are downscaled data
-- URLs for now, and object storage is a separate decision that should be made
-- for all of them at once rather than for this column alone.
alter table public.profiles
  add column if not exists cover_url text;

-- ───────────────────────────────────────────
-- 0025_friendships.sql
-- ───────────────────────────────────────────
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

-- ───────────────────────────────────────────
-- 0026_post_visibility.sql
-- ───────────────────────────────────────────
-- Who a post is for.
--
-- 「可以看對方公開 或是設定好友可以看的旅行貼文」.
--
-- A post has had two states: draft and published, shown as 僅自己可見 and 公開.
-- That is a switch, and what is wanted is three positions — mine, my friends',
-- everyone's.
--
-- Added beside `status` rather than replacing it, because the two answer
-- different questions and collapsing them would need every existing row
-- reinterpreted. `status` says whether the post has been put out at all;
-- `visibility` says who it went out to. 僅自己可見 stays what it already is, a
-- draft, so nothing written before tonight changes meaning.
--
-- Defaults to 'public': every row that exists today was published under a UI
-- whose only published state was public, and silently narrowing somebody's
-- audience would be the worse error of the two.
alter table public.community_posts
  add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'community_posts_visibility_check'
  ) then
    alter table public.community_posts
      add constraint community_posts_visibility_check
      check (visibility in ('public', 'friends'));
  end if;
end $$;

-- The feed reads published posts and then has to decide which of them this
-- reader may see, so visibility is part of that lookup.
create index if not exists community_posts_visibility_idx
  on public.community_posts (status, visibility);

-- ───────────────────────────────────────────
-- 0027_find_person_by_email.sql
-- ───────────────────────────────────────────
-- Finding one person by the address you already know.
--
-- 「可以互相加好友」, answered with search rather than invite links.
--
-- Email lives in auth.users, which clients cannot read and must not: that
-- table is every account on the service. `profiles` has no email column and is
-- not getting one, because a column is a list and a list can be read a row at
-- a time.
--
-- So the lookup is a function, and the shape of the function is the privacy
-- decision:
--
--   Exact match only. No prefix, no ILIKE, no trigram. A partial match is an
--   enumeration tool: 「a@」 would return everyone whose address starts that
--   way, and the directory this was meant not to be exists after all.
--
--   At most one row, and only the three fields needed to show a person to the
--   person adding them. Never the email back, so the function cannot be used
--   to confirm a guess about somebody's address beyond the one already typed.
--
--   Callers must be signed in. An anonymous visitor has no one to befriend and
--   no reason to ask whether an address has an account.
--
-- What this still permits, stated rather than hidden: somebody who already
-- knows an exact address can learn whether it has a Trippie account and see
-- that person's display name and avatar. That is the cost of search-by-email,
-- and it is the cost the Founder accepted when choosing it over invite links.
create or replace function public.find_person_by_email(lookup_email text)
returns table (id uuid, display_name text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and auth.uid() <> p.id
    and lower(u.email) = lower(trim(lookup_email))
  limit 1;
$$;

revoke all on function public.find_person_by_email(text) from public;
grant execute on function public.find_person_by_email(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 0029: whether the ticket for an itinerary stop has been bought.
--
-- 「並且像代辦清單 要可以打勾的」.
--
-- The list of places needing a ticket is derived from the plan and stays
-- derived. 「I bought that one」 is the opposite — nothing in the plan implies
-- it — so it is the one thing here that has to be stored.
--
-- Until this runs the tick lives in localStorage (`services/ticketsBought`)
-- and does not travel between the two phones, which the panel says out loud.
-- Nothing is wired into `tripSyncMapping` before the column exists.
alter table public.itinerary_items
  add column if not exists ticket_bought boolean not null default false;
