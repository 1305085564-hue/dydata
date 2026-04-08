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

export type SubmitPanelRequestedMode = "editToday" | "backfill" | null;
export type SubmitPanelMode = "summary" | "create" | "editToday" | "backfill";

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
