import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FulfillmentCalendarData,
  FulfillmentDayRecord,
  FulfillmentMemberSummary,
  FulfillmentStatus,
} from "@/types/fulfillment";

export type FulfillmentCalendarRpcRow = {
  user_id: string;
  user_name: string;
  team_id: string | null;
  team_name: string | null;
  group_id: string | null;
  group_name: string | null;
  record_date: string;
  status: FulfillmentStatus;
  reason: string | null;
  marked_by_name: string | null;
  published_count: number | null;
  consecutive_missing: number | null;
};

type BuildFulfillmentCalendarInput = {
  year: number;
  month: number;
  rows: FulfillmentCalendarRpcRow[];
  today?: string;
};

const FULFILLED_STATUSES = new Set<FulfillmentStatus>(["published", "confirmed_published"]);
const WAIVED_STATUSES = new Set<FulfillmentStatus>(["waived", "exempted"]);

function formatTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function incrementMemberSummary(summary: FulfillmentMemberSummary, day: FulfillmentDayRecord) {
  summary.totalDays += 1;
  summary.consecutiveMissing = Math.max(summary.consecutiveMissing, day.consecutiveMissing);
  summary.days[day.date] = day;

  if (FULFILLED_STATUSES.has(day.status)) {
    summary.publishedDays += 1;
  } else if (day.status === "leave") {
    summary.leaveDays += 1;
  } else if (WAIVED_STATUSES.has(day.status)) {
    summary.waivedDays += 1;
  } else if (day.status === "absent") {
    summary.absentDays += 1;
  } else if (day.status === "unconfirmed") {
    summary.unconfirmedDays += 1;
  }
}

function createMemberSummary(row: FulfillmentCalendarRpcRow): FulfillmentMemberSummary {
  return {
    userId: row.user_id,
    userName: row.user_name,
    teamName: row.team_name,
    groupName: row.group_name,
    totalDays: 0,
    publishedDays: 0,
    leaveDays: 0,
    waivedDays: 0,
    absentDays: 0,
    unconfirmedDays: 0,
    consecutiveMissing: 0,
    fulfillmentRate: 0,
    days: {},
  };
}

function toDayRecord(row: FulfillmentCalendarRpcRow): FulfillmentDayRecord {
  return {
    userId: row.user_id,
    userName: row.user_name,
    teamId: row.team_id,
    teamName: row.team_name,
    groupId: row.group_id,
    groupName: row.group_name,
    date: row.record_date,
    status: row.status,
    reason: row.reason ?? "",
    markedByName: row.marked_by_name ?? "",
    publishedCount: row.published_count ?? 0,
    consecutiveMissing: row.consecutive_missing ?? 0,
  };
}

export function buildFulfillmentCalendarData({
  year,
  month,
  rows,
  today = formatTodayDateOnly(),
}: BuildFulfillmentCalendarInput): FulfillmentCalendarData {
  const memberMap = new Map<string, FulfillmentMemberSummary>();

  for (const row of rows) {
    const summary = memberMap.get(row.user_id) ?? createMemberSummary(row);
    incrementMemberSummary(summary, toDayRecord(row));
    memberMap.set(row.user_id, summary);
  }

  const members = Array.from(memberMap.values()).map((member) => ({
    ...member,
    fulfillmentRate: toPercent(member.publishedDays, member.totalDays),
  }));
  const todayRows = rows.filter((row) => row.record_date === today);
  const publishedDays = members.reduce((total, member) => total + member.publishedDays, 0);
  const totalDays = members.reduce((total, member) => total + member.totalDays, 0);

  return {
    year,
    month,
    members,
    todayExceptions: members
      .filter((member) => member.days[today]?.status === "unconfirmed")
      .sort((left, right) => right.consecutiveMissing - left.consecutiveMissing),
    stats: {
      totalMembers: members.length,
      publishedToday: todayRows.filter((row) => FULFILLED_STATUSES.has(row.status)).length,
      pendingToday: todayRows.filter((row) => row.status === "unconfirmed").length,
      leaveToday: todayRows.filter((row) => row.status === "leave").length,
      waivedToday: todayRows.filter((row) => WAIVED_STATUSES.has(row.status)).length,
      absentToday: todayRows.filter((row) => row.status === "absent").length,
      monthlyFulfillmentRate: toPercent(publishedDays, totalDays),
    },
  };
}

export async function loadFulfillmentCalendar(
  year: number,
  month: number,
  visibleUserIds: string[] = [],
): Promise<FulfillmentCalendarData> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_fulfillment_calendar", {
    target_year: year,
    target_month: month,
    p_visible_user_ids: visibleUserIds.length > 0 ? visibleUserIds : null,
  });

  if (error) {
    throw new Error(error.message || "加载发布履约日历失败");
  }

  return buildFulfillmentCalendarData({
    year,
    month,
    rows: (data ?? []) as FulfillmentCalendarRpcRow[],
  });
}
