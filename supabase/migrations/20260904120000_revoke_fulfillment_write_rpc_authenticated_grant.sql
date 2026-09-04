-- ============================================================
-- 20260904120000: 撤销四个 fulfillment 写 RPC 对 authenticated 的 GRANT
-- ============================================================
-- 背景：第二轮全站盲审 R-01（P0）。mark_fulfillment_status /
-- mark_fulfillment_status_batch / remove_fulfillment_mark /
-- handle_fulfillment_appeal 四个 SECURITY DEFINER RPC 之前
-- GRANT EXECUTE TO authenticated, service_role，函数体内只调
-- is_admin_or_owner()（无 team/company 维度），任意团队 admin/owner
-- 用自身 authenticated 会话直调即可对其他团队成员写履约/处理申诉。
--
-- 业务路径经 requireAdminServiceClient → createAdminClient() 走
-- service_role（见 src/app/api/admin/cockpit/_shared.ts:28-44 与
-- src/app/api/admin/fulfillment/mark|bulk-mark|remove|appeal/handle/
-- route.ts），authenticated GRANT 对业务多余，仅服务于攻击者直调。
--
-- 对照正确范式：20260728120000_atomic_collaboration_attribution.sql:57-60
-- 仅 grant service_role。本 migration 与之对齐。
--
-- 风险：业务路径不受影响（service_role 仍持有 EXECUTE）；撤销后
-- authenticated 会话直调将返回 42501 permission denied，堵住跨团队
-- 越权写履约/申诉。
--
-- 注：get_fulfillment_range 为读 RPC，跨团队读影响有限且 admin 跨查
-- 可能有合理场景，本轮不撤；只撤四个写 RPC。
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.mark_fulfillment_status(uuid, date, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_fulfillment_status_batch(uuid[], date, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_fulfillment_mark(uuid, date, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_fulfillment_appeal(uuid, text, uuid) FROM authenticated;
