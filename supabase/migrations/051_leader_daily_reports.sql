-- 组长日报表（对应管理设计文档 §5.2）
create table if not exists public.leader_daily_reports (
  id uuid primary key default gen_random_uuid(),
  leader_user_id uuid not null references public.profiles(id),
  group_id uuid not null references public.groups(id),
  report_date date not null,

  -- 固定 4 个字段
  topic_feedback text,        -- 选题：今日组内选题方向亮点/问题
  opening_feedback text,      -- 开头：哪条开头写得好/哪条开头有问题
  script_feedback text,       -- 脚本文案：组内整体写作水平观察、典型问题
  video_feedback text,        -- 视频：成片质量观察、突出案例/待改进案例

  submitted_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),

  unique (leader_user_id, report_date)
);

alter table public.leader_daily_reports enable row level security;

-- RLS：组长看自己的，owner 看全部
create policy "leader_reports_select_own" on public.leader_daily_reports
  for select using (
    leader_user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

create policy "leader_reports_insert_own" on public.leader_daily_reports
  for insert with check (
    leader_user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

create policy "leader_reports_update_own" on public.leader_daily_reports
  for update using (
    leader_user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );
