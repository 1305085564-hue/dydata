-- 048: 文案助手 V2 架构 - Skills + Documents + 渠道三层结构

-- ============================================================================
-- 一、渠道层：三层结构（中转站 → 密钥 → 模型）
-- ============================================================================

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  description text,
  priority int not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  label text not null,
  api_key text not null,
  priority int not null default 100,
  is_enabled boolean not null default true,
  unhealthy_until timestamptz,
  consecutive_failures int not null default 0,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (provider_id, label)
);

create table if not exists public.ai_provider_key_models (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.ai_provider_keys(id) on delete cascade,
  model_id text not null,
  display_name text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (key_id, model_id)
);

create index if not exists idx_ai_providers_enabled_priority
  on public.ai_providers(is_enabled, priority asc);

create index if not exists idx_ai_provider_keys_provider_enabled
  on public.ai_provider_keys(provider_id, is_enabled, priority asc);

create index if not exists idx_ai_provider_key_models_key_enabled
  on public.ai_provider_key_models(key_id, is_enabled);

-- rewrite_model_routes 增加新列指向三层组合
alter table public.rewrite_model_routes
  add column if not exists provider_key_model_id uuid
    references public.ai_provider_key_models(id) on delete set null;

create index if not exists idx_rewrite_model_routes_provider_key_model
  on public.rewrite_model_routes(provider_key_model_id);

-- ============================================================================
-- 二、Skill 层：技能定义 + 版本 + 会话注入栈
-- ============================================================================

create table if not exists public.rewrite_skills (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'private', 'public_user')),
  owner_id uuid references public.profiles(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  icon text,
  default_model_view_id uuid references public.rewrite_model_views(id) on delete set null,
  sort_order int not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (scope, key)
);

create table if not exists public.rewrite_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.rewrite_skills(id) on delete cascade,
  version int not null default 1,
  system_prompt text not null,
  meta jsonb,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (skill_id, version)
);

create table if not exists public.rewrite_conversation_skills (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.rewrite_conversations(id) on delete cascade,
  skill_id uuid not null references public.rewrite_skills(id) on delete cascade,
  skill_version_id uuid not null references public.rewrite_skill_versions(id) on delete cascade,
  position int not null,
  is_active boolean not null default true,
  injected_at timestamptz not null default timezone('utc'::text, now()),
  unique (conversation_id, skill_id)
);

create index if not exists idx_rewrite_skills_scope_enabled
  on public.rewrite_skills(scope, is_enabled, sort_order asc);

create index if not exists idx_rewrite_skill_versions_skill
  on public.rewrite_skill_versions(skill_id, version desc);

create index if not exists idx_rewrite_conversation_skills_conv
  on public.rewrite_conversation_skills(conversation_id, position asc);

-- ============================================================================
-- 三、文档层：画布 + 版本 + 段落 + 候选
-- ============================================================================

create table if not exists public.rewrite_documents (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.rewrite_conversations(id) on delete cascade,
  title text not null default '未命名文档',
  current_revision_id uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (conversation_id)
);

create table if not exists public.rewrite_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.rewrite_documents(id) on delete cascade,
  parent_revision_id uuid references public.rewrite_document_revisions(id) on delete set null,
  source_type text not null check (source_type in (
    'ai_generation', 'user_edit', 'paragraph_patch', 'variant_adopt', 'fork'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'completed', 'failed', 'aborted'
  )),
  generation_run_id uuid,
  full_content text,
  message_id uuid references public.rewrite_messages(id) on delete set null,
  meta jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rewrite_document_paragraphs (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.rewrite_document_revisions(id) on delete cascade,
  paragraph_id text not null,
  position int not null,
  content text not null,
  is_locked boolean not null default false,
  source_type text not null default 'ai' check (source_type in ('ai', 'user', 'original')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (revision_id, paragraph_id)
);

create table if not exists public.rewrite_variants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.rewrite_documents(id) on delete cascade,
  generation_run_id uuid not null,
  target_paragraph_ids text[] not null default '{}',
  content text not null,
  label text,
  is_adopted boolean not null default false,
  adopted_revision_id uuid references public.rewrite_document_revisions(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_rewrite_documents_conversation
  on public.rewrite_documents(conversation_id);

create index if not exists idx_rewrite_document_revisions_document
  on public.rewrite_document_revisions(document_id, created_at desc);

create index if not exists idx_rewrite_document_paragraphs_revision
  on public.rewrite_document_paragraphs(revision_id, position asc);

create index if not exists idx_rewrite_variants_document
  on public.rewrite_variants(document_id, is_adopted, created_at desc);

-- ============================================================================
-- 四、Generation 记录层
-- ============================================================================

create table if not exists public.rewrite_generation_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.rewrite_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_type text not null check (run_type in (
    'full_rewrite', 'paragraph_patch', 'variant_generate', 'chat_reply'
  )),
  status text not null default 'started' check (status in (
    'started', 'streaming', 'completed', 'failed', 'aborted'
  )),
  model_view_id uuid references public.rewrite_model_views(id) on delete set null,
  provider_key_model_id uuid references public.ai_provider_key_models(id) on delete set null,
  actual_model text,
  provider_name text,
  skill_version_ids uuid[] not null default '{}',
  input_snapshot jsonb,
  output_snapshot jsonb,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  estimated_cost_usd numeric(10, 6),
  elapsed_ms int,
  error_message text,
  started_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create index if not exists idx_rewrite_generation_runs_conversation
  on public.rewrite_generation_runs(conversation_id, started_at desc);

create index if not exists idx_rewrite_generation_runs_user
  on public.rewrite_generation_runs(user_id, started_at desc);

-- ============================================================================
-- 五、会话版本标记
-- ============================================================================

alter table public.rewrite_conversations
  add column if not exists schema_version int not null default 1;

create index if not exists idx_rewrite_conversations_schema_version
  on public.rewrite_conversations(schema_version);

-- ============================================================================
-- 六、RLS Policies
-- ============================================================================

-- ai_providers
alter table public.ai_providers enable row level security;

drop policy if exists "ai_providers_owner_full" on public.ai_providers;
drop policy if exists "ai_providers_service_role_bypass" on public.ai_providers;

create policy "ai_providers_owner_full"
  on public.ai_providers
  for all
  using (public.is_owner())
  with check (public.is_owner());

create policy "ai_providers_service_role_bypass"
  on public.ai_providers
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ai_provider_keys
alter table public.ai_provider_keys enable row level security;

drop policy if exists "ai_provider_keys_owner_full" on public.ai_provider_keys;
drop policy if exists "ai_provider_keys_service_role_bypass" on public.ai_provider_keys;

create policy "ai_provider_keys_owner_full"
  on public.ai_provider_keys
  for all
  using (public.is_owner())
  with check (public.is_owner());

create policy "ai_provider_keys_service_role_bypass"
  on public.ai_provider_keys
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ai_provider_key_models
alter table public.ai_provider_key_models enable row level security;

drop policy if exists "ai_provider_key_models_owner_full" on public.ai_provider_key_models;
drop policy if exists "ai_provider_key_models_service_role_bypass" on public.ai_provider_key_models;

create policy "ai_provider_key_models_owner_full"
  on public.ai_provider_key_models
  for all
  using (public.is_owner())
  with check (public.is_owner());

create policy "ai_provider_key_models_service_role_bypass"
  on public.ai_provider_key_models
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_skills
alter table public.rewrite_skills enable row level security;

drop policy if exists "rewrite_skills_read_enabled" on public.rewrite_skills;
drop policy if exists "rewrite_skills_owner_full" on public.rewrite_skills;
drop policy if exists "rewrite_skills_own_private" on public.rewrite_skills;
drop policy if exists "rewrite_skills_service_role_bypass" on public.rewrite_skills;

create policy "rewrite_skills_read_enabled"
  on public.rewrite_skills
  for select
  using (
    auth.role() = 'authenticated'
    and is_enabled = true
    and (scope = 'platform' or scope = 'public_user' or owner_id = auth.uid())
  );

create policy "rewrite_skills_owner_full"
  on public.rewrite_skills
  for all
  using (public.is_owner())
  with check (public.is_owner());

create policy "rewrite_skills_own_private"
  on public.rewrite_skills
  for all
  using (auth.role() = 'authenticated' and scope = 'private' and owner_id = auth.uid())
  with check (auth.role() = 'authenticated' and scope = 'private' and owner_id = auth.uid());

create policy "rewrite_skills_service_role_bypass"
  on public.rewrite_skills
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_skill_versions
alter table public.rewrite_skill_versions enable row level security;

drop policy if exists "rewrite_skill_versions_read" on public.rewrite_skill_versions;
drop policy if exists "rewrite_skill_versions_owner_full" on public.rewrite_skill_versions;
drop policy if exists "rewrite_skill_versions_service_role_bypass" on public.rewrite_skill_versions;

create policy "rewrite_skill_versions_read"
  on public.rewrite_skill_versions
  for select
  using (
    auth.role() = 'authenticated'
    and published_at is not null
    and exists (
      select 1
      from public.rewrite_skills
      where rewrite_skills.id = skill_id
        and rewrite_skills.is_enabled = true
        and (rewrite_skills.scope = 'platform' or rewrite_skills.scope = 'public_user' or rewrite_skills.owner_id = auth.uid())
    )
  );

create policy "rewrite_skill_versions_owner_full"
  on public.rewrite_skill_versions
  for all
  using (public.is_owner())
  with check (public.is_owner());

create policy "rewrite_skill_versions_service_role_bypass"
  on public.rewrite_skill_versions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_conversation_skills
alter table public.rewrite_conversation_skills enable row level security;

drop policy if exists "rewrite_conversation_skills_own" on public.rewrite_conversation_skills;
drop policy if exists "rewrite_conversation_skills_service_role_bypass" on public.rewrite_conversation_skills;

create policy "rewrite_conversation_skills_own"
  on public.rewrite_conversation_skills
  for all
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );

create policy "rewrite_conversation_skills_service_role_bypass"
  on public.rewrite_conversation_skills
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_documents
alter table public.rewrite_documents enable row level security;

drop policy if exists "rewrite_documents_own" on public.rewrite_documents;
drop policy if exists "rewrite_documents_service_role_bypass" on public.rewrite_documents;

create policy "rewrite_documents_own"
  on public.rewrite_documents
  for all
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_conversations
      where rewrite_conversations.id = conversation_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );

create policy "rewrite_documents_service_role_bypass"
  on public.rewrite_documents
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_document_revisions
alter table public.rewrite_document_revisions enable row level security;

drop policy if exists "rewrite_document_revisions_own" on public.rewrite_document_revisions;
drop policy if exists "rewrite_document_revisions_service_role_bypass" on public.rewrite_document_revisions;

create policy "rewrite_document_revisions_own"
  on public.rewrite_document_revisions
  for all
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_documents
      join public.rewrite_conversations on rewrite_conversations.id = rewrite_documents.conversation_id
      where rewrite_documents.id = document_id
        and rewrite_conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_documents
      join public.rewrite_conversations on rewrite_conversations.id = rewrite_documents.conversation_id
      where rewrite_documents.id = document_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );

create policy "rewrite_document_revisions_service_role_bypass"
  on public.rewrite_document_revisions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_document_paragraphs
alter table public.rewrite_document_paragraphs enable row level security;

drop policy if exists "rewrite_document_paragraphs_own" on public.rewrite_document_paragraphs;
drop policy if exists "rewrite_document_paragraphs_service_role_bypass" on public.rewrite_document_paragraphs;

create policy "rewrite_document_paragraphs_own"
  on public.rewrite_document_paragraphs
  for all
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_document_revisions
      join public.rewrite_documents on rewrite_documents.id = rewrite_document_revisions.document_id
      join public.rewrite_conversations on rewrite_conversations.id = rewrite_documents.conversation_id
      where rewrite_document_revisions.id = revision_id
        and rewrite_conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_document_revisions
      join public.rewrite_documents on rewrite_documents.id = rewrite_document_revisions.document_id
      join public.rewrite_conversations on rewrite_conversations.id = rewrite_documents.conversation_id
      where rewrite_document_revisions.id = revision_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );

create policy "rewrite_document_paragraphs_service_role_bypass"
  on public.rewrite_document_paragraphs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_variants
alter table public.rewrite_variants enable row level security;

drop policy if exists "rewrite_variants_own" on public.rewrite_variants;
drop policy if exists "rewrite_variants_service_role_bypass" on public.rewrite_variants;

create policy "rewrite_variants_own"
  on public.rewrite_variants
  for all
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_documents
      join public.rewrite_conversations on rewrite_conversations.id = rewrite_documents.conversation_id
      where rewrite_documents.id = document_id
        and rewrite_conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.rewrite_documents
      join public.rewrite_conversations on rewrite_conversations.id = rewrite_documents.conversation_id
      where rewrite_documents.id = document_id
        and rewrite_conversations.user_id = auth.uid()
    )
  );

create policy "rewrite_variants_service_role_bypass"
  on public.rewrite_variants
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- rewrite_generation_runs
alter table public.rewrite_generation_runs enable row level security;

drop policy if exists "rewrite_generation_runs_own" on public.rewrite_generation_runs;
drop policy if exists "rewrite_generation_runs_service_role_bypass" on public.rewrite_generation_runs;

create policy "rewrite_generation_runs_own"
  on public.rewrite_generation_runs
  for all
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "rewrite_generation_runs_service_role_bypass"
  on public.rewrite_generation_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 七、Grants
-- ============================================================================

grant select, insert, update, delete on public.ai_providers to authenticated;
grant select, insert, update, delete on public.ai_providers to service_role;

grant select, insert, update, delete on public.ai_provider_keys to authenticated;
grant select, insert, update, delete on public.ai_provider_keys to service_role;

grant select, insert, update, delete on public.ai_provider_key_models to authenticated;
grant select, insert, update, delete on public.ai_provider_key_models to service_role;

grant select, insert, update, delete on public.rewrite_skills to authenticated;
grant select, insert, update, delete on public.rewrite_skills to service_role;

grant select, insert, update, delete on public.rewrite_skill_versions to authenticated;
grant select, insert, update, delete on public.rewrite_skill_versions to service_role;

grant select, insert, update, delete on public.rewrite_conversation_skills to authenticated;
grant select, insert, update, delete on public.rewrite_conversation_skills to service_role;

grant select, insert, update, delete on public.rewrite_documents to authenticated;
grant select, insert, update, delete on public.rewrite_documents to service_role;

grant select, insert, update, delete on public.rewrite_document_revisions to authenticated;
grant select, insert, update, delete on public.rewrite_document_revisions to service_role;

grant select, insert, update, delete on public.rewrite_document_paragraphs to authenticated;
grant select, insert, update, delete on public.rewrite_document_paragraphs to service_role;

grant select, insert, update, delete on public.rewrite_variants to authenticated;
grant select, insert, update, delete on public.rewrite_variants to service_role;

grant select, insert, update, delete on public.rewrite_generation_runs to authenticated;
grant select, insert, update, delete on public.rewrite_generation_runs to service_role;

-- ============================================================================
-- 八、数据迁移
-- ============================================================================

-- 8.1 迁移 ai_channels → ai_providers + ai_provider_keys + ai_provider_key_models
insert into public.ai_providers (name, base_url, priority, is_enabled, created_at, updated_at)
select name, base_url, priority, is_enabled, created_at, updated_at
from public.ai_channels
on conflict (name) do nothing;

insert into public.ai_provider_keys (
  provider_id, label, api_key, priority, is_enabled,
  unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message,
  created_at, updated_at
)
select
  p.id,
  c.name || '-default',
  c.api_key,
  c.priority,
  c.is_enabled,
  c.unhealthy_until,
  c.consecutive_failures,
  c.last_failure_at,
  c.last_success_at,
  c.last_error_message,
  c.created_at,
  c.updated_at
from public.ai_channels c
join public.ai_providers p on p.name = c.name;

insert into public.ai_provider_key_models (key_id, model_id, display_name)
select
  k.id,
  coalesce(nullif(c.model, ''), 'claude-sonnet-4-6'),
  c.model
from public.ai_channels c
join public.ai_providers p on p.name = c.name
join public.ai_provider_keys k on k.provider_id = p.id and k.label = c.name || '-default'
where c.model is not null and c.model != ''
on conflict (key_id, model_id) do nothing;

-- 8.2 迁移 rewrite_fixed_modes → rewrite_skills + rewrite_skill_versions
insert into public.rewrite_skills (scope, owner_id, key, name, description, default_model_view_id, sort_order, is_enabled)
select
  'platform',
  null,
  key,
  name,
  description,
  model_view_id,
  sort_order,
  is_enabled
from public.rewrite_fixed_modes
on conflict (scope, key) do nothing;

insert into public.rewrite_skill_versions (skill_id, version, system_prompt, published_at)
select
  s.id,
  1,
  fm.fixed_prompt,
  timezone('utc'::text, now())
from public.rewrite_fixed_modes fm
join public.rewrite_skills s on s.scope = 'platform' and s.key = fm.key
on conflict (skill_id, version) do nothing;
