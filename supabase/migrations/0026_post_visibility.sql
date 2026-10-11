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
