import type { FormMetaState } from "@/app/(app)/dashboard/video-submit-form-model";
import {
  getVideoSubmissionEditDetailError,
  normalizeOptionalText,
  type VideoSubmissionEditDetail,
} from "@/app/(app)/dashboard/video-submit-form-state";
import type {
  SubmissionSlotRole,
  SubmissionState,
  EditableMetricKey,
} from "@/components/submission/提交状态机";
import type { TodaySubmissionReportLike } from "@/lib/dashboard-submission-state";
import type { Video } from "@/types";
import { normalizePublishedAtInputValue } from "@/lib/日报";

export type CompleteEditPayload = {
  video_id: string;
  account_id: string;
  biz_date: string;
  metrics: Record<string, unknown>;
  assignees: {
    script_author_user_id: string | null;
    video_editor_user_id: string | null;
    operator_user_id: string | null;
  };
};

export function resolveCompleteEditPayload(
  detail: VideoSubmissionEditDetail | null | undefined,
  expected: { accountId: string; bizDate: string },
): CompleteEditPayload | null {
  if (getVideoSubmissionEditDetailError(detail, expected)) return null;
  if (!detail) return null;

  return {
    video_id: detail.videoId,
    account_id: detail.accountId,
    biz_date: detail.bizDate,
    metrics: detail.metrics,
    assignees: {
      script_author_user_id: detail.meta.scriptAuthorUserId,
      video_editor_user_id: detail.meta.videoEditorUserId,
      operator_user_id: detail.meta.operatorUserId,
    },
  };
}

export function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // OCR 返回带时区时间；表单与保存端都使用上海时间，不随设备时区变化。
  return normalizePublishedAtInputValue(date.toISOString());
}

// 保留所有辅助函数
export function parseMetric(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isVideo(value: unknown): value is Video {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    "account_id" in value
  );
}

export function createSummaryOverride(
  accountId: string,
  meta: FormMetaState,
  fields: SubmissionState["fields"],
  receipt?: { topicTitle?: string | null; screenshotUrl?: string | null },
): TodaySubmissionReportLike {
  const stringifyMetric = (value: string) => {
    const trimmed = value.trim();
    return trimmed || "0";
  };

  return {
    account_id: accountId,
    title: normalizeOptionalText(meta.videoTitle),
    content: normalizeOptionalText(meta.content),
    report_date: meta.bizDate,
    play_count: parseMetric(fields.play_count.value),
    likes: parseMetric(fields.likes.value),
    comments: parseMetric(fields.comments.value),
    shares: parseMetric(fields.shares.value),
    favorites: parseMetric(fields.favorites.value),
    follower_gain: parseMetric(fields.follower_gain.value),
    follower_convert: parseMetric(fields.follower_convert.value),
    completion_rate: stringifyMetric(fields.completion_rate.value),
    avg_play_duration: stringifyMetric(fields.avg_play_duration.value),
    bounce_rate_2s: stringifyMetric(fields.bounce_rate_2s.value),
    completion_rate_5s: stringifyMetric(fields.completion_rate_5s.value),
    published_at: meta.publishedAt || null,
    uploaded_at: meta.uploadedAt,
    topic_title: receipt?.topicTitle ?? null,
    screenshot_url: receipt?.screenshotUrl ?? null,
  };
}

export function filterOperatorMembers<
  T extends { name: string; display_name: string },
>(operatorMembers: T[], memberSearchQuery: string) {
  if (!memberSearchQuery.trim()) return operatorMembers;
  const q = memberSearchQuery.trim().toLowerCase();
  return operatorMembers.filter(
    (m) =>
      m.name?.toLowerCase().includes(q) ||
      m.display_name?.toLowerCase().includes(q),
  );
}

export function getSlotRoleForMetric(
  key: EditableMetricKey,
): SubmissionSlotRole {
  if (
    [
      "avg_play_duration",
      "bounce_rate_2s",
      "completion_rate_5s",
      "completion_rate",
    ].includes(key)
  ) {
    return "screenshot_2";
  }
  return "screenshot_1";
}
