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
