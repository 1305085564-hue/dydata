export const SUBMISSION_PERSISTENCE_ERROR_CODES = {
  video: "VIDEO_PERSIST_FAILED",
  snapshot: "SNAPSHOT_PERSIST_FAILED",
  report: "REPORT_PERSIST_FAILED",
  tags: "TAGS_PERSIST_FAILED",
  usage: "USAGE_PERSIST_FAILED",
  source: "REPORT_SOURCE_PERSIST_FAILED",
} as const;

export type SubmissionPersistenceStage = keyof typeof SUBMISSION_PERSISTENCE_ERROR_CODES;

export type SubmissionPersistenceStepResult<T> =
  | { ok: true; data: T }
  | { ok: false; stage: SubmissionPersistenceStage; error: unknown; code: string };

/** 统一把数据库写入异常转换为内部阶段码，路由再负责用户文案。 */
export async function runSubmissionPersistenceStep<T>(
  stage: SubmissionPersistenceStage,
  step: () => PromiseLike<{ data: T; error: unknown }>,
): Promise<SubmissionPersistenceStepResult<T>> {
  try {
    const result = await step();
    if (result.error) {
      return { ok: false, stage, error: result.error, code: SUBMISSION_PERSISTENCE_ERROR_CODES[stage] };
    }
    return { ok: true, data: result.data };
  } catch (error) {
    return { ok: false, stage, error, code: SUBMISSION_PERSISTENCE_ERROR_CODES[stage] };
  }
}

import type { SubmissionAssetMeta } from "@/types";
import type { VideoSubmitValidationResult } from "./validation";

type NormalizedSubmission = VideoSubmitValidationResult["normalized"];

type PersistedVideoFact = {
  id: string;
  published_at?: string | null;
};

type AssigneeColumns = {
  script_author_user_id: string | null;
  video_editor_user_id: string | null;
  operator_user_id: string | null;
};

function formatNullablePercent(value: number | null) {
  return value === null ? null : `${value}%`;
}

function formatNullableSeconds(value: number | null) {
  return value === null ? null : `${value}秒`;
}

function buildOcrSummary(assets: SubmissionAssetMeta[]) {
  return assets.reduce<Record<string, unknown>>((acc, asset) => {
    if (asset.recognized_fields) acc[asset.role] = asset.recognized_fields;
    return acc;
  }, {});
}

function buildOcrAssets(assets: SubmissionAssetMeta[]) {
  return assets.map((asset) => ({
    role: asset.role,
    screenshot_type: asset.screenshot_type ?? null,
    confidence_score: asset.confidence_score ?? null,
    confirmed: Boolean(asset.confirmed),
    recognized_fields: asset.recognized_fields ?? null,
  }));
}

export function buildSnapshotPayload(
  normalized: NormalizedSubmission,
  videoId: string,
) {
  const screenshotUrls = normalized.assets.map((asset) => asset.url);
  const ocrSummary = buildOcrSummary(normalized.assets);
  const ocrAssets = buildOcrAssets(normalized.assets);
  const retentionScreenshotUrl = normalized.assets.find((asset) => asset.role === "screenshot_2")?.url ?? null;

  return {
    video_id: videoId,
    snapshot_type: "24h" as const,
    play_count: normalized.metrics.play_count,
    likes: normalized.metrics.likes,
    comments: normalized.metrics.comments,
    shares: normalized.metrics.shares,
    favorites: normalized.metrics.favorites,
    follower_gain: normalized.metrics.follower_gain,
    follower_loss: normalized.metrics.follower_loss,
    follower_convert: normalized.metrics.follower_convert,
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: normalized.metrics.avg_play_duration,
    completion_rate: normalized.metrics.completion_rate,
    bounce_rate_2s: normalized.metrics.bounce_rate_2s,
    completion_rate_5s: normalized.metrics.completion_rate_5s,
    avg_play_ratio: null,
    vs_previous: normalized.published_at_text || Object.keys(ocrSummary).length || ocrAssets.length
      ? {
          published_at_text: normalized.published_at_text ?? null,
          ocr_summary: Object.keys(ocrSummary).length ? ocrSummary : null,
          ocr_assets: ocrAssets.length ? ocrAssets : null,
        }
      : null,
    screenshot_urls: screenshotUrls.length ? screenshotUrls : null,
    retention_screenshot_url: retentionScreenshotUrl,
  };
}

export function buildDailyReportPayload({
  normalized,
  videoId,
  userId,
  submitter,
  nowIso,
  assigneeColumns,
  existingVideo,
}: {
  normalized: NormalizedSubmission;
  videoId: string;
  userId: string;
  submitter: string;
  nowIso: string;
  assigneeColumns: AssigneeColumns;
  existingVideo?: PersistedVideoFact | null;
}) {
  return {
    user_id: userId,
    report_date: normalized.biz_date,
    video_id: videoId,
    title: normalized.video_title || "视频提交",
    submitter,
    play_count: normalized.metrics.play_count,
    likes: normalized.metrics.likes,
    comments: normalized.metrics.comments,
    shares: normalized.metrics.shares,
    favorites: normalized.metrics.favorites,
    follower_gain: normalized.metrics.follower_gain,
    follower_convert: normalized.metrics.follower_convert,
    completion_rate: formatNullablePercent(normalized.metrics.completion_rate),
    avg_play_duration: formatNullableSeconds(normalized.metrics.avg_play_duration),
    bounce_rate_2s: formatNullablePercent(normalized.metrics.bounce_rate_2s),
    completion_rate_5s: formatNullablePercent(normalized.metrics.completion_rate_5s),
    content: normalized.content,
    published_at: normalized.mode === "edit" && existingVideo
      ? existingVideo.published_at ?? null
      : normalized.published_at,
    uploaded_at: nowIso,
    account_id: normalized.account_id,
    ...assigneeColumns,
  };
}
