-- 039: AI 渠道配置、熔断与初始数据

create table if not exists public.ai_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  api_key text not null,
  model text,
  priority int not null default 100,
  is_enabled boolean not null default true,
  unhealthy_until timestamptz,
  consecutive_failures int not null default 0,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_ai_channels_enabled_priority
  on public.ai_channels(is_enabled, priority asc);

alter table public.ai_channels enable row level security;

drop policy if exists "owner_full_access" on public.ai_channels;

create policy "owner_full_access"
  on public.ai_channels
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

grant select, insert, update, delete on public.ai_channels to authenticated;
grant select, insert, update, delete on public.ai_channels to service_role;

create or replace function public.bump_ai_channel_failure(
  target_id uuid,
  error_message text
)
returns table (
  consecutive_failures int,
  unhealthy_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_failures int;
  next_unhealthy timestamptz;
begin
  update public.ai_channels
  set
    consecutive_failures = public.ai_channels.consecutive_failures + 1,
    last_failure_at = timezone('utc'::text, now()),
    last_error_message = left(coalesce(error_message, ''), 500),
    unhealthy_until = case
      when public.ai_channels.consecutive_failures + 1 >= 3
        then timezone('utc'::text, now()) + interval '12 hours'
      else public.ai_channels.unhealthy_until
    end,
    updated_at = timezone('utc'::text, now())
  where id = target_id
  returning public.ai_channels.consecutive_failures, public.ai_channels.unhealthy_until
  into next_failures, next_unhealthy;

  return query select next_failures, next_unhealthy;
end;
$$;

grant execute on function public.bump_ai_channel_failure(uuid, text) to service_role;

insert into public.ai_channels (name, base_url, api_key, priority)
values
  (
    'api7',
    (
      select coalesce(
        current_setting('app.ai_base_url', true),
        'https://www.aiapikey.net'
      )
    ),
    'PLACEHOLDER_KEY_1',
    1
  ),
  ('api1', 'https://ai.ltcraft.cn', 'PLACEHOLDER_KEY_2', 2),
  ('api8', 'https://www.openclaudecode.cn', 'PLACEHOLDER_KEY_3', 3)
on conflict (name) do nothing;
