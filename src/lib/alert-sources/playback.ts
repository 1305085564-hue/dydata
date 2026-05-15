import { getShanghaiDateString, shiftDateString } from "@/lib/remind-submission";
import {
  detectSpike,
  detectSteadyDecline,
  type AlertReport,
} from "@/lib/smart-alert";

import type { Alert, AlertDetectorContext } from "./types";

type ReportRow = {
  user_id: string | null;
  report_date: string;
  play_count: number | null;
  account_id: string | null;
  submitter: string | null;
  accounts:
    | {
        id: string;
        name: string | null;
        content_direction: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        content_direction: string | null;
      }>
    | null;
};

function extractAccount(row: ReportRow["accounts"]) {
  if (Array.isArray(row)) return row[0] ?? null;
  return row ?? null;
}

export async function detectPlaybackAlerts({ supabase, scope, now = new Date() }: AlertDetectorContext): Promise<Alert[]> {
  if (scope.visibleUserIds.length === 0) {
    return [];
  }

  const today = getShanghaiDateString(now);
  const since = shiftDateString(today, -9);
  const { data, error } = await supabase
    .from("daily_reports")
    .select("user_id, report_date, play_count, account_id, submitter, accounts(id, name, content_direction)")
    .in("user_id", scope.visibleUserIds)
    .gte("report_date", since)
    .lte("report_date", today)
    .order("report_date", { ascending: false });

  if (error) throw new Error(error.message);

  const reports = ((data ?? []) as ReportRow[]).flatMap((report) => {
    if (!report.user_id) return [];
    const account = extractAccount(report.accounts);
    return [{
      userId: report.user_id,
      userName: report.submitter?.trim() || account?.name || "未知成员",
      accountId: report.account_id,
      accountName: account?.name ?? null,
      tag: account?.content_direction?.trim() || null,
      reportDate: report.report_date,
      playCount: report.play_count ?? 0,
    } satisfies AlertReport];
  });

  const alerts: Alert[] = [];

  for (const candidate of detectSteadyDecline(reports)) {
    const recentAverage = Math.round(
      candidate.recentReports.reduce((sum, report) => sum + report.playCount, 0) / candidate.recentReports.length,
    );
    alerts.push({
      id: `playback:decline:${candidate.accountId}:${today}`,
      source: "playback",
      severity: recentAverage <= candidate.baselinePlayCount * 0.3 ? "critical" : "warning",
      title: "播放连续下滑",
      detail: `近 3 次播放 ${candidate.recentReports.map((report) => report.playCount).join("/")}，基线约 ${Math.round(candidate.baselinePlayCount)}`,
      affectedEntities: [
        {
          type: "account",
          id: candidate.accountId,
          name: candidate.accountName,
        },
        {
          type: "profile",
          id: candidate.userId,
          name: candidate.userName,
        },
      ],
      suggestedActions: [
        { label: "查看成员", type: "execute_tool", toolName: "getUserInfo", toolArgs: { userId: candidate.userId } },
        { label: "打开分析页", type: "navigate", href: "/admin/analytics" },
      ],
      createdAt: now.toISOString(),
    });
  }

  for (const candidate of detectSpike(reports, now)) {
    const recentHits = candidate.recentDays.reduce((sum, day) => sum + day.hits, 0);
    const recentTotal = candidate.recentDays.reduce((sum, day) => sum + day.total, 0);
    const previousHits = candidate.previousDays.reduce((sum, day) => sum + day.hits, 0);
    const previousTotal = candidate.previousDays.reduce((sum, day) => sum + day.total, 0);
    const recentRate = recentTotal > 0 ? Math.round((recentHits / recentTotal) * 100) : 0;
    const previousRate = previousTotal > 0 ? Math.round((previousHits / previousTotal) * 100) : 0;
    alerts.push({
      id: `playback:spike:${candidate.tag}:${today}`,
      source: "playback",
      severity: "info",
      title: "题材爆发",
      detail: `近 3 天爆款率 ${recentRate}% ，前 7 天 ${previousRate}%`,
      affectedEntities: [],
      suggestedActions: [
        { label: "打开分析页", type: "navigate", href: "/admin/analytics" },
      ],
      createdAt: now.toISOString(),
    });
  }

  const breakoutByAccount = new Map<string, AlertReport>();
  const recentDates = new Set([today, shiftDateString(today, -1)]);
  for (const report of reports) {
    if (!report.accountId || report.playCount < 100000 || !recentDates.has(report.reportDate)) continue;
    const existing = breakoutByAccount.get(report.accountId);
    if (!existing || report.reportDate > existing.reportDate || report.playCount > existing.playCount) {
      breakoutByAccount.set(report.accountId, report);
    }
  }

  for (const report of breakoutByAccount.values()) {
    alerts.push({
      id: `playback:breakout:${report.accountId}:${report.reportDate}`,
      source: "playback",
      severity: "info",
      title: "新爆款诞生",
      detail: `24 小时播放 ${report.playCount.toLocaleString("zh-CN")} ，已超过 10 万阈值`,
      affectedEntities: [
        {
          type: "account",
          id: report.accountId ?? report.userId,
          name: report.accountName ?? "未知账号",
        },
        {
          type: "profile",
          id: report.userId,
          name: report.userName,
        },
      ],
      suggestedActions: [
        { label: "打开分析页", type: "navigate", href: "/admin/analytics" },
      ],
      createdAt: now.toISOString(),
    });
  }

  return alerts;
}
