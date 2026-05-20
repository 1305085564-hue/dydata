import { getShanghaiDateString, shiftDateString } from "@/lib/remind-submission";

import type { Alert, AlertDetectorContext } from "./types";

type ViolationRow = {
  status: string | null;
  created_at: string;
};

function startOfWeek(date: string) {
  const value = new Date(`${date}T00:00:00+08:00`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value;
}

function startOfShanghaiDay(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

export async function detectViolationAlerts({ supabase, scope, now = new Date() }: AlertDetectorContext): Promise<Alert[]> {
  let pendingCountQuery = supabase
    .from("violation_cases")
    .select("id", { count: "exact", head: true })
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .eq("status", "submitted");

  if (scope.businessRole === "team_admin") {
    if (!scope.teamId) return [];
    pendingCountQuery = pendingCountQuery.eq("team_id", scope.teamId);
  }

  const today = getShanghaiDateString(now);
  const currentWeekStart = startOfWeek(today);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setUTCSeconds(previousWeekEnd.getUTCSeconds() - 1);

  let weeklyQuery = supabase
    .from("violation_cases")
    .select("status, created_at")
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .gte("created_at", previousWeekStart.toISOString())
    .lte("created_at", now.toISOString());

  if (scope.businessRole === "team_admin") {
    if (!scope.teamId) return [];
    weeklyQuery = weeklyQuery.eq("team_id", scope.teamId);
  }

  const [{ count: pendingCount, error: pendingError }, { data: weeklyRows, error: weeklyError }] = await Promise.all([
    pendingCountQuery,
    weeklyQuery,
  ]);

  if (pendingError) throw new Error(pendingError.message);
  if (weeklyError) throw new Error(weeklyError.message);

  const alerts: Alert[] = [];

  if ((pendingCount ?? 0) >= 5) {
    alerts.push({
      id: `violation:pending:${today}`,
      source: "violation",
      severity: "critical",
      title: "待复核违规堆积",
      detail: `当前有 ${pendingCount} 条违规待复核`,
      affectedEntities: [],
      suggestedActions: [
        { label: "打开合规审核", type: "navigate", href: "/violations?perspective=review&status=submitted" },
      ],
      createdAt: now.toISOString(),
    });
  }

  const currentRows = ((weeklyRows ?? []) as ViolationRow[]).filter((row) => new Date(row.created_at).getTime() >= currentWeekStart.getTime());
  const previousRows = ((weeklyRows ?? []) as ViolationRow[]).filter((row) => {
    const createdAt = new Date(row.created_at).getTime();
    return createdAt >= previousWeekStart.getTime() && createdAt <= previousWeekEnd.getTime();
  });

  const currentRate = currentRows.length > 0 ? currentRows.filter((row) => row.status === "verified").length / currentRows.length : 0;
  const previousRate = previousRows.length > 0 ? previousRows.filter((row) => row.status === "verified").length / previousRows.length : 0;
  const rateGrowth = previousRate > 0 ? (currentRate - previousRate) / previousRate : currentRate > 0 && currentRows.length >= 5 ? 1 : 0;

  if (rateGrowth > 0.5) {
    alerts.push({
      id: `violation:rate:${startOfShanghaiDay(today)}`,
      source: "violation",
      severity: "warning",
      title: "本周违规率上升",
      detail: `本周违规率 ${(currentRate * 100).toFixed(0)}% ，上周 ${(previousRate * 100).toFixed(0)}%`,
      affectedEntities: [],
      suggestedActions: [
        { label: "打开合规审核", type: "navigate", href: "/violations?perspective=review" },
      ],
      createdAt: now.toISOString(),
    });
  }

  return alerts;
}
