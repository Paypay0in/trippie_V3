-- What travellers did with the plans Trippie proposed.
--
-- Raw behaviour, deliberately. There is no column here for "budget traveller"
-- or a preference score, because a label derived from one evening would then be
-- applied forever, and the same person travels differently with their parents
-- than with their friends. Taste is inferred later, in context, from many rows.
--
-- Being shown an option is not evidence of anything — everything on screen was
-- shown. Which option was chosen over which alternatives, what was dismissed,
-- and what was later edited or deleted are the signals worth keeping, so the
-- alternatives ride along with every selection.

create table if not exists public.plan_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null,
  -- Stable from the first plan response, so every later event about that set of
  -- options points at something that still exists.
  request_id text not null,
  type text not null check (
    type in ('options_shown', 'option_selected', 'option_dismissed',
             'added_to_itinerary', 'item_edited', 'item_deleted')
  ),
  option_id text,
  alternative_option_ids text[] not null default '{}',
  characteristics text[] not null default '{}',
  -- Only ever a verified range. A remembered price stored as a number becomes,
  -- months later, evidence about what this person will pay.
  budget_min numeric,
  budget_max numeric,
  currency text,
  resulting_itinerary_item_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists plan_events_user_idx on public.plan_events (user_id, created_at desc);
create index if not exists plan_events_request_idx on public.plan_events (request_id);

alter table public.plan_events enable row level security;

-- A person's behavioural history is theirs. No shared read, by anyone, in any
-- direction: opening this up later has to be a deliberate migration rather than
-- something a loose policy allowed today.
drop policy if exists plan_events_select on public.plan_events;
create policy plan_events_select on public.plan_events
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists plan_events_insert on public.plan_events;
create policy plan_events_insert on public.plan_events
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists plan_events_delete on public.plan_events;
create policy plan_events_delete on public.plan_events
  for delete to authenticated
  using (user_id = auth.uid());
