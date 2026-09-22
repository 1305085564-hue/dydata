import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogEntry = {
  userId: string;
  action: string;
  target: string;
  detail?: string | null;
};

export type AuditLogWriteResult = { ok: true } | { ok: false; message: string };

type AuditLogClient = Pick<SupabaseClient, "from">;

/**
 * 统一审计出口：业务写操作的留痕一律落 `audit_logs`。
 * `admin_actions` 只服务 AI 工具执行记录，本函数不写、也不应被改用。
 * 返回写入结果而不是抛错，调用方必须显式处理失败（禁止把审计失败当成功）。
 */
export async function writeAuditLog(
  supabase: AuditLogClient,
  entry: AuditLogEntry,
): Promise<AuditLogWriteResult> {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: entry.userId,
    action: entry.action,
    target: entry.target,
    detail: entry.detail ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * 审计失败时的统一措辞（唯一来源，禁止各调用点自己编）：
 * - 能回滚的写操作先回滚，再报「失败 + 已回滚」，不留下没人知道的半成品。
 * - 回滚也失败时要如实承认，不能报成「已回滚」。
 * - 不能回滚的写操作必须承认「已生效」，让操作人去找留痕，而不是假装失败。
 */

/** 已回滚（写操作未生效）。 */
export function auditRollbackMessage(what: string): string {
  return `${what}失败：审计写入失败，已回滚`;
}

/** 回滚未完成（状态不确定，必须人工核对）。 */
export function auditRollbackIncompleteMessage(what: string): string {
  return `${what}失败：审计写入失败且回滚未完成，请人工核对`;
}

/** 无法回滚：写操作已生效，但没留下审计痕迹。 */
export function auditAppliedButNotLoggedMessage(what: string): string {
  return `${what}已生效，但审计写入失败，请人工核对留痕`;
}
