-- ============================================================
-- 智能告警发送前原子去重（claim 表达式唯一索引）
--
-- 背景：smart-alert 原先「读 audit_logs 去重 → 发送 → 写成功记录」，
-- 两个并发请求可能同时读到空记录并都发送飞书。本 migration 对
-- dedupeKey 建（部分表达式）唯一索引，使「发送前插入 claim 行」
-- 成为原子抢占：
--   action ∈ ('smart_alert_claim','smart_alert') 且 detail.dedupeKey
--   非空的行，同一 dedupeKey 只允许一行。
--
-- 状态机（应用层维护）：
--   发送前   插入 action='smart_alert_claim' 行（抢占）；
--   发送成功 流转为 action='smart_alert'（保留为历史去重依据）；
--   发送失败 删除 claim 行（释放重试资格），另写 smart_alert_failed 记录。
--
-- ⚠️ 执行前置检查（Supabase SQL Editor 先跑这句，无结果才可继续）：
--   select detail->>'dedupeKey' as dedupe_key, count(*)
--   from public.audit_logs
--   where action in ('smart_alert_claim', 'smart_alert')
--     and detail->>'dedupeKey' is not null
--   group by 1 having count(*) > 1;
-- 有历史重复则索引创建失败；先人工归并再执行。
--
-- 边界（如实声明）：进程在「已抢占、飞书已投递、尚未流转」时崩溃，
-- 滞留的 claim 行会阻塞该告警的重发（宁可不发不重复打扰），
-- 需按 created_at 人工清理；webhook 无幂等键，本方案是
-- at-most-one active sender + 失败释放，不是 exactly-once。
-- ============================================================

create unique index if not exists uq_audit_logs_smart_alert_dedupe
  on public.audit_logs ((detail->>'dedupeKey'))
  where action in ('smart_alert_claim', 'smart_alert')
    and detail->>'dedupeKey' is not null;
