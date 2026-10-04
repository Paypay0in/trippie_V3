-- Close the anonymous EXECUTE grants that Supabase's default function
-- privileges left behind when the earlier migrations created these helpers.
--
-- Only invite preview is intentionally public before sign-in. Creating or
-- claiming an invite, and the membership helper used by RLS, require an
-- authenticated caller.

begin;

revoke execute on function public.create_trip_invite(text, text) from anon;
revoke execute on function public.claim_trip_invite(text) from anon;
revoke execute on function public.is_trip_member(text) from anon;

-- Reassert the intended grants so this migration remains safe to re-run after
-- role/default-privilege changes.
grant execute on function public.create_trip_invite(text, text) to authenticated;
grant execute on function public.claim_trip_invite(text) to authenticated;
grant execute on function public.is_trip_member(text) to authenticated;
grant execute on function public.peek_trip_invite(text) to anon, authenticated;

commit;
