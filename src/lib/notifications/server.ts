import { createAdminClient } from "@/lib/supabase/admin";

import type { EmitInput, NotificationActionRow } from "./types";

export interface EmitResult {
  ok: boolean;
  inserted: number;
  error?: string;
}

export async function emit(input: EmitInput): Promise<EmitResult> {
  const recipients = Array.from(new Set(input.recipients.filter(Boolean)));
  if (recipients.length === 0) return { ok: true, inserted: 0 };

  // 强制 sourceType + sourceId 成对落库（069 起非空），缺失时用稳定 fallback：
  //   sourceType 缺 → 用 type 自身；sourceId 缺 → 同一类型每天合并一条
  const sourceType = input.sourceType?.trim() || input.type;
  const sourceId =
    input.sourceId?.trim() ||
    `${input.type}:${new Date().toISOString().slice(0, 10)}`;

  const admin = createAdminClient();
  const rows = recipients.map((userId) => ({
    user_id: userId,
    type: input.type,
    category: input.category,
    severity: input.severity ?? "info",
    title: input.title,
    body: input.body ?? null,
    action_label: input.actionLabel ?? null,
    action_url: input.actionUrl ?? null,
    payload: input.payload ?? {},
    source_type: sourceType,
    source_id: sourceId,
    expires_at: input.expiresAt ?? null,
    // upsert 命中旧行（例如已 done/ignored）时显式重置状态，
    // 否则同一来源再次推送会永久静默，审批人永远收不到。
    status: "unread",
    read_at: null,
    done_at: null,
  }));

  // 069 之后是完整唯一索引 (user_id, type, source_type, source_id)，
  // upsert 的 onConflict 能可靠匹配，命中时保持 status/severity 等被新值覆盖。
  const { data, error } = await admin
    .from("notifications")
    .upsert(rows, {
      onConflict: "user_id,type,source_type,source_id",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    console.error("[notifications] emit failed", error);
    return { ok: false, inserted: 0, error: error.message };
  }
  return { ok: true, inserted: data?.length ?? 0 };
}

export async function markRead(notificationId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .eq("status", "unread");
  if (error) {
    console.error("[notifications] markRead failed", error);
    return false;
  }
  return true;
}

export async function markDone(
  notificationId: string,
  userId: string,
  reason: "done" | "ignored" = "done",
): Promise<boolean> {
  const admin = createAdminClient();
  // 必须 select 确认实际更新行数：0 行说明通知不存在或不属于该用户，
  // 若仍返回成功，前端会误删本地条目，下次刷新时"已叉掉"的消息会再次出现。
  const { data, error } = await admin
    .from("notifications")
    .update({ status: reason, done_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    console.error("[notifications] markDone failed", error);
    return false;
  }
  if (!data || data.length === 0) {
    console.warn("[notifications] markDone matched no rows", { notificationId, userId });
    return false;
  }
  return true;
}

export interface OpenTodoSummary {
  rows: NotificationActionRow[];
  count: number;
  urgentCount: number;
}

/**
 * 只取行动中枢需要的 todo 行和两个精确计数，不读取 feed，也不拉完整通知流。
 * 调用方可以传入复用中的 service client，避免一次 summary 请求重复建连接。
 */
export async function listOpenTodoSummaryForUser(
  userId: string,
  options: {
    limit?: number;
    client?: ReturnType<typeof createAdminClient>;
  } = {},
): Promise<OpenTodoSummary> {
  const client = options.client ?? createAdminClient();
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(Math.trunc(options.limit as number), 50))
    : 16;
  const openStatuses = ["unread", "read"] as const;
  const select =
    "id, user_id, type, category, severity, title, body, action_label, action_url, status, source_type, source_id, created_at";

  const rowsQuery = client
    .from("notifications")
    .select(select, { count: "exact" })
    .eq("user_id", userId)
    .eq("category", "todo")
    .in("status", openStatuses)
    .order("created_at", { ascending: false })
    .limit(limit);
  const urgentQuery = client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("category", "todo")
    .eq("severity", "critical")
    .in("status", openStatuses);

  const [rowsResult, urgentResult] = await Promise.all([rowsQuery, urgentQuery]);
  if (rowsResult.error) {
    console.error("[notifications] listOpenTodoSummaryForUser failed", rowsResult.error);
    throw new Error("读取通知行动项失败");
  }
  if (urgentResult.error) {
    console.error("[notifications] listOpenTodoSummaryForUser urgent count failed", urgentResult.error);
    throw new Error("读取通知风险计数失败");
  }

  return {
    rows: (rowsResult.data ?? []) as NotificationActionRow[],
    count: rowsResult.count ?? rowsResult.data?.length ?? 0,
    urgentCount: urgentResult.count ?? 0,
  };
}
