-- 040: AI 功能配置表、RLS、初始数据

create table if not exists public.ai_feature_config (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  label text not null,
  channel_id uuid references public.ai_channels(id) on delete set null,
  model text,
  system_prompt text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.ai_feature_config enable row level security;

drop policy if exists "owner_full" on public.ai_feature_config;
drop policy if exists "service_role_bypass" on public.ai_feature_config;

create policy "owner_full"
  on public.ai_feature_config
  for all
  using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'owner'
    )
  );

create policy "service_role_bypass"
  on public.ai_feature_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.ai_feature_config to authenticated;
grant select, insert, update, delete on public.ai_feature_config to service_role;

create or replace function public.set_ai_feature_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_ai_feature_config_updated_at on public.ai_feature_config;

create trigger set_ai_feature_config_updated_at
before update on public.ai_feature_config
for each row
execute function public.set_ai_feature_config_updated_at();

insert into public.ai_feature_config (feature_key, label)
values
  ('admin_assistant', 'AI 管理助手'),
  ('growth_insight', '成长诊断'),
  ('period_insight', '周报月报洞察'),
  ('single_video', '单视频分析'),
  ('growth_advice', '成长建议'),
  ('content_segment', '文案拆解'),
  ('next_day_review', '次日复盘'),
  ('video_diagnose', '视频诊断'),
  ('content_tools', '内容工具'),
  ('smart_alert', '智能预警')
on conflict (feature_key) do nothing;
