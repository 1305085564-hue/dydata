-- ============================================================================
-- 20260926235000: 收口履约写 RPC 的执行权（anon / PUBLIC）
-- ============================================================================
-- 背景：mark_fulfillment_status / mark_fulfillment_status_batch / remove_fulfillment_mark
--   是 SECURITY DEFINER（按定义者权限执行）**且内部不做权限校验**，
--   而 Supabase 的默认权限会把新建函数的 EXECUTE 授给 anon / authenticated / PUBLIC，
--   于是任何调用者（含未登录）都能直接执行履约写操作。
--   20260904120000 只 `revoke ... from authenticated`，而线上 ACL 实测仍带
--   `=X/postgres`（PUBLIC）与 `anon=X/postgres` —— 对 PUBLIC 这条路径无效，故本迁移补齐。
--
-- 影响面（应用侧零风险的依据）：
--   * 全仓 4 个调用点全部走 service-role 客户端（`requireAdminServiceClient` → `createAdminClient`）：
--     src/app/api/admin/fulfillment/{mark,bulk-mark,remove,appeal/handle}/route.ts
--   * service_role 与属主 postgres 的权限不受影响；无其它调用点
--
-- 注意：若日后这些函数被 drop 后重建，默认权限会重新授予 anon/authenticated，
--   届时需要再补一次本类收口（`create or replace` 不会重置权限，是安全的）。
--
-- rollback:
--   grant execute on function public.mark_fulfillment_status(uuid, date, text, text, uuid) to anon;
--   grant execute on function public.mark_fulfillment_status_batch(uuid[], date, text, text, uuid) to anon;
--   grant execute on function public.remove_fulfillment_mark(uuid, date, uuid) to anon;
--   （PUBLIC 的默认授权用 `grant ... to public` 恢复）

REVOKE EXECUTE ON FUNCTION public.mark_fulfillment_status(uuid, date, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_fulfillment_status_batch(uuid[], date, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_fulfillment_mark(uuid, date, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_fulfillment_appeal(uuid, text, uuid) FROM anon, public;
