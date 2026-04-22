import type { ExemptionState } from "@/lib/豁免";

export interface TodaySubmissionReportLike {
  account_id: string | null;
  title: string | null;
  content?: string | null;
  report_date: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  published_at: string | null;
  uploaded_at: string | null;
}

export interface TodaySubmissionSummary {
  accountId: string;
  title: string | null;
  content: string | null;
  reportDate: string;
  playCount: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  followerGain: number | null;
  followerConvert: number | null;
  completionRate: string | null;
  avgPlayDuration: string | null;
  bounceRate2s: string | null;
  completionRate5s: string | null;
  publishedAt: string | null;
  uploadedAt: string | null;
}

export type SubmissionDayState = "submitted" | "waive" | "leave" | "unsubmitted" | "missing" | "future";
export type SubmitPanelRequestedMode = "editToday" | "backfill" | null;
export type SubmitPanelMode = "summary" | "create" | "editToday" | "backfill";

export interface SubmissionDayStatus {
  state: SubmissionDayState;
  label: "已交" | "免交" | "请假" | "未交" | "漏交" | "未到";
  description: string;
  tone: "submitted" | "leave" | "pending" | "editing";
  isCompleted: boolean;
  canBackfill: boolean;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function pickLatestReportForAccount(
  reports: TodaySubmissionReportLike[],
  accountId: string,
): TodaySubmissionReportLike | null {
  const matched = reports.filter((report) => report.account_id === accountId);
  if (matched.length === 0) return null;

  return matched.slice(1).reduce<TodaySubmissionReportLike>((latest, current) => {
    const currentUploadedAt = toTimestamp(current.uploaded_at);
    const latestUploadedAt = toTimestamp(latest.uploaded_at);

    if (currentUploadedAt !== latestUploadedAt) {
      return currentUploadedAt > latestUploadedAt ? current : latest;
    }

    const currentReportDate = toTimestamp(current.report_date);
    const latestReportDate = toTimestamp(latest.report_date);
    return currentReportDate > latestReportDate ? current : latest;
  }, matched[0]);
}

export function getTodaySubmissionSummary(
  reports: TodaySubmissionReportLike[],
  accountId: string,
): TodaySubmissionSummary | null {
  const matched = pickLatestReportForAccount(reports, accountId);
  if (!matched) return null;

  return {
    accountId,
    title: matched.title,
    content: matched.content ?? null,
    reportDate: matched.report_date,
    playCount: matched.play_count,
    likes: matched.likes,
    comments: matched.comments,
    shares: matched.shares,
    favorites: matched.favorites,
    followerGain: matched.follower_gain,
    followerConvert: matched.follower_convert ?? null,
    completionRate: matched.completion_rate,
    avgPlayDuration: matched.avg_play_duration,
    bounceRate2s: matched.bounce_rate_2s,
    completionRate5s: matched.completion_rate_5s,
    publishedAt: matched.published_at,
    uploadedAt: matched.uploaded_at,
  };
}

export function resolveSubmitPanelMode({
  summary,
  requestedMode,
}: {
  summary: TodaySubmissionSummary | null;
  requestedMode: SubmitPanelRequestedMode;
}): SubmitPanelMode {
  if (requestedMode === "editToday") return "editToday";
  if (requestedMode === "backfill") return "backfill";
  if (summary) return "summary";
  return "create";
}

export function resolveSubmissionDayStatus({
  date,
  today,
  report,
  exemption,
}: {
  date: string;
  today: string;
  report: TodaySubmissionSummary | TodaySubmissionReportLike | null;
  exemption: ExemptionState;
}): SubmissionDayStatus {
  if (report) {
    return {
      state: "submitted",
      label: "已交",
      description: "当天数据已提交。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
    };
  }

  if (exemption.isExempt) {
    if (exemption.category === "leave") {
      return {
        state: "leave",
        label: "请假",
        description: "当天已按请假处理，不计入未交或漏交。",
        tone: "leave",
        isCompleted: false,
        canBackfill: false,
      };
    }

    return {
      state: "waive",
      label: "免交",
      description: "当天已按免交处理，视作已完成，无需再提交。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
    };
  }

  if (date > today) {
    return {
      state: "future",
      label: "未到",
      description: "该日期还没到，无需提交。",
      tone: "editing",
      isCompleted: false,
      canBackfill: false,
    };
  }

  if (date === today) {
    return {
      state: "unsubmitted",
      label: "未交",
      description: "当天还没有提交数据。",
      tone: "pending",
      isCompleted: false,
      canBackfill: true,
    };
  }

  return {
    state: "missing",
    label: "漏交",
    description: "该日期没有提交数据，也没有免交或请假记录。",
    tone: "pending",
    isCompleted: false,
    canBackfill: true,
  };
}
