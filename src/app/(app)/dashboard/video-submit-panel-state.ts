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
  completionRate: string | null;
  avgPlayDuration: string | null;
  bounceRate2s: string | null;
  completionRate5s: string | null;
  publishedAt: string | null;
  uploadedAt: string | null;
}

export type SubmitPanelRequestedMode = "editToday" | "backfill" | null;
export type SubmitPanelMode = "summary" | "create" | "editToday" | "backfill";

export function getTodaySubmissionSummary(
  reports: TodaySubmissionReportLike[],
  accountId: string,
): TodaySubmissionSummary | null {
  const matched = reports.find((report) => report.account_id === accountId);
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
