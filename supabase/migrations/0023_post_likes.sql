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
