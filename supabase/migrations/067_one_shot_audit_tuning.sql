-- 067_one_shot_audit_tuning.sql
-- 2026-05-18 一次性架构审计调优（保守版）
-- 经 Codex 复核后定稿。所有改动 idempotent、不破坏既有数据、不 DROP / RENAME 任何活表。

-- ============================================================
-- 1. audit 双表收敛（保旧废新）
--    audit_logs（005）：业务实际写入 + 读取的活表，保留并补 service_role bypass + comment
--    audit_log（032）：业务零调用的废弃新表，加 deprecated comment，不改名不 DROP
-- ============================================================

comment on table public.audit_logs is
  '后台审计活表（005 起）。业务侧 admin/actions.ts、smart-alert/notify、admin-page loader 均读写本表。'
  ' RLS：is_admin() select/insert（005 定义）。2026-05-18 起为唯一权威审计表。';

-- service_role bypass 兜底（避免后台 service_role 写入被 RLS 卡住）
drop policy if exists "audit_logs_service_role_bypass" on public.audit_logs;
create policy "audit_logs_service_role_bypass"
  on public.audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert on public.audit_logs to service_role;

comment on table public.audit_log is
  '【已废弃】2026-05-18 标记。设计初衷是替代 audit_logs（旧表）但业务从未切换。'
  ' 业务零写入零读取。保留以避免改动 033_rls_policies.sql 中已存在的 4 条 policy。'
  ' 后续 Codex 评估若仍无调用可单独做 068 清理。新审计写入一律走 audit_logs。';

-- ============================================================
-- 2. 020-022 实验性内容填报 schema 标注
--    submission_batch / content_item / metric_snapshot / content_asset / field_provenance
--    这套表是"溯源式数据填报"重构残骸，主流仍走 daily_reports / videos / video_metrics_snapshots
--    AI insight 路径（src/lib/ai/insight-single-video.ts、growth-page）仍在读 content_item / metric_snapshot
--    submission_batch 被 021 多条 RLS policy 引用为子查询源，不能改名/DROP
--    本轮只加 comment，不动结构
-- ============================================================

comment on table public.submission_batch is
  '【实验性 / 半上线】020-022 内容填报溯源重构遗留。业务侧无直接 .from() 调用，'
  ' 但 021_metric_snapshot.sql 多条 RLS policy 通过 EXISTS 子查询引用本表。'
  ' 主流填报仍以 daily_reports / videos 为准。改名/DROP 会击穿 021 policy，禁止动。';

comment on table public.content_item is
  '【实验性 / 半上线】内容项主表（020）。业务侧仅 AI insight 与 growth 路径在读：'
  ' src/lib/ai/insight-single-video.ts、src/lib/ai/insight-period.ts、src/lib/loaders/growth-page.ts、'
  ' src/app/api/growth/ai-insight/route.ts。主流填报仍以 daily_reports 为准。';

comment on table public.metric_snapshot is
  '【实验性 / 半上线】指标快照（021）。仅 AI insight 路径在读。主流指标仍以 video_metrics_snapshots 为准。';

comment on table public.content_asset is
  '【实验性 / 未上线】素材资产 + OCR 落点（022）。业务零调用。'
  ' 注意：项目 CLAUDE.md / AGENTS.md 历史描述把本表当作"截图数据存储位"，但实际截图仍走'
  ' video_metrics_snapshots.{screenshot_urls, curve_screenshot_url, retention_screenshot_url}。';

comment on table public.field_provenance is
  '【实验性 / 未上线】字段血缘表（022）。业务零调用，保留观察，禁 DROP。';

comment on table public.provisional_tag_text is
  '【实验性 / 未上线】临时标签草稿（025）。业务零调用。';

-- ============================================================
-- 3. is_admin 权威定义重述
--    001 + 054 各定义一次，本 migration 给出 2026-05-18 后唯一权威版本。
--    与 054 完全等价，只是把权威版本固化到本审计 migration 里便于回溯。
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
-- 4. profiles.permissions 默认值校准（防御性）
--    007 已加列且 NOT NULL DEFAULT '{}'，本 migration 兜底历史空值
-- ============================================================

update public.profiles
set permissions = '{}'::jsonb
where permissions is null;

-- ============================================================
-- 5. daily_reports 高频查询索引补漏
--    daily_reports 是事实主表（业务调用 80 次），现有唯一索引是 (user_id, report_date) 唯一索引（001）
--    业务多处按 user_id + report_date desc 倒序查（dashboard / 趋势 / 历史），
--    唯一索引虽能覆盖但 desc 排序会反向扫，加显式 desc 索引更稳
-- ============================================================

create index if not exists idx_daily_reports_user_id_report_date_desc
  on public.daily_reports (user_id, report_date desc);

-- ============================================================
-- 6. 移交标记
-- ============================================================

comment on schema public is
  'DYData public schema。2026-05-18 一次性架构审计完成（067），由 Codex 全权维护'
  '（按 ~/.claude/AI协作分工.md 第 3 项）。Claude 仅在一次性架构级重构、'
  '前端架构骨架变更、Codex / Kimi 兜底失败时再上手。';

-- 029 + 053 不动：029 在生产环境从未执行，053 是 idempotent 兼容补丁，二者并存有 IF NOT EXISTS 兜底。
-- 011 缺号：历史回退痕迹，无业务影响，保留疑团。
