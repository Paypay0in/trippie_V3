-- The destination's tax-refund rule, shared with everyone on the trip.
--
-- 「Gina的介面無法看到退稅資訊」. The rule lived on the local trip draft, which
-- does not sync, so the traveller who happened to run the research was the only
-- one who could see a refund estimate. Her card fell back to 「退稅資格待確認 ·
-- 目前無法安全估算退稅金額」 while standing in the same shop as his.
--
-- Deliberately only the tax rule, not the whole TravelRules blob.
--
-- Entry rules depend on whose passport it is -- the research carries a
-- `passportCountryCode` and a residence status, which are facts about one
-- traveller and nobody else's business. A refund threshold and rate are facts
-- about Korea. Only the second kind belongs on a shared trip row.
--
-- Its own table rather than a column on `trips` for the reason flight_anchors
-- has one: only the owner may write the `trips` row, and either traveller may
-- be the one who runs the research.

begin;

create table if not exists public.trip_tax_rules (
  -- One rule per trip: a second row would be a second answer to the same
  -- question, and the card has nowhere to show two.
  trip_id text primary key references public.trips (id) on delete cascade,

  -- The `taxRefund` branch of TravelRules, as researched. JSONB because it is
  -- read as a whole and never queried across.
  rule jsonb not null default '{}'::jsonb,

  -- Whether this came from a grounded search or the model's own knowledge.
  -- The card says which, and a companion deserves the same caveat.
  rule_source text,
  -- The destination it was researched for, so a trip that changes country does
  -- not keep quoting the old country's threshold.
  destination text,
  fetched_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_tax_rules enable row level security;

drop policy if exists trip_tax_rules_select on public.trip_tax_rules;
create policy trip_tax_rules_select on public.trip_tax_rules
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists trip_tax_rules_insert on public.trip_tax_rules;
create policy trip_tax_rules_insert on public.trip_tax_rules
  for insert to authenticated
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_tax_rules_update on public.trip_tax_rules;
create policy trip_tax_rules_update on public.trip_tax_rules
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_tax_rules_delete on public.trip_tax_rules;
create policy trip_tax_rules_delete on public.trip_tax_rules
  for delete to authenticated
  using (public.is_trip_member(trip_id));

drop trigger if exists trip_tax_rules_touch_updated_at on public.trip_tax_rules;
create trigger trip_tax_rules_touch_updated_at
  before update on public.trip_tax_rules
  for each row execute function public.touch_updated_at();

commit;
