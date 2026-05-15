import { getShanghaiDateString, shiftDateString } from "@/lib/remind-submission";
import { countIssueSeverities, normalizeSampleQualityIssues } from "@/lib/sample-quality";

import type { Alert, AlertDetectorContext } from "./types";

type VideoRow = {
  id: string;
  user_id: string | null;
  uploaded_at: string | null;
  created_at: string;
  video_title: string | null;
};

type SampleQualityIssueRow = {
  id: string;
  report_id: string;
  severity: "critical" | "warning";
  issues_json: unknown;
  created_at: string;
};

type ReportLiteRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  report_date: string;
  submitter: string | null;
};

function toShanghaiDate(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

async function loadUploadOcrFailureAlerts(context: AlertDetectorContext): Promise<Alert[]> {
  const since = new Date((context.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: issueRows, error } = await context.supabase
    .from("sample_quality_issues")
    .select("id, report_id, severity, issues_json, created_at")
    .is("resolved_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (issueRows ?? []) as SampleQualityIssueRow[];
  if (rows.length === 0) {
    return [];
  }

  const reportIds = Array.from(new Set(rows.map((row) => row.report_id)));
  const { data: reports, error: reportError } = await context.supabase
    .from("daily_reports")
    .select("id, user_id, title, report_date, submitter")
    .in("id", reportIds)
    .in("user_id", context.scope.visibleUserIds);

  if (reportError) {
    throw new Error(reportError.message);
  }

  const reportMap = new Map(
    ((reports ?? []) as ReportLiteRow[]).map((report) => [report.id, report]),
  );

  const alerts: Alert[] = [];
  for (const row of rows) {
    const report = reportMap.get(row.report_id);
    if (!report || !report.user_id) continue;

    const issues = normalizeSampleQualityIssues(row.issues_json);
    const counts = countIssueSeverities(issues);
    if (counts.critical < 3 && counts.warning < 5) {
      continue;
    }

    alerts.push({
      id: `upload:sample-quality:${row.report_id}`,
      source: "upload",
      severity: counts.critical >= 3 ? "critical" : "warning",
      title: "上传样本质量异常",
      detail:
        counts.critical >= 3
          ? `该样本有 ${counts.critical} 个严重问题，建议立即复核`
          : `该样本有 ${counts.warning} 个警告问题，建议尽快检查`,
      affectedEntities: [
        {
          type: "profile",
          id: report.user_id,
          name: report.submitter?.trim() || report.title?.trim() || "未知成员",
        },
      ],
      suggestedActions: [
        { label: "打开填报页", type: "navigate", href: `/dashboard?focus=${encodeURIComponent(row.report_id)}` },
      ],
      createdAt: row.created_at,
    });
  }

  return alerts;
}

export async function detectUploadAlerts({ supabase, scope, now = new Date() }: AlertDetectorContext): Promise<Alert[]> {
  if (scope.visibleUserIds.length === 0) {
    return [];
  }

  const today = getShanghaiDateString(now);
  const yesterday = shiftDateString(today, -1);
  const { data, error } = await supabase
    .from("videos")
    .select("id, user_id, uploaded_at, created_at, video_title")
    .in("user_id", scope.visibleUserIds)
    .gte("created_at", new Date(`${yesterday}T00:00:00+08:00`).toISOString())
    .lte("created_at", now.toISOString());

  if (error) throw new Error(error.message);

  let todayCount = 0;
  let yesterdayCount = 0;
  for (const row of (data ?? []) as VideoRow[]) {
    const uploadedDate = toShanghaiDate(row.uploaded_at ?? row.created_at);
    if (uploadedDate === today) todayCount += 1;
    if (uploadedDate === yesterday) yesterdayCount += 1;
  }

  const alerts: Alert[] = [];
  const base = Math.max(yesterdayCount, 1);
  const diffRatio = Math.abs(todayCount - yesterdayCount) / base;

  if ((todayCount > 0 || yesterdayCount > 0) && diffRatio > 0.5) {
    alerts.push({
      id: `upload:daily-diff:${today}`,
      source: "upload",
      severity: "warning",
      title: "上传量波动过大",
      detail: `今日上传 ${todayCount} 条，昨日 ${yesterdayCount} 条，波动超过 50%`,
      affectedEntities: [],
      suggestedActions: [
        { label: "打开视频列表", type: "navigate", href: "/admin/videos" },
      ],
      createdAt: now.toISOString(),
    });
  }

  alerts.push(...(await loadUploadOcrFailureAlerts({ supabase, scope, now })));
  return alerts;
}
