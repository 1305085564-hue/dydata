import { getAnomalousData } from "@/lib/admin-tools/data-query";
import { getShanghaiDateString, shiftDateString } from "@/lib/remind-submission";
import { detectNoSubmission, type AlertProfile, type AlertReport } from "@/lib/smart-alert";

import type { Alert, AlertDetectorContext, SuggestedAction } from "./types";

const DATA_REPORT_DEADLINE = "11:15";

type ProfileRow = {
  id: string;
  name: string;
  status: string | null;
};

type ReportRow = {
  user_id: string | null;
  account_id: string | null;
  report_date: string;
};

type ExemptionGrantRow = {
  user_id: string | null;
  end_date: string | null;
};

function buildMemberActions(userId: string): SuggestedAction[] {
  return [
    {
      label: "查看成员",
      type: "execute_tool",
      toolName: "getUserInfo",
      toolArgs: { userId },
    },
    {
      label: "打开后台",
      type: "navigate",
      href: "/admin",
    },
  ];
}

function getShanghaiHourMinute(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [hourText = "00", minuteText = "00"] = formatter.format(now).split(":");
  return {
    hour: Number.parseInt(hourText, 10) || 0,
    minute: Number.parseInt(minuteText, 10) || 0,
  };
}

function getMinutesUntilDataDeadline(now: Date) {
  const { hour, minute } = getShanghaiHourMinute(now);
  const [deadlineHourText, deadlineMinuteText] = DATA_REPORT_DEADLINE.split(":");
  const deadlineMinutes = (Number.parseInt(deadlineHourText, 10) || 0) * 60 + (Number.parseInt(deadlineMinuteText, 10) || 0);
  const currentMinutes = hour * 60 + minute;
  return deadlineMinutes - currentMinutes;
}

function isAlertArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value);
}

export async function detectSubmissionAlerts({ supabase, scope, now = new Date() }: AlertDetectorContext): Promise<Alert[]> {
  if (scope.visibleUserIds.length === 0) {
    return [];
  }

  const today = getShanghaiDateString(now);
  const since = shiftDateString(today, -6);
  const tomorrow = shiftDateString(today, 1);

  const [{ data: profilesRaw, error: profilesError }, { data: reportsRaw, error: reportsError }, { data: exemptionsRaw, error: exemptionsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, status")
      .eq("role", "member")
      .in("id", scope.visibleUserIds),
    supabase
      .from("daily_reports")
      .select("user_id, account_id, report_date")
      .in("user_id", scope.visibleUserIds)
      .gte("report_date", since)
      .lte("report_date", today),
    supabase
      .from("exemption_grant")
      .select("user_id, end_date")
      .eq("status", "active")
      .in("user_id", scope.visibleUserIds)
      .gte("end_date", today)
      .lte("end_date", tomorrow),
  ]);

  if (profilesError) throw new Error(profilesError.message);
  if (reportsError) throw new Error(reportsError.message);
  if (exemptionsError) throw new Error(exemptionsError.message);

  const profiles = (profilesRaw ?? []) as ProfileRow[];
  const reports = (reportsRaw ?? []) as ReportRow[];
  const profileNameById = new Map(profiles.map((profile) => [profile.id, profile.name]));

  const smartProfiles: AlertProfile[] = profiles.map((profile) => ({
    userId: profile.id,
    userName: profile.name,
    status: profile.status,
  }));

  const smartReports: AlertReport[] = reports.flatMap((report) => {
    if (!report.user_id) return [];
    return [{
      userId: report.user_id,
      userName: profileNameById.get(report.user_id) ?? "未知成员",
      accountId: report.account_id,
      accountName: null,
      tag: null,
      reportDate: report.report_date,
      playCount: 0,
    }];
  });

  const alerts: Alert[] = detectNoSubmission(smartProfiles, smartReports, now)
    .filter((candidate) => candidate.missingDays >= 2)
    .map((candidate) => ({
      id: `submission:no-submission:${candidate.userId}:${today}`,
      source: "submission",
      severity: candidate.missingDays >= 3 ? "critical" : "warning",
      title: "连续未填报",
      detail: `连续 ${candidate.missingDays} 天未填报`,
      affectedEntities: [
        {
          type: "profile",
          id: candidate.userId,
          name: candidate.userName,
        },
      ],
      suggestedActions: buildMemberActions(candidate.userId),
      createdAt: now.toISOString(),
    }));

  for (const grant of (exemptionsRaw ?? []) as ExemptionGrantRow[]) {
    if (!grant.user_id || !grant.end_date) continue;
    const userName = profileNameById.get(grant.user_id) ?? "未知成员";
    alerts.push({
      id: `submission:exemption-expire:${grant.user_id}:${grant.end_date}`,
      source: "submission",
      severity: grant.end_date === today ? "critical" : "warning",
      title: "豁免即将到期",
      detail: grant.end_date === today ? "豁免今天到期，请确认是否恢复填报" : "豁免明天到期，请提前提醒成员",
      affectedEntities: [
        {
          type: "profile",
          id: grant.user_id,
          name: userName,
        },
      ],
      suggestedActions: buildMemberActions(grant.user_id),
      createdAt: now.toISOString(),
    });
  }

  const minutesUntilDeadline = getMinutesUntilDataDeadline(now);
  if (minutesUntilDeadline > 0 && minutesUntilDeadline <= 60) {
    const anomalousData = await getAnomalousData({
      type: "no_submission",
      dateRange: { end: today },
    });

    const rawAnomalies = anomalousData.success
      ? (anomalousData.data as { anomalies?: unknown } | undefined)?.anomalies
      : [];

    if (isAlertArray(rawAnomalies)) {
      for (const row of rawAnomalies) {
        const userId = typeof row.userId === "string" ? row.userId : null;
        if (!userId || !scope.visibleUserIds.includes(userId)) continue;
        const userName = typeof row.userName === "string" ? row.userName : profileNameById.get(userId) ?? "未知成员";
        alerts.push({
          id: `submission:deadline:${userId}:${today}`,
          source: "submission",
          severity: minutesUntilDeadline <= 15 ? "critical" : "warning",
          title: "截止前仍未填报",
          detail: `距离今日截止还有 ${minutesUntilDeadline} 分钟，成员仍未填报`,
          affectedEntities: [
            {
              type: "profile",
              id: userId,
              name: userName,
            },
          ],
          suggestedActions: buildMemberActions(userId),
          createdAt: now.toISOString(),
        });
      }
    }
  }

  return alerts;
}
