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

export type DashboardReportRecord = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

export type DashboardActivityLoadState =
  | { status: "idle" | "loading" | "ready" }
  | { status: "error"; message: string };

export function getDashboardReportKey(
  report: Pick<TodaySubmissionReportLike, "account_id" | "report_date">,
) {
  if (!report.account_id || !report.report_date) return null;
  return `${report.account_id}:${report.report_date}`;
}

export function isDashboardReport(
  report: TodaySubmissionReportLike & { id?: string | null },
): report is DashboardReportRecord {
  return typeof report.id === "string" && typeof report.account_id === "string";
}

function reportTimestamp(report: Pick<TodaySubmissionReportLike, "uploaded_at" | "published_at">) {
  const value = report.uploaded_at ?? report.published_at;
  if (!value) return Number.NEGATIVE_INFINITY;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function toDashboardReportRecord(
  report: TodaySubmissionReportLike,
  fallbackId: string,
): DashboardReportRecord | null {
  const accountId = report.account_id;
  const key = getDashboardReportKey(report);
  if (!key || !accountId) return null;

  return {
    ...report,
    id: fallbackId,
    account_id: accountId,
  };
}

/**
 * Merge server snapshots and local submit results into one date-level view.
 * Activity data wins over the first-screen snapshot; a local override always wins.
 */
export function mergeDashboardReports({
  initialReports = [],
  activityReports = [],
  overrides = [],
}: {
  initialReports?: readonly DashboardReportRecord[];
  activityReports?: readonly DashboardReportRecord[];
  overrides?: readonly TodaySubmissionReportLike[];
} = {}): DashboardReportRecord[] {
  const merged = new Map<string, { report: DashboardReportRecord; priority: number }>();

  function addReport(report: DashboardReportRecord, priority: number) {
    const key = getDashboardReportKey(report);
    if (!key) return;

    const current = merged.get(key);
    if (!current) {
      merged.set(key, { report, priority });
      return;
    }

    const isHigherPriority = priority > current.priority;
    const isSamePriorityAndNewer =
      priority === current.priority && reportTimestamp(report) >= reportTimestamp(current.report);

    if (isHigherPriority || isSamePriorityAndNewer) {
      merged.set(key, { report, priority });
    }
  }

  for (const report of initialReports) addReport(report, 0);
  for (const report of activityReports) addReport(report, 1);
  for (const override of overrides) {
    const key = getDashboardReportKey(override);
    if (!key) continue;

    const report = toDashboardReportRecord(override, `override-${key}`);
    if (report) addReport(report, 2);
  }

  return Array.from(merged.values(), (entry) => entry.report);
}

export function getDashboardSubmittedDates(
  reports: ReadonlyArray<{ report_date: string | null | undefined }>,
) {
  return Array.from(
    new Set(reports.map((report) => report.report_date).filter((date): date is string => Boolean(date))),
  ).sort();
}

export function mergeDashboardSubmittedDates(...dateLists: Array<readonly string[] | undefined>) {
  return Array.from(
    new Set(dateLists.flatMap((dates) => (dates ?? []).filter(Boolean))),
  ).sort();
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

export type SubmissionDayState =
  | "submitted"
  | "waive"
  | "leave"
  | "unsubmitted"
  | "missing"
  | "future"
  | "activityError";
export type SubmitPanelRequestedMode = "editToday" | "backfill" | null;
export type SubmitPanelMode = "summary" | "create" | "editToday" | "backfill";

export interface SubmissionDayStatus {
  state: SubmissionDayState;
  label: "已交" | "免交" | "请假" | "未交" | "漏交" | "未到" | "加载失败";
  description: string;
  tone: "submitted" | "leave" | "pending" | "editing";
  isCompleted: boolean;
  canBackfill: boolean;
  requiresActivityRetry: boolean;
  errorMessage: string | null;
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
  report = null,
  activeDateStatus = null,
}: {
  summary: TodaySubmissionSummary | null;
  requestedMode: SubmitPanelRequestedMode;
  report?: TodaySubmissionReportLike | null;
  activeDateStatus?: Pick<SubmissionDayStatus, "state" | "canBackfill"> | null;
}): SubmitPanelMode {
  if (requestedMode === "editToday") return "editToday";
  if (requestedMode === "backfill") {
    if (report || activeDateStatus?.state === "submitted" || activeDateStatus?.canBackfill === false) {
      return "summary";
    }
    return "backfill";
  }
  if (summary) return "summary";
  if (report || activeDateStatus?.state === "submitted") return "summary";
  return "create";
}

export function resolveSubmissionDayStatus({
  date,
  today,
  report,
  exemption,
  activity,
}: {
  date: string;
  today: string;
  report: TodaySubmissionSummary | TodaySubmissionReportLike | null;
  exemption: ExemptionState;
  activity?: DashboardActivityLoadState | null;
}): SubmissionDayStatus {
  if (report) {
    return {
      state: "submitted",
      label: "已交",
      description: "当天数据已提交。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
      requiresActivityRetry: false,
      errorMessage: null,
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
        requiresActivityRetry: false,
        errorMessage: null,
      };
    }

    return {
      state: "waive",
      label: "免交",
      description: "当天已按免交处理，视作已完成，无需再提交。",
      tone: "submitted",
      isCompleted: true,
      canBackfill: false,
      requiresActivityRetry: false,
      errorMessage: null,
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
      requiresActivityRetry: false,
      errorMessage: null,
    };
  }

  if (date < today && activity?.status === "error") {
    return {
      state: "activityError",
      label: "加载失败",
      description: "历史记录加载失败，请先重试后再判断是否允许补交。",
      tone: "pending",
      isCompleted: false,
      canBackfill: false,
      requiresActivityRetry: true,
      errorMessage: activity.message,
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
      requiresActivityRetry: false,
      errorMessage: null,
    };
  }

  return {
    state: "missing",
    label: "漏交",
    description: "该日期没有提交数据，也没有免交或请假记录。",
    tone: "pending",
    isCompleted: false,
    canBackfill: true,
    requiresActivityRetry: false,
    errorMessage: null,
  };
}
