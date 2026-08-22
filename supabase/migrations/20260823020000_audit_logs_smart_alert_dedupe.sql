-- ============================================================
-- 智能告警发送前原子去重（专用 claim 表）
--
-- audit_logs.detail 的线上真实类型是 text，不能对它使用 ->> 操作符，
-- 也不能假设历史审计内容全部是合法 JSON。因此并发锁单独存储，
-- audit_logs 继续只承担成功/失败审计和历史 dedupe 查询。
--
-- 状态机（应用层维护）：
--   发送前   插入 status='claimed' 行（dedupe_key 原生唯一约束）；
--   发送成功 流转为 status='sent'，并写 smart_alert 审计记录；
--   发送失败 删除 claim 行（释放重试资格），另写 smart_alert_failed 记录；
--   发送成功超过 24 小时由下一次抢占标记 expired，保持原有 24 小时去重口径。
--
-- 边界（如实声明）：进程在「已抢占、飞书已投递、尚未流转」时崩溃，
-- 滞留的 claim 行会阻塞该告警的重发（宁可不发不重复打扰），
-- 需按 created_at 人工清理；webhook 无幂等键，本方案是
-- at-most-one active sender + 失败释放，不是 exactly-once。
-- ============================================================

create table if not exists public.smart_alert_claims (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  user_id uuid references public.profiles (id) on delete set null,
  target text not null,
  payload jsonb not null,
  status text not null default 'claimed'
    check (status in ('claimed', 'sent', 'expired')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  sent_at timestamptz
);

create unique index if not exists uq_smart_alert_claims_dedupe_key
  on public.smart_alert_claims (dedupe_key)
  where status in ('claimed', 'sent');

create index if not exists smart_alert_claims_created_at_idx
  on public.smart_alert_claims (created_at desc);

alter table public.smart_alert_claims enable row level security;
grant select, insert, update, delete on public.smart_alert_claims to service_role;
