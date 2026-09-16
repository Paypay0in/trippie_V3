-- Community posts and their comments.
--
-- Until now both lived in localStorage, which means a post is readable only on
-- the device that wrote it: there is no community, only a private notebook
-- with a share button. This is the same step the trip ledger took in 0001.
--
-- Run this in the Supabase SQL editor. It is idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.community_posts (
  id text primary key,
  creator_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '旅人',
  author_avatar text,
  title text not null default '',
  content text not null default '',
  country text not null default '',
  city text not null default '',
  cover_image text,
  -- Photos are stored as downscaled data URLs, the same strings the client
  -- already holds. Not ideal — object storage is the right home for images and
  -- is the next ticket — but it keeps a post whole rather than splitting it
  -- across two systems before either is proven.
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  slices jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists community_posts_creator_idx on public.community_posts (creator_id);
create index if not exists community_posts_published_idx on public.community_posts (published_at desc);

create table if not exists public.post_comments (
  id text primary key,
  post_id text not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '旅人',
  author_avatar text,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.community_posts enable row level security;
alter table public.post_comments enable row level security;

-- Anyone signed in reads published posts; an author always sees their own,
-- including drafts. 不公開 has to mean unreadable by others, not merely hidden
-- by the client, or the setting is decoration.
drop policy if exists community_posts_select on public.community_posts;
create policy community_posts_select on public.community_posts
  for select to authenticated
  using (status = 'published' or creator_id = auth.uid());

drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert on public.community_posts
  for insert to authenticated
  with check (creator_id = auth.uid());

drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update on public.community_posts
  for update to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

drop policy if exists community_posts_delete on public.community_posts;
create policy community_posts_delete on public.community_posts
  for delete to authenticated
  using (creator_id = auth.uid());

-- Comments are readable wherever the post is readable, which the foreign key
-- and the post policy together decide.
drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id and (p.status = 'published' or p.creator_id = auth.uid())
    )
  );

drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id and (p.status = 'published' or p.creator_id = auth.uid())
    )
  );

-- Deleting a comment: its author, or the author of the post it sits under. A
-- writer must be able to clear something off their own post without waiting.
drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.community_posts p where p.id = post_id and p.creator_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists community_posts_touch_updated_at on public.community_posts;
create trigger community_posts_touch_updated_at
  before update on public.community_posts
  for each row execute function public.touch_updated_at();
