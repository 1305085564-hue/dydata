-- ============================================================
-- 068: 通知中心（notifications）
-- 全站持久化通知：草稿提示之外的 6 类（团队邀请/系统公告/AI 告警/催交/AI 任务结果/@ 协作）
-- 草稿仍走 localStorage，前端派生；本表只承载需要服务端写入的事项
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 类型：team.invite / system.announcement / alert.<source> / report.remind / ai.task_done / mention
  type text not null,

  -- todo 待办型（需用户处理才消失）/ feed 信息流型（看完即已读，30 天过期）
  category text not null check (category in ('todo', 'feed')),

  -- info / success / warning / critical
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),

  title text not null,
  body text,

  -- 跳转动作（可选）
  action_label text,
  action_url text,

  -- 类型相关额外数据：alertId / teamId / videoId 等
  payload jsonb not null default '{}'::jsonb,

  -- unread 未读 / read 已读 / done 已处理 / ignored 已忽略
  status text not null default 'unread' check (status in ('unread', 'read', 'done', 'ignored')),

  -- feed 类按 expires_at 软过期；todo 类不设过期
  expires_at timestamptz,

  -- 去重锚点：(user_id, type, source_type, source_id) 唯一
  source_type text,
  source_id text,

  created_at timestamptz not null default now(),
  read_at timestamptz,
  done_at timestamptz
);

-- 列表查询主索引
create index if not exists idx_notifications_user_status_created
  on public.notifications (user_id, status, created_at desc);

-- 类型聚合（便于按类型筛选）
create index if not exists idx_notifications_user_type
  on public.notifications (user_id, type);

-- 去重唯一索引：同一用户对同一来源同一事件只能有一条
create unique index if not exists idx_notifications_dedupe
  on public.notifications (user_id, type, source_type, source_id)
  where source_id is not null;

-- ============================================================
-- RLS：用户只能读写自己的通知
-- ============================================================
alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 用户不能直接 insert / delete，全部走 service_role
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ============================================================
-- cron 清理：feed 类 30 天后物理删除
-- ============================================================
create or replace function public.cleanup_expired_notifications()
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.notifications
  where category = 'feed'
    and (
      (expires_at is not null and expires_at < now())
      or (expires_at is null and created_at < now() - interval '30 days')
    );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.cleanup_expired_notifications() to service_role;
