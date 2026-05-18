import { createAdminClient } from "@/lib/supabase/admin";

import type { EmitInput, NotificationRow } from "./types";

export async function emit(input: EmitInput): Promise<{ inserted: number }> {
  const recipients = Array.from(new Set(input.recipients.filter(Boolean)));
  if (recipients.length === 0) return { inserted: 0 };

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
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    expires_at: input.expiresAt ?? null,
  }));

  // 用 upsert 处理 (user_id, type, source_type, source_id) 唯一冲突
  // 同一来源同一事件多次 emit 不重复发送，但保持 status=unread（让用户重新感知）
  const { data, error } = await admin
    .from("notifications")
    .upsert(rows, {
      onConflict: "user_id,type,source_type,source_id",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    console.error("[notifications] emit failed", error);
    return { inserted: 0 };
  }
  return { inserted: data?.length ?? 0 };
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
