-- 20260629173000: AI feature bindings unified provider-key-model routing

create table if not exists public.ai_feature_bindings (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  label text not null,
  provider_key_model_id uuid references public.ai_provider_key_models(id) on delete set null,
  system_prompt text,
  output_token_limit int not null default 3600 check (output_token_limit between 1200 and 8000),
  context_message_limit int not null default 30 check (context_message_limit between 1 and 50),
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_ai_feature_bindings_provider_key_model
  on public.ai_feature_bindings(provider_key_model_id);

drop trigger if exists set_ai_feature_bindings_updated_at on public.ai_feature_bindings;
create trigger set_ai_feature_bindings_updated_at
before update on public.ai_feature_bindings
for each row
execute function public.set_rewrite_updated_at();

alter table public.ai_feature_bindings enable row level security;

drop policy if exists "ai_feature_bindings_owner_full" on public.ai_feature_bindings;
drop policy if exists "ai_feature_bindings_service_role_bypass" on public.ai_feature_bindings;

create policy "ai_feature_bindings_owner_full"
  on public.ai_feature_bindings
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'owner'
    )
  );

create policy "ai_feature_bindings_service_role_bypass"
  on public.ai_feature_bindings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.ai_feature_bindings to authenticated;
grant select, insert, update, delete on public.ai_feature_bindings to service_role;

insert into public.ai_feature_bindings (
  feature_key,
  label,
  system_prompt,
  output_token_limit,
  context_message_limit,
  is_enabled,
  created_at,
  updated_at
)
select
  feature_key,
  label,
  system_prompt,
  coalesce(output_token_limit, 3600),
  coalesce(context_message_limit, 30),
  is_enabled,
  created_at,
  updated_at
from public.ai_feature_config
on conflict (feature_key) do update set
  label = excluded.label,
  system_prompt = excluded.system_prompt,
  output_token_limit = excluded.output_token_limit,
  context_message_limit = excluded.context_message_limit,
  is_enabled = excluded.is_enabled,
  updated_at = timezone('utc'::text, now());

-- Map legacy feature channel/model bindings into the new provider-key-model layer when possible.
update public.ai_feature_bindings binding
set provider_key_model_id = mapped.provider_key_model_id
from (
  select distinct on (feature.feature_key)
    feature.feature_key,
    model.id as provider_key_model_id
  from public.ai_feature_config feature
  join public.ai_channels channel on channel.id = feature.channel_id
  join public.ai_providers provider on provider.name = channel.name
  join public.ai_provider_keys key on key.provider_id = provider.id and key.label = channel.name || '-default'
  join public.ai_provider_key_models model
    on model.key_id = key.id
   and model.model_id = coalesce(nullif(feature.model, ''), nullif(channel.model, ''), 'claude-sonnet-4-6')
  where feature.channel_id is not null
  order by feature.feature_key, key.priority asc, model.created_at asc
) mapped
where binding.feature_key = mapped.feature_key
  and binding.provider_key_model_id is null;

-- Ensure every legacy rewrite route can point at an ai_provider_key_models row.
insert into public.ai_provider_key_models (key_id, model_id, display_name)
select distinct
  key.id,
  route.actual_model,
  route.actual_model
from public.rewrite_model_routes route
join public.ai_channels channel on channel.id = route.channel_id
join public.ai_providers provider on provider.name = channel.name
join public.ai_provider_keys key on key.provider_id = provider.id and key.label = channel.name || '-default'
where route.provider_key_model_id is null
  and nullif(route.actual_model, '') is not null
on conflict (key_id, model_id) do nothing;

update public.rewrite_model_routes route
set provider_key_model_id = model.id
from public.ai_channels channel
join public.ai_providers provider on provider.name = channel.name
join public.ai_provider_keys key on key.provider_id = provider.id and key.label = channel.name || '-default'
join public.ai_provider_key_models model on model.key_id = key.id
where route.channel_id = channel.id
  and route.provider_key_model_id is null
  and model.model_id = route.actual_model;
