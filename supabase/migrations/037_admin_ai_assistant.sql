-- 037: Admin AI assistant tables, audit, and RLS

-- =============================
-- admin_actions: AI 操作审计
-- =============================
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  admin_id uuid not null references public.profiles(id) on delete cascade,

  action_type text not null
    check (action_type in ('query', 'modify', 'delete', 'retry_task', 'config_change', 'diagnosis')),
  action_category text not null
    check (action_category in ('user_management', 'data_correction', 'task_management', 'config', 'diagnosis')),
  target_type text,
  target_id text,

  description text not null,
  ai_reasoning text,
  tool_name text not null,
  tool_params jsonb not null default '{}'::jsonb,

  requires_confirmation boolean not null default false,
  backup_sql text,
  before_snapshot jsonb,
  after_snapshot jsonb,

  result text not null default 'success'
    check (result in ('pending_confirm', 'success', 'failed', 'cancelled')),
  error_message text,

  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_actions_admin_id on public.admin_actions(admin_id);
create index if not exists idx_admin_actions_created_at on public.admin_actions(created_at desc);
create index if not exists idx_admin_actions_action_type on public.admin_actions(action_type);
create index if not exists idx_admin_actions_result on public.admin_actions(result);
create index if not exists idx_admin_actions_conversation_id on public.admin_actions(conversation_id);
create index if not exists idx_admin_actions_pending_confirm on public.admin_actions(created_at desc)
  where result = 'pending_confirm';

grant select, insert, update on public.admin_actions to authenticated;
grant select, insert, update on public.admin_actions to service_role;

grant select, insert, update on public.system_issues to authenticated;
grant select, insert, update on public.system_issues to service_role;

alter table public.admin_actions enable row level security;

drop policy if exists "admin_actions_select_policy" on public.admin_actions;
drop policy if exists "admin_actions_insert_policy" on public.admin_actions;
drop policy if exists "admin_actions_update_policy" on public.admin_actions;

-- owner 看全部，admin 只看自己的
create policy "admin_actions_select_policy"
  on public.admin_actions
  for select
  using (
    public.is_owner()
    or (
      public.is_admin()
      and admin_id = auth.uid()
    )
  );

create policy "admin_actions_insert_policy"
  on public.admin_actions
  for insert
  with check (
    public.is_owner()
    or (
      public.is_admin()
      and admin_id = auth.uid()
    )
  );

create policy "admin_actions_update_policy"
  on public.admin_actions
  for update
  using (
    public.is_owner()
    or (
      public.is_admin()
      and admin_id = auth.uid()
    )
  )
  with check (
    public.is_owner()
    or (
      public.is_admin()
      and admin_id = auth.uid()
    )
  );

-- =============================
-- system_issues: 故障分流记录
-- =============================
create table if not exists public.system_issues (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.profiles(id) on delete cascade,
  issue_type text not null
    check (issue_type in ('code_bug', 'data_corruption', 'task_stuck', 'unknown')),
  description text not null,
  reproduction_steps text,
  ai_diagnosis text,
  related_action_id uuid references public.admin_actions(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'wont_fix')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_notes text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_system_issues_status on public.system_issues(status);
create index if not exists idx_system_issues_created_at on public.system_issues(created_at desc);
create index if not exists idx_system_issues_reported_by on public.system_issues(reported_by);

alter table public.system_issues enable row level security;

drop policy if exists "system_issues_select_policy" on public.system_issues;
drop policy if exists "system_issues_insert_policy" on public.system_issues;
drop policy if exists "system_issues_update_policy" on public.system_issues;

-- owner 看全部，admin 只看自己报告的
create policy "system_issues_select_policy"
  on public.system_issues
  for select
  using (
    public.is_owner()
    or (
      public.is_admin()
      and reported_by = auth.uid()
    )
  );

create policy "system_issues_insert_policy"
  on public.system_issues
  for insert
  with check (
    public.is_owner()
    or (
      public.is_admin()
      and reported_by = auth.uid()
    )
  );

create policy "system_issues_update_policy"
  on public.system_issues
  for update
  using (
    public.is_owner()
    or (
      public.is_admin()
      and reported_by = auth.uid()
    )
  )
  with check (
    public.is_owner()
    or (
      public.is_admin()
      and reported_by = auth.uid()
    )
  );
