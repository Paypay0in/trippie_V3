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
