-- Help requests: one coherent job, several checklist tasks.
--
-- v1 is requester-only. There is no provider side yet — no responses, no
-- bidding, no assignment, no payment — so the policies below say exactly that:
-- a request is readable and writable by the person who created it and by
-- nobody else. Opening it to helpers is a later migration and a deliberate
-- decision, not something that should happen by leaving a policy loose today.

create table if not exists public.service_requests (
  id text primary key,
  trip_id text not null,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('task_bundle', 'consultation', 'accompaniment')),
  title text not null,
  goal text,
  service_category text not null check (
    service_category in ('booking', 'translation', 'consultation', 'on_site', 'other')
  ),
  location text not null default '',
  -- Null unless the traveller said so. A date invented from the trip range
  -- would be something a helper acts on.
  requested_date date,
  requested_time text,
  language_needs text[] not null default '{}',
  assistance_needs text[] not null default '{}',
  status text not null default 'requested' check (
    status in ('requested', 'in_progress', 'completed', 'cancelled')
  ),
  created_at timestamptz not null default now()
);

-- The tasks inside a request.
--
-- source_task_id is the canonical checklist id and task_name is a snapshot of
-- its wording at publication. The snapshot is here because checklist tasks are
-- not cloud-synced yet: without it the request would read as a list of blank
-- lines on any other device. Nothing in this table is ever written back to the
-- checklist — publishing is not completing.
create table if not exists public.service_request_tasks (
  request_id text not null references public.service_requests(id) on delete cascade,
  source_task_id text not null,
  task_name text not null,
  position integer not null default 0,
  primary key (request_id, source_task_id)
);

create index if not exists service_requests_requester_idx
  on public.service_requests (requested_by_user_id, created_at desc);

alter table public.service_requests enable row level security;
alter table public.service_request_tasks enable row level security;

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (requested_by_user_id = auth.uid());

drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests
  for insert to authenticated
  with check (requested_by_user_id = auth.uid());

drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (requested_by_user_id = auth.uid())
  with check (requested_by_user_id = auth.uid());

drop policy if exists service_requests_delete on public.service_requests;
create policy service_requests_delete on public.service_requests
  for delete to authenticated
  using (requested_by_user_id = auth.uid());

-- A task row is reachable exactly where its request is.
drop policy if exists service_request_tasks_select on public.service_request_tasks;
create policy service_request_tasks_select on public.service_request_tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.service_requests r
      where r.id = request_id and r.requested_by_user_id = auth.uid()
    )
  );

drop policy if exists service_request_tasks_insert on public.service_request_tasks;
create policy service_request_tasks_insert on public.service_request_tasks
  for insert to authenticated
  with check (
    exists (
      select 1 from public.service_requests r
      where r.id = request_id and r.requested_by_user_id = auth.uid()
    )
  );

drop policy if exists service_request_tasks_delete on public.service_request_tasks;
create policy service_request_tasks_delete on public.service_request_tasks
  for delete to authenticated
  using (
    exists (
      select 1 from public.service_requests r
      where r.id = request_id and r.requested_by_user_id = auth.uid()
    )
  );
