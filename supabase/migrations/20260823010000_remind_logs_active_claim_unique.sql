-- ============================================================
-- 催交日志严格并发抢占（active claim 唯一）
--
-- 背景：20260823000000 只对 status='success' 建唯一索引，但 claim
-- 阶段插入的是 'sending'——两个并发请求可以同时插入 sending、同时
-- 发送飞书，直到最后写 success 时才冲突。本 migration 把唯一约束
-- 扩到「sending + success」，使抢占动作本身原子化：
--   同一 (target_date, user_id) 非豁免成员，sending/success 合计
--   最多存在一行；第二个并发请求在发送前即被数据库拒绝（23505）。
--
-- ⚠️ 依赖关系：'sending' 状态值由 20260823000000 放开 check 约束。
-- 两份 migration 必须按时间戳顺序一起执行。
--
-- ⚠️ 执行前置检查（Supabase SQL Editor 先跑这句，无结果才可继续）：
--   select target_date, user_id, count(*)
--   from public.remind_logs
--   where status in ('success', 'sending') and is_exempted = false
--   group by 1, 2 having count(*) > 1;
-- 若有历史重复行，唯一索引会创建失败；先人工归并历史重复再执行。
--
-- 崩溃恢复边界（如实声明）：进程在「已抢占但未完成发送/流转」时崩溃，
-- 会留下滞留的 sending 行阻塞当日重复发送。应用层按 sent_at 超过
-- 10 分钟视为死抢占并原子接管（见 src/lib/remind-claim.ts）；
-- 若飞书实际已投递而后接管方重发，可能重复一条——webhook 无幂等键，
-- 这只是 at-most-one active claimant + 超时回收，不是 exactly-once。
-- ============================================================

drop index if exists uq_remind_logs_success_per_day;

create unique index if not exists uq_remind_logs_active_claim_per_day
  on public.remind_logs(target_date, user_id)
  where status in ('sending', 'success') and is_exempted = false;
