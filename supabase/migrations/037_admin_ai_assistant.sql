-- 037: Admin AI assistant tables, audit, and RLS
-- 已删除废弃的 system_issues 表（从未在代码中使用）

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
