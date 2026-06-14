-- ============================================================
-- 一刻：个人行动规划台 V1 后端数据模型
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.yike_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '一刻',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yike_workspaces_user_id_key unique (user_id)
);

create table if not exists public.yike_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.yike_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 1000,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yike_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.yike_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid references public.yike_areas(id) on delete set null,
  name text not null,
  goal_note text,
  acceptance_criteria text,
  next_task_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yike_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.yike_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 1000,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yike_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.yike_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  status text not null,
  title text not null,
  note text,
  raw_input text,
  area_id uuid references public.yike_areas(id) on delete set null,
  project_id uuid references public.yike_projects(id) on delete set null,
  complexity text not null,
  time_bucket text not null,
  bucket_anchor_date date,
  due_date date,
  is_urgent boolean not null default false,
  memo_granularity text not null default 'unknown',
  assignee_person_id uuid references public.yike_people(id) on delete set null,
  delegated_note text,
  follow_up_bucket text,
  source_memo_id uuid references public.yike_items(id) on delete set null,
  client_request_id text,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yike_items_item_type_check check (item_type in ('task', 'memo')),
  constraint yike_items_status_check check (status in ('planned', 'doing', 'delegated', 'done')),
  constraint yike_items_complexity_check check (complexity in ('quick', 'small', 'focus', 'deep')),
  constraint yike_items_time_bucket_check check (time_bucket in ('today', 'tomorrow', 'this_week', 'this_month', 'later')),
  constraint yike_items_memo_granularity_check check (memo_granularity in ('single', 'multiple', 'unknown')),
  constraint yike_items_follow_up_bucket_check check (
    follow_up_bucket is null
    or follow_up_bucket in ('today', 'tomorrow', 'this_week', 'this_month', 'later')
  )
);

alter table public.yike_projects
  drop constraint if exists yike_projects_next_task_id_fkey;

alter table public.yike_projects
  add constraint yike_projects_next_task_id_fkey
  foreign key (next_task_id) references public.yike_items(id) on delete set null;

create table if not exists public.yike_execution_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.yike_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_key text not null,
  item_id uuid references public.yike_items(id) on delete set null,
  project_id uuid references public.yike_projects(id) on delete set null,
  filled_reason text not null default 'auto',
  filled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yike_execution_slots_slot_key_check check (
    slot_key in ('primary_task', 'candidate_1', 'candidate_2', 'project_focus')
  ),
  constraint yike_execution_slots_filled_reason_check check (filled_reason in ('auto', 'manual')),
  constraint yike_execution_slots_target_check check (
    (
      slot_key in ('primary_task', 'candidate_1', 'candidate_2')
      and item_id is not null
      and project_id is null
    )
    or (
      slot_key = 'project_focus'
      and project_id is not null
      and item_id is null
    )
  ),
  constraint yike_execution_slots_workspace_slot_key unique (workspace_id, slot_key)
);

create table if not exists public.yike_item_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.yike_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.yike_items(id) on delete set null,
  project_id uuid references public.yike_projects(id) on delete set null,
  event_type text not null,
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_yike_workspaces_user_id
  on public.yike_workspaces (user_id);

create index if not exists idx_yike_areas_workspace_id
  on public.yike_areas (workspace_id);

create index if not exists idx_yike_areas_user_sort_active
  on public.yike_areas (user_id, sort_order, id)
  where archived_at is null;

create unique index if not exists idx_yike_areas_user_name_active
  on public.yike_areas (user_id, lower(name))
  where archived_at is null;

create index if not exists idx_yike_projects_workspace_id
  on public.yike_projects (workspace_id);

create index if not exists idx_yike_projects_user_archived_created
  on public.yike_projects (user_id, archived_at, created_at);

create index if not exists idx_yike_projects_user_area_active
  on public.yike_projects (user_id, area_id)
  where archived_at is null;

create index if not exists idx_yike_projects_next_task_id
  on public.yike_projects (next_task_id)
  where next_task_id is not null;

create index if not exists idx_yike_people_workspace_id
  on public.yike_people (workspace_id);

create index if not exists idx_yike_people_user_sort_active
  on public.yike_people (user_id, sort_order, id)
  where archived_at is null;

create index if not exists idx_yike_items_workspace_id
  on public.yike_items (workspace_id);

create index if not exists idx_yike_items_user_status_archived
  on public.yike_items (user_id, status, archived_at);

create index if not exists idx_yike_items_status_sort_active
  on public.yike_items (user_id, status, area_id, complexity, item_type, created_at, id)
  where archived_at is null;

create index if not exists idx_yike_items_project_status_active
  on public.yike_items (user_id, project_id, status)
  where archived_at is null;

create index if not exists idx_yike_items_area_active
  on public.yike_items (user_id, area_id)
  where archived_at is null;

create index if not exists idx_yike_items_assignee_person_id
  on public.yike_items (assignee_person_id);

create index if not exists idx_yike_items_source_memo_id
  on public.yike_items (source_memo_id);

create index if not exists idx_yike_items_due_date_active
  on public.yike_items (user_id, due_date)
  where due_date is not null and archived_at is null;

create index if not exists idx_yike_items_urgent_active
  on public.yike_items (user_id, is_urgent)
  where is_urgent = true and archived_at is null;

create unique index if not exists idx_yike_items_client_request_id
  on public.yike_items (user_id, client_request_id)
  where client_request_id is not null;

create index if not exists idx_yike_execution_slots_workspace_id
  on public.yike_execution_slots (workspace_id);

create index if not exists idx_yike_execution_slots_user_id
  on public.yike_execution_slots (user_id);

create index if not exists idx_yike_execution_slots_item_id
  on public.yike_execution_slots (item_id);

create index if not exists idx_yike_execution_slots_project_id
  on public.yike_execution_slots (project_id);

create index if not exists idx_yike_item_events_workspace_id
  on public.yike_item_events (workspace_id);

create index if not exists idx_yike_item_events_user_created
  on public.yike_item_events (user_id, created_at desc);

create index if not exists idx_yike_item_events_item_id
  on public.yike_item_events (item_id);

create index if not exists idx_yike_item_events_project_id
  on public.yike_item_events (project_id);

drop trigger if exists trg_yike_workspaces_updated_at on public.yike_workspaces;
create trigger trg_yike_workspaces_updated_at
before update on public.yike_workspaces
for each row execute function public.touch_updated_at();

drop trigger if exists trg_yike_areas_updated_at on public.yike_areas;
create trigger trg_yike_areas_updated_at
before update on public.yike_areas
for each row execute function public.touch_updated_at();

drop trigger if exists trg_yike_projects_updated_at on public.yike_projects;
create trigger trg_yike_projects_updated_at
before update on public.yike_projects
for each row execute function public.touch_updated_at();

drop trigger if exists trg_yike_people_updated_at on public.yike_people;
create trigger trg_yike_people_updated_at
before update on public.yike_people
for each row execute function public.touch_updated_at();

drop trigger if exists trg_yike_items_updated_at on public.yike_items;
create trigger trg_yike_items_updated_at
before update on public.yike_items
for each row execute function public.touch_updated_at();

drop trigger if exists trg_yike_execution_slots_updated_at on public.yike_execution_slots;
create trigger trg_yike_execution_slots_updated_at
before update on public.yike_execution_slots
for each row execute function public.touch_updated_at();

alter table public.yike_workspaces enable row level security;
alter table public.yike_areas enable row level security;
alter table public.yike_projects enable row level security;
alter table public.yike_people enable row level security;
alter table public.yike_items enable row level security;
alter table public.yike_execution_slots enable row level security;
alter table public.yike_item_events enable row level security;

drop policy if exists "users read own yike workspaces" on public.yike_workspaces;
create policy "users read own yike workspaces"
  on public.yike_workspaces for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike workspaces" on public.yike_workspaces;
create policy "users insert own yike workspaces"
  on public.yike_workspaces for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own yike workspaces" on public.yike_workspaces;
create policy "users update own yike workspaces"
  on public.yike_workspaces for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users read own yike areas" on public.yike_areas;
create policy "users read own yike areas"
  on public.yike_areas for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike areas" on public.yike_areas;
create policy "users insert own yike areas"
  on public.yike_areas for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own yike areas" on public.yike_areas;
create policy "users update own yike areas"
  on public.yike_areas for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users read own yike projects" on public.yike_projects;
create policy "users read own yike projects"
  on public.yike_projects for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike projects" on public.yike_projects;
create policy "users insert own yike projects"
  on public.yike_projects for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own yike projects" on public.yike_projects;
create policy "users update own yike projects"
  on public.yike_projects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users read own yike people" on public.yike_people;
create policy "users read own yike people"
  on public.yike_people for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike people" on public.yike_people;
create policy "users insert own yike people"
  on public.yike_people for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own yike people" on public.yike_people;
create policy "users update own yike people"
  on public.yike_people for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users read own yike items" on public.yike_items;
create policy "users read own yike items"
  on public.yike_items for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike items" on public.yike_items;
create policy "users insert own yike items"
  on public.yike_items for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own yike items" on public.yike_items;
create policy "users update own yike items"
  on public.yike_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users read own yike execution slots" on public.yike_execution_slots;
create policy "users read own yike execution slots"
  on public.yike_execution_slots for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike execution slots" on public.yike_execution_slots;
create policy "users insert own yike execution slots"
  on public.yike_execution_slots for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own yike execution slots" on public.yike_execution_slots;
create policy "users update own yike execution slots"
  on public.yike_execution_slots for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users read own yike item events" on public.yike_item_events;
create policy "users read own yike item events"
  on public.yike_item_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own yike item events" on public.yike_item_events;
create policy "users insert own yike item events"
  on public.yike_item_events for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.yike_workspaces to authenticated;
grant select, insert, update on public.yike_areas to authenticated;
grant select, insert, update on public.yike_projects to authenticated;
grant select, insert, update on public.yike_people to authenticated;
grant select, insert, update on public.yike_items to authenticated;
grant select, insert, update on public.yike_execution_slots to authenticated;
grant select, insert on public.yike_item_events to authenticated;

grant all on public.yike_workspaces to service_role;
grant all on public.yike_areas to service_role;
grant all on public.yike_projects to service_role;
grant all on public.yike_people to service_role;
grant all on public.yike_items to service_role;
grant all on public.yike_execution_slots to service_role;
grant all on public.yike_item_events to service_role;
