-- ============================================================
-- 补齐 admin_first_screen_perf_events 表的 RLS 和权限收紧
-- 根因：P1-08 - 该表包含管理员 UUID 和内部路由元数据，但未启用 RLS
-- 风险：anon/authenticated 用户可直接读取敏感观测数据
-- ============================================================

-- 启用行级安全
alter table public.admin_first_screen_perf_events enable row level security;

-- 撤销 anon 和 authenticated 的所有权限
revoke all on public.admin_first_screen_perf_events from anon, authenticated;

-- 确认 service_role 权限（防御性重申，不影响已有 grant）
grant select, insert on public.admin_first_screen_perf_events to service_role;
