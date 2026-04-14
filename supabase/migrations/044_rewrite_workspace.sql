-- 044: 员工端文案改写工作台

create table if not exists public.rewrite_model_views (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_modes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  mode_prompt text not null,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_length_presets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  length_prompt text not null,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_workflows (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.rewrite_workflows(id) on delete cascade,
  step_key text not null,
  name text not null,
  description text,
  step_prompt text not null,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (workflow_id, step_key)
);

create table if not exists public.rewrite_model_routes (
  id uuid primary key default gen_random_uuid(),
  model_view_id uuid not null references public.rewrite_model_views(id) on delete cascade,
  workflow_step_id uuid references public.rewrite_workflow_steps(id) on delete set null,
  channel_id uuid not null references public.ai_channels(id),
  actual_model text not null,
  priority int not null default 100,
  weight int not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '新会话',
  auto_mode_enabled boolean not null default true,
  selected_model_view_id uuid references public.rewrite_model_views(id) on delete set null,
  selected_mode_id uuid references public.rewrite_modes(id) on delete set null,
  selected_length_preset_id uuid references public.rewrite_length_presets(id) on delete set null,
  last_message_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.rewrite_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system_note')),
  generation_mode text check (generation_mode in ('auto', 'single')),
  message_status text check (message_status in ('success', 'partial_success', 'failed')),
  content text not null default '',
  structured_result jsonb,
  request_snapshot jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_rewrite_model_views_enabled_sort
  on public.rewrite_model_views(is_enabled, sort_order asc);

create index if not exists idx_rewrite_modes_enabled_sort
  on public.rewrite_modes(is_enabled, sort_order asc);

create index if not exists idx_rewrite_length_presets_enabled_sort
  on public.rewrite_length_presets(is_enabled, sort_order asc);

create index if not exists idx_rewrite_workflows_enabled_sort
  on public.rewrite_workflows(is_enabled, sort_order asc);

create index if not exists idx_rewrite_workflow_steps_workflow_sort
  on public.rewrite_workflow_steps(workflow_id, is_enabled, sort_order asc);

create index if not exists idx_rewrite_model_routes_lookup
  on public.rewrite_model_routes(model_view_id, workflow_step_id, is_enabled, priority asc, weight desc);

create index if not exists idx_rewrite_conversations_user_last_message
  on public.rewrite_conversations(user_id, last_message_at desc, created_at desc);

create index if not exists idx_rewrite_messages_conversation_created
  on public.rewrite_messages(conversation_id, created_at asc);

create index if not exists idx_rewrite_messages_user_created
  on public.rewrite_messages(user_id, created_at desc);

create or replace function public.set_rewrite_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.touch_rewrite_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rewrite_conversations
  set
    last_message_at = new.created_at,
    updated_at = timezone('utc'::text, now())
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists set_rewrite_model_views_updated_at on public.rewrite_model_views;
create trigger set_rewrite_model_views_updated_at
before update on public.rewrite_model_views
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists set_rewrite_modes_updated_at on public.rewrite_modes;
create trigger set_rewrite_modes_updated_at
before update on public.rewrite_modes
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists set_rewrite_length_presets_updated_at on public.rewrite_length_presets;
create trigger set_rewrite_length_presets_updated_at
before update on public.rewrite_length_presets
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists set_rewrite_workflows_updated_at on public.rewrite_workflows;
create trigger set_rewrite_workflows_updated_at
before update on public.rewrite_workflows
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists set_rewrite_workflow_steps_updated_at on public.rewrite_workflow_steps;
create trigger set_rewrite_workflow_steps_updated_at
before update on public.rewrite_workflow_steps
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists set_rewrite_model_routes_updated_at on public.rewrite_model_routes;
create trigger set_rewrite_model_routes_updated_at
before update on public.rewrite_model_routes
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists set_rewrite_conversations_updated_at on public.rewrite_conversations;
create trigger set_rewrite_conversations_updated_at
before update on public.rewrite_conversations
for each row
execute function public.set_rewrite_updated_at();

drop trigger if exists touch_rewrite_conversation_last_message on public.rewrite_messages;
create trigger touch_rewrite_conversation_last_message
after insert on public.rewrite_messages
for each row
execute function public.touch_rewrite_conversation_last_message();

alter table public.rewrite_model_views enable row level security;
alter table public.rewrite_modes enable row level security;
alter table public.rewrite_length_presets enable row level security;
alter table public.rewrite_workflows enable row level security;
alter table public.rewrite_workflow_steps enable row level security;
alter table public.rewrite_model_routes enable row level security;
alter table public.rewrite_conversations enable row level security;
alter table public.rewrite_messages enable row level security;

drop policy if exists "rewrite_model_views_read_enabled" on public.rewrite_model_views;
drop policy if exists "rewrite_model_views_owner_full" on public.rewrite_model_views;
drop policy if exists "rewrite_model_views_service_role_bypass" on public.rewrite_model_views;
create policy "rewrite_model_views_read_enabled"
  on public.rewrite_model_views
  for select
  using (auth.role() = 'authenticated' and is_enabled = true);
create policy "rewrite_model_views_owner_full"
  on public.rewrite_model_views
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_model_views_service_role_bypass"
  on public.rewrite_model_views
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_modes_read_enabled" on public.rewrite_modes;
drop policy if exists "rewrite_modes_owner_full" on public.rewrite_modes;
drop policy if exists "rewrite_modes_service_role_bypass" on public.rewrite_modes;
create policy "rewrite_modes_read_enabled"
  on public.rewrite_modes
  for select
  using (auth.role() = 'authenticated' and is_enabled = true);
create policy "rewrite_modes_owner_full"
  on public.rewrite_modes
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_modes_service_role_bypass"
  on public.rewrite_modes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_length_presets_read_enabled" on public.rewrite_length_presets;
drop policy if exists "rewrite_length_presets_owner_full" on public.rewrite_length_presets;
drop policy if exists "rewrite_length_presets_service_role_bypass" on public.rewrite_length_presets;
create policy "rewrite_length_presets_read_enabled"
  on public.rewrite_length_presets
  for select
  using (auth.role() = 'authenticated' and is_enabled = true);
create policy "rewrite_length_presets_owner_full"
  on public.rewrite_length_presets
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_length_presets_service_role_bypass"
  on public.rewrite_length_presets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_workflows_read_enabled" on public.rewrite_workflows;
drop policy if exists "rewrite_workflows_owner_full" on public.rewrite_workflows;
drop policy if exists "rewrite_workflows_service_role_bypass" on public.rewrite_workflows;
create policy "rewrite_workflows_read_enabled"
  on public.rewrite_workflows
  for select
  using (auth.role() = 'authenticated' and is_enabled = true);
create policy "rewrite_workflows_owner_full"
  on public.rewrite_workflows
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_workflows_service_role_bypass"
  on public.rewrite_workflows
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_workflow_steps_read_enabled" on public.rewrite_workflow_steps;
drop policy if exists "rewrite_workflow_steps_owner_full" on public.rewrite_workflow_steps;
drop policy if exists "rewrite_workflow_steps_service_role_bypass" on public.rewrite_workflow_steps;
create policy "rewrite_workflow_steps_read_enabled"
  on public.rewrite_workflow_steps
  for select
  using (
    auth.role() = 'authenticated'
    and is_enabled = true
    and exists (
      select 1
      from public.rewrite_workflows
      where rewrite_workflows.id = workflow_id
        and rewrite_workflows.is_enabled = true
    )
  );
create policy "rewrite_workflow_steps_owner_full"
  on public.rewrite_workflow_steps
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_workflow_steps_service_role_bypass"
  on public.rewrite_workflow_steps
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_model_routes_owner_full" on public.rewrite_model_routes;
drop policy if exists "rewrite_model_routes_service_role_bypass" on public.rewrite_model_routes;
create policy "rewrite_model_routes_owner_full"
  on public.rewrite_model_routes
  for all
  using (public.is_owner())
  with check (public.is_owner());
create policy "rewrite_model_routes_service_role_bypass"
  on public.rewrite_model_routes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_conversations_select_own" on public.rewrite_conversations;
drop policy if exists "rewrite_conversations_insert_own" on public.rewrite_conversations;
drop policy if exists "rewrite_conversations_update_own" on public.rewrite_conversations;
drop policy if exists "rewrite_conversations_delete_own" on public.rewrite_conversations;
drop policy if exists "rewrite_conversations_service_role_bypass" on public.rewrite_conversations;
create policy "rewrite_conversations_select_own"
  on public.rewrite_conversations
  for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "rewrite_conversations_insert_own"
  on public.rewrite_conversations
  for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "rewrite_conversations_update_own"
  on public.rewrite_conversations
  for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "rewrite_conversations_delete_own"
  on public.rewrite_conversations
  for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "rewrite_conversations_service_role_bypass"
  on public.rewrite_conversations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "rewrite_messages_select_own" on public.rewrite_messages;
drop policy if exists "rewrite_messages_insert_own" on public.rewrite_messages;
drop policy if exists "rewrite_messages_update_own" on public.rewrite_messages;
drop policy if exists "rewrite_messages_delete_own" on public.rewrite_messages;
drop policy if exists "rewrite_messages_service_role_bypass" on public.rewrite_messages;
create policy "rewrite_messages_select_own"
  on public.rewrite_messages
  for select
  using (
    auth.role() = 'authenticated'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );
create policy "rewrite_messages_insert_own"
  on public.rewrite_messages
  for insert
  with check (
    auth.role() = 'authenticated'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );
create policy "rewrite_messages_update_own"
  on public.rewrite_messages
  for update
  using (
    auth.role() = 'authenticated'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );
create policy "rewrite_messages_delete_own"
  on public.rewrite_messages
  for delete
  using (
    auth.role() = 'authenticated'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );
create policy "rewrite_messages_service_role_bypass"
  on public.rewrite_messages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.rewrite_model_views to authenticated;
grant select, insert, update, delete on public.rewrite_modes to authenticated;
grant select, insert, update, delete on public.rewrite_length_presets to authenticated;
grant select, insert, update, delete on public.rewrite_workflows to authenticated;
grant select, insert, update, delete on public.rewrite_workflow_steps to authenticated;
grant select, insert, update, delete on public.rewrite_model_routes to authenticated;
grant select, insert, update, delete on public.rewrite_conversations to authenticated;
grant select, insert, update, delete on public.rewrite_messages to authenticated;

grant select, insert, update, delete on public.rewrite_model_views to service_role;
grant select, insert, update, delete on public.rewrite_modes to service_role;
grant select, insert, update, delete on public.rewrite_length_presets to service_role;
grant select, insert, update, delete on public.rewrite_workflows to service_role;
grant select, insert, update, delete on public.rewrite_workflow_steps to service_role;
grant select, insert, update, delete on public.rewrite_model_routes to service_role;
grant select, insert, update, delete on public.rewrite_conversations to service_role;
grant select, insert, update, delete on public.rewrite_messages to service_role;

insert into public.ai_feature_config (feature_key, label)
values ('content_rewrite', '员工文案改写')
on conflict (feature_key) do nothing;

insert into public.rewrite_model_views (key, label, description, sort_order, is_default)
values
  ('gemini', 'Gemini', '盲盒展示名，实际执行模型走后台路由配置', 10, true),
  ('opus', 'Opus', '盲盒展示名，实际执行模型走后台路由配置', 20, false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.rewrite_modes (key, name, description, mode_prompt, sort_order, is_default)
values
  (
    'more_explosive',
    '更像爆款',
    '更有抓力，更容易吸引用户停留',
    '保持原意不跑偏，把表达改得更抓人。优先强化开头抓力、节奏感、冲突感和传播感，但不要低俗夸张，不要编造事实。',
    10,
    false
  ),
  (
    'more_spoken',
    '更口语',
    '更像真人在说，不像书面稿',
    '保持信息准确，把表达改得更像真实口播。多用自然口语、短句和顺口衔接，减少生硬书面表达。',
    20,
    false
  ),
  (
    'more_professional',
    '更专业',
    '更稳、更可信、更有专业感',
    '保持内容准确和边界清晰，把表达改得更专业、更可信。避免夸张词，保留关键判断依据和风险提示。',
    30,
    false
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  mode_prompt = excluded.mode_prompt,
  sort_order = excluded.sort_order;

insert into public.rewrite_length_presets (key, name, description, length_prompt, sort_order, is_default)
values
  (
    'concise',
    '精简',
    '更短，更利落，适合快节奏发布',
    '控制整体长度，优先保留最核心信息。表达尽量短、准、狠，减少重复和铺垫。',
    10,
    false
  ),
  (
    'standard',
    '标准',
    '信息完整，适合大多数场景',
    '保持信息完整和节奏平衡，不刻意压缩，也不要无意义展开。',
    20,
    true
  ),
  (
    'expanded',
    '展开',
    '适当补足解释，更完整',
    '在不跑题的前提下适度展开，把逻辑和过渡补清楚，适合需要多一点解释的场景。',
    30,
    false
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  length_prompt = excluded.length_prompt,
  sort_order = excluded.sort_order;

insert into public.rewrite_workflows (key, name, description, sort_order, is_default)
values
  (
    'default_auto_rewrite',
    '默认自动改写',
    '固定双阶段：先框架/结构改写，再做情绪/语感润色',
    10,
    true
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.rewrite_workflow_steps (workflow_id, step_key, name, description, step_prompt, sort_order)
select
  workflow.id,
  seed.step_key,
  seed.name,
  seed.description,
  seed.step_prompt,
  seed.sort_order
from public.rewrite_workflows workflow
cross join (
  values
    (
      'structure',
      '框架改写',
      '先调结构、信息排序和节奏',
      '你现在只做第一步：框架/结构改写。重点是重排信息顺序、优化开头、压缩废话、增强节奏和层次，不要在这一步过度追求情绪词。',
      10
    ),
    (
      'polish',
      '语感润色',
      '在结构稿基础上再润色情绪和语感',
      '你现在只做第二步：情绪/语感润色。基于已有结构稿，把表达变得更顺口、更有情绪张力、更适合发布，但不要改掉核心观点和事实边界。',
      20
    )
) as seed(step_key, name, description, step_prompt, sort_order)
where workflow.key = 'default_auto_rewrite'
on conflict (workflow_id, step_key) do update
set
  name = excluded.name,
  description = excluded.description,
  step_prompt = excluded.step_prompt,
  sort_order = excluded.sort_order;

with default_channel as (
  select id, model
  from public.ai_channels
  where is_enabled = true
  order by priority asc, created_at asc
  limit 1
),
seed_routes as (
  select
    view.id as model_view_id,
    channel.id as channel_id,
    coalesce(
      nullif(channel.model, ''),
      (
        select nullif(model, '')
        from public.ai_feature_config
        where feature_key = 'content_rewrite'
      ),
      (
        select nullif(model, '')
        from public.ai_feature_config
        where feature_key = 'content_tools'
      ),
      current_setting('app.ai_model', true),
      'claude-sonnet-4-6'
    ) as actual_model,
    case when view.key = 'gemini' then 10 else 20 end as priority
  from public.rewrite_model_views view
  cross join default_channel channel
  where view.key in ('gemini', 'opus')
)
insert into public.rewrite_model_routes (model_view_id, channel_id, actual_model, priority, weight)
select model_view_id, channel_id, actual_model, priority, 100
from seed_routes
where not exists (
  select 1
  from public.rewrite_model_routes existing
  where existing.model_view_id = seed_routes.model_view_id
);
