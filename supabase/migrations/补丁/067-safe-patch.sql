-- ============================================================
-- 067-safe-patch：067_one_shot_audit_tuning 安全版
-- 原因：067 直接 comment on table public.audit_log（不存在）会失败
--       本版给所有 comment 加存在性判断，对实际不存在的表/函数静默跳过
-- ============================================================

-- ============================================================
-- 1. audit_logs 活表：service_role bypass + comment
--    （audit_logs 在 005 已建，必然存在）
-- ============================================================

comment on table public.audit_logs is
  '后台审计活表（005 起）。业务侧 admin/actions.ts、smart-alert/notify、admin-page loader 均读写本表。'
  ' RLS：is_admin() select/insert（005 定义）。2026-05-18 起为唯一权威审计表。';

drop policy if exists "audit_logs_service_role_bypass" on public.audit_logs;
create policy "audit_logs_service_role_bypass"
  on public.audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert on public.audit_logs to service_role;

-- ============================================================
-- 2. 条件 comment：仅当表存在时才执行 comment
--    使用 DO 块 + format/EXECUTE，避免对不存在的表硬 comment 报错
-- ============================================================

do $$
declare
  comment_map jsonb := jsonb_build_object(
    'audit_log',
      '【已废弃】2026-05-18 标记。设计初衷是替代 audit_logs（旧表）但业务从未切换。' ||
      ' 业务零写入零读取。保留以避免改动 033_rls_policies.sql 中已存在的 4 条 policy。' ||
      ' 后续 Codex 评估若仍无调用可单独做 068 清理。新审计写入一律走 audit_logs。',
    'submission_batch',
      '【实验性 / 半上线】020-022 内容填报溯源重构遗留。业务侧无直接 .from() 调用，' ||
      ' 但 021_metric_snapshot.sql 多条 RLS policy 通过 EXISTS 子查询引用本表。' ||
      ' 主流填报仍以 daily_reports / videos 为准。改名/DROP 会击穿 021 policy，禁止动。',
    'content_item',
      '【实验性 / 半上线】内容项主表（020）。业务侧仅 AI insight 与 growth 路径在读：' ||
      ' src/lib/ai/insight-single-video.ts、src/lib/ai/insight-period.ts、src/lib/loaders/growth-page.ts、' ||
      ' src/app/api/growth/ai-insight/route.ts。主流填报仍以 daily_reports 为准。',
    'metric_snapshot',
      '【实验性 / 半上线】指标快照（021）。仅 AI insight 路径在读。主流指标仍以 video_metrics_snapshots 为准。',
    'content_asset',
      '【实验性 / 未上线】素材资产 + OCR 落点（022）。业务零调用。' ||
      ' 注意：项目 CLAUDE.md / AGENTS.md 历史描述把本表当作"截图数据存储位"，但实际截图仍走' ||
      ' video_metrics_snapshots.{screenshot_urls, curve_screenshot_url, retention_screenshot_url}。',
    'field_provenance',
      '【实验性 / 未上线】字段血缘表（022）。业务零调用，保留观察，禁 DROP。',
    'provisional_tag_text',
      '【实验性 / 未上线】临时标签草稿（025）。业务零调用。'
  );
  rec record;
begin
  for rec in
    select key as tname, value::text as cmt
    from jsonb_each_text(comment_map)
  loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = rec.tname and c.relkind = 'r'
    ) then
      execute format('comment on table public.%I is %L', rec.tname, rec.cmt);
    end if;
  end loop;
end$$;

-- ============================================================
-- 3. is_admin 权威定义重述（idempotent）
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'owner')
  );
$$;

-- ============================================================
-- 4. profiles.permissions 默认值校准（兜底历史空值）
-- ============================================================

update public.profiles
set permissions = '{}'::jsonb
where permissions is null;

-- ============================================================
-- 5. daily_reports 高频查询索引补漏
-- ============================================================

create index if not exists idx_daily_reports_user_id_report_date_desc
  on public.daily_reports (user_id, report_date desc);

-- ============================================================
-- 6. schema 移交标记
-- ============================================================

comment on schema public is
  'DYData public schema。2026-05-18 一次性架构审计完成（067），由 Codex 全权维护'
  '（按 ~/.claude/AI协作分工.md 第 3 项）。Claude 仅在一次性架构级重构、'
  '前端架构骨架变更、Codex / Kimi 兜底失败时再上手。';
