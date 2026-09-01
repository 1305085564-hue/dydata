import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveVisibleUserIds, type DataAccessScope } from "@/lib/data-access-scope";
import { loadOrphanExemptionCount } from "@/lib/exemption-orphan";
import { listOpenTodoSummaryForUser } from "@/lib/notifications/server";

import {
  ACTION_CENTER_TOP_ITEMS_LIMIT,
  buildNotificationActionItem,
  isReviewExemptionAction,
  sortActionItems,
  type ActionItem,
  type ActionCenterSummary,
} from "./types";

type ActionCenterClient = ReturnType<typeof createAdminClient>;

const EXEMPTION_SELECT =
  "id, applicant_user_id, team_id, exemption_type, start_date, end_date, reason, created_at";

const EXEMPTION_LABELS: Record<string, string> = {
  single: "请假 1 天",
  yesterday: "补昨日请假",
  "3days": "请假 3 天",
  "4days": "请假 4 天",
  "5days": "请假 5 天",
  range: "自定义范围",
  permanent: "永久豁免",
};

export interface ActionCenterNotificationSource {
  items: ActionItem[];
  count: number;
  urgentCount: number;
}

export interface ActionCenterApprovalSource {
  items: ActionItem[];
  count: number;
}

export interface ActionCenterFulfillmentSource {
  items: ActionItem[];
  count: number;
  urgentCount: number;
}

export interface BuildActionCenterSummaryInput {
  notifications: ActionCenterNotificationSource;
  approvals: ActionCenterApprovalSource;
  fulfillment?: ActionCenterFulfillmentSource;
  orphanCount?: number;
  updatedAt?: string;
}

export interface ActionCenterAccessOptions {
  userId: string;
  scope: Pick<DataAccessScope, "kind" | "teamId" | "visibleUserIds" | "activeVisibleUserIds">;
  canManageExemptions: boolean;
  canViewOrphanDetails: boolean;
  client?: ActionCenterClient;
  topLimit?: number;
}

function boundedLimit(value = ACTION_CENTER_TOP_ITEMS_LIMIT) {
  if (!Number.isFinite(value)) return ACTION_CENTER_TOP_ITEMS_LIMIT;
  return Math.max(1, Math.min(Math.trunc(value), ACTION_CENTER_TOP_ITEMS_LIMIT));
}

function safeCount(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) && (value as number) >= 0
    ? Math.trunc(value as number)
    : fallback;
}

function emptyApprovalSource(): ActionCenterApprovalSource {
  return { items: [], count: 0 };
}

/**
 * 发布管理目前只有完整日历接口，不能为顶栏复用；保留零查询适配器，
 * 等出现稳定的轻量卡点接口后只替换这里，不让摘要偷偷触发日历大查询。
 */
export async function loadFulfillmentActionSource(): Promise<ActionCenterFulfillmentSource> {
  return { items: [], count: 0, urgentCount: 0 };
}

export function buildActionCenterSummary({
  notifications,
  approvals,
  fulfillment = { items: [], count: 0, urgentCount: 0 },
  orphanCount = 0,
  updatedAt = new Date().toISOString(),
}: BuildActionCenterSummaryInput): ActionCenterSummary {
  const normalizedOrphanCount = safeCount(orphanCount);
  const orphanItems: ActionItem[] = normalizedOrphanCount > 0
    ? [{
        id: "exemption:orphan",
        source: "exemption",
        priority: "P1",
        title: "待归属申请",
        description: `有 ${normalizedOrphanCount} 条申请缺少当前团队归属，需要先到成员管理补齐归属，避免审批范围失真。`,
        actionLabel: "去成员管理",
        actionUrl: "/admin/modules",
        action: { type: "navigate", url: "/admin/modules" },
        status: "open",
        createdAt: updatedAt,
        dedupeKey: "exemption:orphan",
      }]
    : [];

  const allItems = sortActionItems([
    ...notifications.items,
    ...approvals.items,
    ...fulfillment.items,
    ...orphanItems,
  ]);
  const seen = new Set<string>();
  const topItems = allItems.filter((item) => {
    if (seen.has(item.dedupeKey)) return false;
    seen.add(item.dedupeKey);
    return item.status === "open";
  }).slice(0, ACTION_CENTER_TOP_ITEMS_LIMIT);

  return {
    urgentCount: safeCount(notifications.urgentCount) + safeCount(fulfillment.urgentCount),
    todoCount:
      safeCount(notifications.count)
      + safeCount(approvals.count)
      + safeCount(fulfillment.count)
      + normalizedOrphanCount,
    approvalCount: safeCount(approvals.count),
    topItems,
    updatedAt,
  };
}

export async function loadOpenNotificationSource({
  userId,
  client = createAdminClient(),
  limit = ACTION_CENTER_TOP_ITEMS_LIMIT,
}: {
  userId: string;
  client?: ActionCenterClient;
  limit?: number;
}): Promise<ActionCenterNotificationSource> {
  const safeLimit = boundedLimit(limit);
  // 多取一小段再在内存按 P0/P1/P2 排序，避免新 P2 把较早的 P0 挤出摘要；不拉完整消息流。
  const source = await listOpenTodoSummaryForUser(userId, {
    client,
    limit: safeLimit * 2,
  });

  const items = sortActionItems(
    source.rows.map(buildNotificationActionItem),
  ).slice(0, safeLimit);

  return {
    items,
    count: safeCount(source.count, items.length),
    urgentCount: safeCount(source.urgentCount),
  };
}

type PendingExemptionRow = {
  id: string;
  applicant_user_id: string | null;
  team_id: string | null;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  created_at: string;
};

export async function loadPendingExemptionSource({
  scope,
  client = createAdminClient(),
  limit = ACTION_CENTER_TOP_ITEMS_LIMIT,
}: {
  scope: Pick<DataAccessScope, "kind" | "visibleUserIds" | "activeVisibleUserIds">;
  client?: ActionCenterClient;
  limit?: number;
}): Promise<ActionCenterApprovalSource> {
  const safeLimit = boundedLimit(limit);
  const visibleUserIds = scope.kind === "all" ? null : getActiveVisibleUserIds(scope);
  if (visibleUserIds !== null && visibleUserIds.length === 0) {
    return emptyApprovalSource();
  }

  let query = client
    .from("exemption_request")
    .select(EXEMPTION_SELECT, { count: "exact" })
    .eq("request_status", "pending")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (visibleUserIds !== null) {
    query = query.in("applicant_user_id", visibleUserIds);
  }

  const { data, count, error } = await query;
  if (error) throw new Error("读取审批行动项失败");

  const rows = (data ?? []) as unknown as PendingExemptionRow[];
  const applicantIds = Array.from(
    new Set(rows.map((row) => row.applicant_user_id).filter((id): id is string => Boolean(id))),
  );
  const profilesResult = applicantIds.length > 0
    ? await client.from("profiles").select("id, name").in("id", applicantIds)
    : { data: [] as Array<{ id: string; name: string | null }>, error: null };
  if (profilesResult.error) throw new Error("读取审批成员信息失败");

  const profileNames = new Map(
    ((profilesResult.data ?? []) as Array<{ id: string; name: string | null }>).map((profile) => [profile.id, profile.name]),
  );
  const items = rows.map((row) => {
    const label = EXEMPTION_LABELS[row.exemption_type] ?? row.exemption_type;
    const dateRange = row.end_date
      ? `${row.start_date} 至 ${row.end_date}`
      : row.start_date;
    const applicantName = row.applicant_user_id
      ? profileNames.get(row.applicant_user_id) ?? "未命名成员"
      : "未命名成员";
    const reason = row.reason?.trim();

    return {
      id: `exemption:${row.id}`,
      source: "exemption",
      priority: "P1",
      title: `${applicantName} 的${label}待审批`,
      description: `需要确认 ${dateRange} 的豁免是否成立，避免发布考核误判。${reason ? ` 原因：${reason}` : ""}`,
      actionLabel: "打开审批",
      actionUrl: null,
      action: {
        type: "review-exemption",
        endpoint: "/api/exemptions/review",
        method: "POST",
        requestId: row.id,
      },
      status: "open",
      createdAt: row.created_at,
      dedupeKey: `exemption:${row.id}`,
    } satisfies ActionItem;
  });

  return {
    items,
    count: safeCount(count, rows.length),
  };
}

export async function loadActionCenterSummary({
  userId,
  scope,
  canManageExemptions,
  canViewOrphanDetails,
  client = createAdminClient(),
  topLimit = ACTION_CENTER_TOP_ITEMS_LIMIT,
}: ActionCenterAccessOptions) {
  const notificationPromise = loadOpenNotificationSource({ userId, client, limit: topLimit });
  const approvalPromise = canManageExemptions
    ? loadPendingExemptionSource({ scope, client, limit: topLimit })
    : Promise.resolve(emptyApprovalSource());
  const fulfillmentPromise = loadFulfillmentActionSource();
  // 归属异常沿用现有精确口径；发布管理适配器明确零查询，暂不触发完整日历。
  const orphanPromise = canViewOrphanDetails
    ? loadOrphanExemptionCount({ supabase: client as unknown as SupabaseClient, scope })
    : Promise.resolve(0);

  const [notifications, approvals, fulfillment, orphanCount] = await Promise.all([
    notificationPromise,
    approvalPromise,
    fulfillmentPromise,
    orphanPromise,
  ]);

  return buildActionCenterSummary({
    notifications,
    approvals,
    fulfillment,
    orphanCount,
  });
}

export const __internal = {
  EXEMPTION_LABELS,
  EXEMPTION_SELECT,
  isReviewExemptionAction,
};
