import { getShanghaiDateString, shiftDateString } from "@/lib/remind-submission";

import type { Alert, AlertDetectorContext } from "./types";

type ReportRow = {
  user_id: string | null;
  report_date: string;
  follower_convert: number | null;
  submitter: string | null;
};

export async function detectConversionAlerts({ supabase, scope, now = new Date() }: AlertDetectorContext): Promise<Alert[]> {
  if (scope.visibleUserIds.length === 0) {
    return [];
  }

  const today = getShanghaiDateString(now);
  const previousWeekStart = shiftDateString(today, -13);
  const { data, error } = await supabase
    .from("daily_reports")
    .select("user_id, report_date, follower_convert, submitter")
    .in("user_id", scope.visibleUserIds)
    .gte("report_date", previousWeekStart)
    .lte("report_date", today);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ReportRow[];
  const currentWeekDates = new Set(Array.from({ length: 7 }, (_, index) => shiftDateString(today, -index)));
  const previousWeekDates = new Set(Array.from({ length: 7 }, (_, index) => shiftDateString(today, -(index + 7))));
  const alerts: Alert[] = [];

  const currentWeekTotal = rows
    .filter((row) => currentWeekDates.has(row.report_date))
    .reduce((sum, row) => sum + Math.max(Number(row.follower_convert ?? 0), 0), 0);
  const previousWeekTotal = rows
    .filter((row) => previousWeekDates.has(row.report_date))
    .reduce((sum, row) => sum + Math.max(Number(row.follower_convert ?? 0), 0), 0);

  if (previousWeekTotal > 0 && currentWeekTotal < previousWeekTotal * 0.7) {
    alerts.push({
      id: `conversion:team-drop:${today}`,
      source: "conversion",
      severity: "warning",
      title: "团队导粉下滑",
      detail: `近 7 日导粉 ${currentWeekTotal} ，上周同期 ${previousWeekTotal}`,
      affectedEntities: [],
      suggestedActions: [
        { label: "打开经营分析", type: "navigate", href: "/admin/analytics" },
      ],
      createdAt: now.toISOString(),
    });
  }

  const recentThreeDays = new Set(Array.from({ length: 3 }, (_, index) => shiftDateString(today, -index)));
  const memberMap = new Map<string, { name: string; reports: number; converts: number }>();
  for (const row of rows) {
    if (!row.user_id || !recentThreeDays.has(row.report_date)) continue;
    const current = memberMap.get(row.user_id) ?? {
      name: row.submitter?.trim() || "未知成员",
      reports: 0,
      converts: 0,
    };
    current.reports += 1;
    current.converts += Math.max(Number(row.follower_convert ?? 0), 0);
    memberMap.set(row.user_id, current);
  }

  for (const [userId, member] of memberMap.entries()) {
    if (member.reports === 0 || member.converts > 0) continue;
    alerts.push({
      id: `conversion:member-zero:${userId}:${today}`,
      source: "conversion",
      severity: "info",
      title: "有发布但 3 日导粉为 0",
      detail: `${member.name} 近 3 天有发布，但导粉仍为 0`,
      affectedEntities: [
        {
          type: "profile",
          id: userId,
          name: member.name,
        },
      ],
      suggestedActions: [
        { label: "查看成员", type: "execute_tool", toolName: "getUserInfo", toolArgs: { userId } },
        { label: "打开经营分析", type: "navigate", href: "/admin/analytics" },
      ],
      createdAt: now.toISOString(),
    });
  }

  return alerts;
}
