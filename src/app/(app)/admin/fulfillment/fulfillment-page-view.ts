import type {
  FulfillmentAppeal,
  FulfillmentCalendarData,
  FulfillmentMemberSummary,
  FulfillmentPendingExemption,
} from "@/types/fulfillment";

/**
 * 发布管理页的「说法」：标题、今天那一行、分段与排序。纯函数，便于单测。
 * 一页一问：这个月谁在掉队，今天还有什么要我处理？
 */

/** 断更：连续未发 ≥ 2 天（与大表行内「断 N 天」同一条线；连续 1 天多半只是今天还没发） */
export const MISSING_STREAK_THRESHOLD = 2;

export type RosterSegment = "all" | "behind" | "missing";

export const ROSTER_SEGMENTS: { key: RosterSegment; label: string; tip?: string }[] = [
  { key: "all", label: "全部" },
  { key: "behind", label: "落后", tip: "截至今天，已发条数少于应发条数" },
  { key: "missing", label: "断更", tip: `连续 ${MISSING_STREAK_THRESHOLD} 天及以上没发` },
];

export function isBehind(member: FulfillmentMemberSummary) {
  return member.requiredCount > 0 && member.publishedCount < member.requiredCount;
}

export function isMissingStreak(member: FulfillmentMemberSummary) {
  return member.consecutiveMissing >= MISSING_STREAK_THRESHOLD;
}

export function countRosterSegments(members: FulfillmentMemberSummary[]): Record<RosterSegment, number> {
  return {
    all: members.length,
    behind: members.filter(isBehind).length,
    missing: members.filter(isMissingStreak).length,
  };
}

export function filterRosterSegment(members: FulfillmentMemberSummary[], segment: RosterSegment) {
  if (segment === "behind") return members.filter(isBehind);
  if (segment === "missing") return members.filter(isMissingStreak);
  return members;
}

/** 大表排序：按本月达成率，默认落后在前；断更分段里按连续未发天数从多到少 */
export type RosterSortDir = "asc" | "desc";

export function sortRoster(
  members: FulfillmentMemberSummary[],
  segment: RosterSegment,
  dir: RosterSortDir,
): FulfillmentMemberSummary[] {
  const list = [...members];
  if (segment === "missing") {
    return list.sort((a, b) => b.consecutiveMissing - a.consecutiveMissing || a.fulfillmentRate - b.fulfillmentRate);
  }
  const sign = dir === "asc" ? 1 : -1;
  return list.sort(
    (a, b) => sign * (a.fulfillmentRate - b.fulfillmentRate) || b.remainingCount - a.remainingCount,
  );
}

/** 页头即答案，和协作管理同一种说法：「11月 · 已发 412 / 480 条，达成 86%」 */
export function buildFulfillmentHeadline(input: {
  month: number;
  stats: Pick<FulfillmentCalendarData["stats"], "totalMembers" | "publishedCount" | "requiredCount" | "periodFulfillmentRate">;
}) {
  const { month, stats } = input;
  if (stats.totalMembers === 0) return `${month}月 · 没有需要发布的成员`;
  if (stats.requiredCount === 0) return `${month}月 · 还没有应发的天`;
  return `${month}月 · 已发 ${stats.publishedCount.toLocaleString()} / ${stats.requiredCount.toLocaleString()} 条，达成 ${stats.periodFulfillmentRate}%`;
}

export interface PendingLeaveItem {
  request: FulfillmentPendingExemption;
  member: FulfillmentMemberSummary;
}

/** 本月大表里所有待批的请假/免交申请（同一申请跨多天只算一次） */
export function collectPendingLeaves(members: FulfillmentMemberSummary[]): PendingLeaveItem[] {
  const seenIds = new Set<string>();
  const items: PendingLeaveItem[] = [];
  for (const member of members) {
    for (const day of Object.values(member.days)) {
      const request = day.pendingExemption;
      if (!request || seenIds.has(request.id)) continue;
      seenIds.add(request.id);
      items.push({ request, member });
    }
  }
  return items.sort((a, b) => a.request.start_date.localeCompare(b.request.start_date));
}

export function pendingAppealsOf(appeals: FulfillmentAppeal[]) {
  return appeals.filter((appeal) => appeal.status === "pending");
}

/**
 * 页头下面那一行：今天的事。只在看本月时说「今天」；没事就一句「今天全员已有着落」。
 * 待审（补交、请假）不分月份，有就说。
 */
export function buildTodayLine(input: {
  isCurrentMonth: boolean;
  unconfirmedToday: number;
  pendingAppeals: number;
  pendingLeaves: number;
}): { text: string; hasWork: boolean } {
  const parts: string[] = [];
  if (input.isCurrentMonth && input.unconfirmedToday > 0) parts.push(`今天还有 ${input.unconfirmedToday} 人没发`);
  if (input.pendingAppeals > 0) parts.push(`${input.pendingAppeals} 条补交待审`);
  if (input.pendingLeaves > 0) parts.push(`${input.pendingLeaves} 条请假待批`);
  if (parts.length > 0) return { text: parts.join(" · "), hasWork: true };
  return { text: input.isCurrentMonth ? "今天全员已有着落" : "这个月没有待处理的事", hasWork: false };
}

export function formatMonthDay(dateKey: string) {
  return `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`;
}
