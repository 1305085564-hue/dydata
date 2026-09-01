import { createAdminClient } from "@/lib/supabase/admin";

import type { EmitInput, NotificationActionRow, NotificationRow } from "./types";

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

export async function markAllRead(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "unread")
    .select("id");
  if (error) {
    console.error("[notifications] markAllRead failed", error);
    return 0;
  }
  return data?.length ?? 0;
}

export async function markDone(
  notificationId: string,
  userId: string,
  reason: "done" | "ignored" = "done",
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ status: reason, done_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) {
    console.error("[notifications] markDone failed", error);
    return false;
  }
  return true;
}

export interface ListOptions {
  /** 默认 unread + read（即所有未处理）；可显式指定 */
  statuses?: Array<"unread" | "read" | "done" | "ignored">;
  limit?: number;
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

export async function listForUser(userId: string, options: ListOptions = {}): Promise<NotificationRow[]> {
  const admin = createAdminClient();
  const statuses = options.statuses ?? ["unread", "read"];
  const { data, error } = await admin
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (error) {
    console.error("[notifications] listForUser failed", error);
    return [];
  }
  return (data ?? []) as NotificationRow[];
}
