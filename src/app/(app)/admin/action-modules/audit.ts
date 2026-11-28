import {
auditAppliedButNotLoggedMessage,
writeAuditLog
} from "@/lib/audit-log";
import { getUserPermissions } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";


export function adminActionFailure(operation: string, message: string, error: unknown): { error: string } {
  console.error(`[admin-actions] ${operation}`, error);
  return { error: message };
}

export type AdminWriteSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * 管理写操作的审计统一出口：一律走 `src/lib/audit-log.ts` 落 `audit_logs`
 * （`admin_actions` 只归 AI 工具，不在这里写）。
 *
 * 与「数据管理按团队」用同一套失败策略，不再像旧实现那样用空成功/失败回调把审计错误吞掉：
 * - 能回滚的写操作：先回滚，再按 `auditRollback*` 报失败；
 * - 回不去的写操作：按 `auditAppliedButNotLogged*` 承认「已生效」，让操作人去找留痕。
 */
export async function recordAdminAudit(entry: {
  supabase: AdminWriteSupabase;
  userId: string;
  action: string;
  target: string;
  detail?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await writeAuditLog(entry.supabase, {
    userId: entry.userId,
    action: entry.action,
    target: entry.target,
    detail: entry.detail ?? null,
  });
  if (!result.ok) {
    console.error("[admin-actions] write-audit", result.message);
    return { ok: false, message: "审计留档失败" };
  }
  return { ok: true };
}

/** 审计失败且这次写操作回不去：明确承认「已生效」，不伪装成功也不伪装失败。 */
export function auditNotLogged(what: string): { error: string } {
  return { error: auditAppliedButNotLoggedMessage(what) };
}

export function lifecycleActor(perm: NonNullable<Awaited<ReturnType<typeof getUserPermissions>>>) {
  return { id: perm.userId, role: perm.role, companyRole: perm.companyRole, permissions: perm.permissions, teamId: perm.teamId };
}
