import { formatShanghaiDateOnly } from "@/lib/loaders/shared";

/** 发布时间是平台截图识别出的事实；历史编辑只能沿用已保存事实。 */
export function resolveImmutablePublishedAt(
  existingPublishedAt: string | null | undefined,
  submittedPublishedAt: string | null | undefined,
) {
  return existingPublishedAt ?? submittedPublishedAt ?? null;
}

/** 新建历史手稿有发布日期时，归属日跟随发布日期；编辑继续沿用原日报日期。 */
export function resolveHistoryReportDate(input: {
  requestedDate: string;
  publishedAt: string | null;
  isEdit: boolean;
}) {
  if (input.isEdit || !input.publishedAt) return input.requestedDate;

  const publishedAt = new Date(input.publishedAt);
  return Number.isNaN(publishedAt.getTime())
    ? input.requestedDate
    : formatShanghaiDateOnly(publishedAt);
}

export type HistoryReportPayloadInput = {
  userId: string;
  accountId: string;
  title: string;
  submitter: string;
  reportDate: string;
  playCount: number;
  completionRate: string | null;
  avgPlayDuration: string | null;
  bounceRate2s: string | null;
  completionRate5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  followerGain: number;
  followerConvert: number | null;
  content: string | null;
  publishedAt: string | null;
  uploadedAt: string;
  assignees?: {
    script_author_user_id: string | null;
    video_editor_user_id: string | null;
    operator_user_id: string | null;
  };
};

export function buildHistoryReportPayload(input: HistoryReportPayloadInput) {
  return {
    user_id: input.userId,
    account_id: input.accountId,
    title: input.title,
    submitter: input.submitter,
    report_date: input.reportDate,
    play_count: input.playCount,
    completion_rate: input.completionRate,
    avg_play_duration: input.avgPlayDuration,
    bounce_rate_2s: input.bounceRate2s,
    completion_rate_5s: input.completionRate5s,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    favorites: input.favorites,
    follower_gain: input.followerGain,
    follower_convert: input.followerConvert,
    content: input.content,
    published_at: input.publishedAt,
    uploaded_at: input.uploadedAt,
    ...(input.assignees ?? {}),
  };
}
