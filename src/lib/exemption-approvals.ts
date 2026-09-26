import {
  getExemptionCategoryLabel,
  normalizeExemptionCategoryForDisplay,
  toExemptionCategory,
  type ExemptionCategoryValue,
} from "@/lib/exemption-category";

export type ExemptionApprovalLike = {
  id?: string | null;
  request_id?: string | null;
};

export type CommandHubTab = "todos" | "approvals" | "history";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function resolveApprovalRequestId(
  item: ExemptionApprovalLike,
): string | null {
  if (isUuid(item.request_id)) return item.request_id.trim();
  if (isUuid(item.id)) return item.id.trim();
  return null;
}

export function collectApprovalRequestIds(
  items: ExemptionApprovalLike[],
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const item of items) {
    const requestId = resolveApprovalRequestId(item);
    if (!requestId || seen.has(requestId)) continue;
    seen.add(requestId);
    ids.push(requestId);
  }

  return ids;
}

export function removeReviewedApproval<T extends ExemptionApprovalLike>(
  items: T[],
  requestId: string,
): T[] {
  return items.filter((item) => resolveApprovalRequestId(item) !== requestId);
}

/**
 * 撤回/失败恢复时，把已移除的申请插回待审列表，但跳过当前列表中已存在（重复）的编号。
 * 返回「应新增」的原始卡片（优先保留原始对象），供调用方拼接回列表头部。
 */
export function restoreApprovalItems<T extends ExemptionApprovalLike>(
  current: readonly T[],
  toRestore: readonly T[],
): T[] {
  const existingIds = new Set(collectApprovalRequestIds([...current]));
  return toRestore.filter((item) => {
    const reqId = resolveApprovalRequestId(item);
    return !reqId || !existingIds.has(reqId);
  });
}

export function getCommandHubDefaultTab(input: {
  todoCount: number;
  approvalCount: number;
  isAdmin: boolean;
}): CommandHubTab {
  if (input.isAdmin) return "approvals";
  if (input.todoCount > 0) return "todos";
  return "todos";
}

export interface ExemptionRequest {
  id: string;
  request_id?: string | null;
  applicant_user_id: string;
  applicant_name: string | null;
  team_id: string | null;
  team_name: string | null;
  exemption_type: string;
  exemption_category: ExemptionCategoryValue;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  feedback?: string | null;
  applicant_month_stats?: {
    approved_leave_days: number;
    approved_waived_days: number;
  };
  daily_items?: Array<{
    id: string;
    request_id: string;
    request_date: string;
    reason: string | null;
    status: "pending" | "approved" | "rejected";
    feedback: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
  }>;
}

export interface DailyApprovalDetail {
  id: string;
  dateStr: string;
  dateDisplay: string;
  dayOfWeek: string;
  nature: "leave" | "waive";
  categoryLabel: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewerFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  originalRequestId: string;
}

export interface GroupedApprovalItem {
  groupKey: string;
  applicant_user_id: string;
  applicant_name: string;
  team_name: string | null;
  nature: "leave" | "waive"; // 请假 vs 特殊豁免
  isPermanent: boolean;
  categoryBadge: string;
  dateRangeText: string;
  dayCount: number;
  reasons: string[];
  created_at: string;
  requestIds: string[];
  items: ExemptionRequest[];
  dailyItems: DailyApprovalDetail[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  isPartiallyProcessed: boolean;
  applicant_month_stats?: {
    approved_leave_days: number;
    approved_waived_days: number;
  };
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(dateStr.trim());
  if (match) {
    const [, , m, d] = match;
    return `${Number(m)}月${Number(d)}日`;
  }
  return dateStr;
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getWeekdayText(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return WEEKDAYS[d.getDay()] || "";
  } catch {
    return "";
  }
}

function parseDateDaysDifference(startStr: string, endStr: string): number {
  const d1 = parseUtcDate(startStr).getTime();
  const d2 = parseUtcDate(endStr).getTime();
  return Math.abs(d2 - d1) / 86_400_000 + 1;
}

function expandDateRange(startDate: string, endDate: string | null): string[] {
  const start = parseUtcDate(startDate);
  const end = endDate ? parseUtcDate(endDate) : start;
  const dates: string[] = [];
  let cursor = start.getTime();
  while (cursor <= end.getTime()) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return dates;
}

export function groupPendingApprovals(items: ExemptionRequest[]): GroupedApprovalItem[] {
  const groupsMap = new Map<string, ExemptionRequest[]>();

  for (const item of items) {
    const isPermanent = item.exemption_type === "permanent";
    const nature = normalizeExemptionCategoryForDisplay(item.exemption_category);
    const groupKey = `${item.applicant_user_id}_${nature}_${isPermanent ? "perm" : "temp"}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey)!.push(item);
  }

  const result: GroupedApprovalItem[] = [];

  for (const [groupKey, groupItems] of groupsMap.entries()) {
    const first = groupItems[0];
    const isPermanent = first.exemption_type === "permanent";
    const nature = normalizeExemptionCategoryForDisplay(first.exemption_category);
    const hasLegacyCategory = groupItems.some((item) => item.exemption_category === null);
    const applicant_name = first.applicant_name || "未命名成员";
    const team_name = first.team_name || null;

    // 展开逐日列表
    const allDatesMap = new Map<string, ExemptionRequest>();
    for (const gi of groupItems) {
      const dates = expandDateRange(gi.start_date, gi.end_date);
      for (const d of dates) {
        if (!allDatesMap.has(d)) {
          allDatesMap.set(d, gi);
        }
      }
    }

    const sortedDates = Array.from(allDatesMap.keys()).sort();
    let dateRangeText = "";
    let dayCount = 0;

    if (isPermanent) {
      dateRangeText = "长期 / 永久";
      dayCount = 0;
    } else if (sortedDates.length === 0) {
      dateRangeText = "未指定日期";
      dayCount = 1;
    } else {
      dayCount = sortedDates.length;
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];
      const spanDays = parseDateDaysDifference(minDate, maxDate);
      if (spanDays === sortedDates.length) {
        dateRangeText = `${formatShortDate(minDate)} 至 ${formatShortDate(maxDate)}`;
      } else if (sortedDates.length <= 2) {
        dateRangeText = sortedDates.map(formatShortDate).join(" · ");
      } else {
        dateRangeText = `${formatShortDate(minDate)} 至 ${formatShortDate(maxDate)} (共 ${sortedDates.length} 天)`;
      }
    }

    let categoryBadge = "";
    if (isPermanent) {
      categoryBadge = nature === "leave"
        ? "永久请假"
        : hasLegacyCategory ? "永久免交（历史兼容）" : "永久豁免";
    } else if (nature === "leave") {
      categoryBadge = dayCount > 1 ? `请假${dayCount}天` : "请假1天";
    } else {
      categoryBadge = hasLegacyCategory
        ? dayCount > 1 ? `免交${dayCount}天（历史兼容）` : "免交申请（历史兼容）"
        : dayCount > 1 ? `免交${dayCount}天` : "免交申请";
    }

    const reasons = Array.from(
      new Set(
        groupItems
          .map((gi) => gi.reason?.trim())
          .filter((r): r is string => Boolean(r)),
      ),
    );

    const created_at = groupItems.reduce(
      (latest, gi) => (gi.created_at > latest ? gi.created_at : latest),
      first.created_at,
    );

    const requestIds = collectApprovalRequestIds(groupItems);

    const storedDaily = groupItems.flatMap((item) => item.daily_items ?? []);
    const dailyItems: DailyApprovalDetail[] = sortedDates.map((dateStr, idx) => {
      const matchItem = allDatesMap.get(dateStr) || first;
      const stored = storedDaily.find((item) => item.request_date === dateStr);
      const reqId = resolveApprovalRequestId(matchItem) || `daily-${first.applicant_user_id}-${dateStr}`;
      const exemptionCat = toExemptionCategory(matchItem.exemption_category);
      const catLabel = getExemptionCategoryLabel(exemptionCat);

      return {
        id: `${reqId}-${dateStr}-${idx}`,
        dateStr,
        dateDisplay: formatShortDate(dateStr),
        dayOfWeek: getWeekdayText(dateStr),
        nature,
        categoryLabel: nature === "leave" ? "请假" : catLabel,
        reason: stored?.reason || matchItem.reason || (reasons[0] || "未填写事由"),
        status: stored?.status || matchItem.request_status || "pending",
        reviewerFeedback: stored?.feedback || matchItem.feedback || null,
        reviewedBy: stored?.reviewed_by || matchItem.reviewed_by_name || null,
        reviewedAt: stored?.reviewed_at ? formatShortDate(stored.reviewed_at) : matchItem.reviewed_at ? formatShortDate(matchItem.reviewed_at) : null,
        originalRequestId: reqId,
      };
    });

    const pendingCount = dailyItems.filter((d) => d.status === "pending").length;
    const approvedCount = dailyItems.filter((d) => d.status === "approved").length;
    const rejectedCount = dailyItems.filter((d) => d.status === "rejected").length;
    const isPartiallyProcessed = approvedCount > 0 || rejectedCount > 0;
    const applicant_month_stats = groupItems.find((gi) => gi.applicant_month_stats)?.applicant_month_stats;

    result.push({
      groupKey,
      applicant_user_id: first.applicant_user_id,
      applicant_name,
      team_name,
      nature,
      isPermanent,
      categoryBadge,
      dateRangeText,
      dayCount,
      reasons,
      created_at,
      requestIds,
      items: groupItems,
      dailyItems,
      pendingCount,
      approvedCount,
      rejectedCount,
      isPartiallyProcessed,
      applicant_month_stats,
    });
  }

  return result;
}
