import type { NotificationActionRow, NotificationRow } from "@/lib/notifications/types";

export const ACTION_CENTER_TOP_ITEMS_LIMIT = 8;

export const ACTION_CENTER_SOURCES = [
  "notification",
  "exemption",
  "permission",
  "fulfillment",
  "ai",
  "system",
] as const;
export type ActionCenterSource = (typeof ACTION_CENTER_SOURCES)[number];

export const ACTION_CENTER_PRIORITIES = ["P0", "P1", "P2"] as const;
export type ActionCenterPriority = (typeof ACTION_CENTER_PRIORITIES)[number];

export const ACTION_CENTER_STATUSES = [
  "open",
  "processing",
  "done",
  "failed",
] as const;
export type ActionCenterStatus = (typeof ACTION_CENTER_STATUSES)[number];

export type ActionItemAction =
  | {
      type: "navigate";
      url: string;
    }
  | {
      type: "review-exemption";
      endpoint: "/api/exemptions/review";
      method: "POST";
      requestId: string;
    };

export interface ActionItem {
  id: string;
  source: ActionCenterSource;
  priority: ActionCenterPriority;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string | null;
  action: ActionItemAction | null;
  status: ActionCenterStatus;
  createdAt: string;
  dedupeKey: string;
}

export interface ActionCenterSummary {
  urgentCount: number;
  todoCount: number;
  approvalCount: number;
  topItems: ActionItem[];
  updatedAt: string;
}

export function normalizeInternalActionUrl(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export function getActionSourceForNotification(
  row: Pick<NotificationRow, "type" | "source_type">,
): ActionCenterSource {
  const type = row.type.toLowerCase();
  const sourceType = row.source_type?.toLowerCase() ?? "";

  if (sourceType === "permission_request" || type === "permission.request") {
    return "permission";
  }
  if (sourceType.startsWith("fulfillment") || type.startsWith("fulfillment.")) {
    return "fulfillment";
  }
  if (sourceType.startsWith("ai") || type.startsWith("ai.")) return "ai";
  if (sourceType.startsWith("system") || type.startsWith("system.")) {
    return "system";
  }
  return "notification";
}

export function getActionPriorityForNotification(
  severity: NotificationRow["severity"],
): ActionCenterPriority {
  if (severity === "critical") return "P0";
  if (severity === "warning") return "P1";
  return "P2";
}

export function buildNotificationActionItem(row: NotificationActionRow): ActionItem {
  const actionUrl = normalizeInternalActionUrl(row.action_url);
  const source = getActionSourceForNotification(row);
  const sourceKey = row.source_type && row.source_id
    ? `${row.source_type}:${row.source_id}`
    : row.id;
  const actionLabel = row.action_label?.trim() || (actionUrl ? "前往处理" : "标记已处理");
  const description = row.body?.trim() || (
    actionUrl
      ? `需要处理这项${source === "permission" ? "权限申请" : "行动项"}，下一步：${actionLabel}。`
      : "请确认事项状态，完成后标记已处理。"
  );

  return {
    // 通知接口按原始 UUID 处理完成动作；来源与稳定键负责跨来源区分。
    id: row.id,
    source,
    priority: getActionPriorityForNotification(row.severity),
    title: row.title,
    description,
    actionLabel,
    actionUrl,
    action: actionUrl ? { type: "navigate", url: actionUrl } : null,
    status: row.status === "unread" || row.status === "read" ? "open" : "done",
    createdAt: row.created_at,
    dedupeKey: `${source}:${sourceKey}`,
  };
}

export function isReviewExemptionAction(
  action: ActionItemAction | null | undefined,
): action is Extract<ActionItemAction, { type: "review-exemption" }> {
  return action?.type === "review-exemption";
}

export function sortActionItems(items: ActionItem[]) {
  const priorityRank: Record<ActionCenterPriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
  };

  return [...items].sort((left, right) => {
    const priorityDiff = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function isActionCenterSummary(value: unknown): value is ActionCenterSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActionCenterSummary>;
  return Number.isFinite(candidate.urgentCount)
    && Number.isFinite(candidate.todoCount)
    && Number.isFinite(candidate.approvalCount)
    && typeof candidate.updatedAt === "string"
    && Array.isArray(candidate.topItems);
}
