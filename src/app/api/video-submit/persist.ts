import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { SubmissionAssetMeta } from "@/types";

export const SUBMISSION_PERSISTENCE_ERROR_CODES = {
  video: "VIDEO_PERSIST_FAILED",
  snapshot: "SNAPSHOT_PERSIST_FAILED",
  report: "REPORT_PERSIST_FAILED",
  tags: "TAGS_PERSIST_FAILED",
  usage: "USAGE_PERSIST_FAILED",
  source: "REPORT_SOURCE_PERSIST_FAILED",
  history: "SCREENSHOT_HISTORY_PERSIST_FAILED",
} as const;

export type SubmissionPersistenceStage = keyof typeof SUBMISSION_PERSISTENCE_ERROR_CODES;

export type SubmissionPersistenceStepResult<T> =
  | { ok: true; data: T }
  | { ok: false; stage: SubmissionPersistenceStage; error: unknown; code: string; compensated: boolean };

export type SubmissionPersistencePipelineResult =
  | { ok: true }
  | { ok: false; stage: SubmissionPersistenceStage; error: unknown; code: string; compensated: boolean };

export type ScreenshotReplacementHistoryRow = {
  video_id: string;
  account_id: string;
  user_id: string;
  replaced_by: string;
  role: SubmissionSlotRole;
  replaced_at: string;
  old_url: string;
  new_url: string;
};

export function buildScreenshotReplacementHistoryRows(input: {
  existing: { screenshot_urls: string[] | null; retention_screenshot_url?: string | null } | null;
  assets: SubmissionAssetMeta[];
  videoId: string;
  accountId: string;
  userId: string;
  replacedAt: string;
}): ScreenshotReplacementHistoryRow[] {
  if (!input.existing) return [];

  const rawOldUrls = Array.isArray(input.existing.screenshot_urls)
    ? input.existing.screenshot_urls
    : [];
  const oldUrls = rawOldUrls.filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  // 旧图按「身份」认，不按数组位置：screenshot_urls 只装「谁有图存谁」，
  // 互动截图缺失时完播那张会落在第 0 位，按位置对号会把留痕记成串图。
  // 完播留存有专门一列存它的链接，直接用它认身份；互动数据就是「不是完播那张」的那张。
  const retentionUrl = input.existing.retention_screenshot_url ?? null;
  const oldUrlByRole: Record<SubmissionSlotRole, string | null> = {
    screenshot_1: oldUrls.find((url) => url !== retentionUrl) ?? null,
    screenshot_2: retentionUrl,
  };

  return input.assets.flatMap((asset) => {
    const oldUrl = oldUrlByRole[asset.role];
    if (!oldUrl || oldUrl === asset.url) return [];
    return [{
      video_id: input.videoId,
      account_id: input.accountId,
      user_id: input.userId,
      replaced_by: input.userId,
      role: asset.role,
      replaced_at: input.replacedAt,
      old_url: oldUrl,
      new_url: asset.url,
    }];
  });
}

/**
 * 持久化失败矩阵的统一执行器。每个写入步骤按声明顺序运行，任一步失败都先执行
 * 同一组补偿动作，再把内部阶段码交给路由映射用户文案。
 */
export async function runSubmissionPersistencePipeline(
  steps: Array<{
    stage: SubmissionPersistenceStage;
    run: () => PromiseLike<{ error?: unknown }>;
  }>,
  compensate: () => Promise<unknown>,
): Promise<SubmissionPersistencePipelineResult> {
  for (const step of steps) {
    try {
      const result = await step.run();
      if (!result.error) continue;
      await compensate();
      return {
        ok: false,
        stage: step.stage,
        error: result.error,
        code: SUBMISSION_PERSISTENCE_ERROR_CODES[step.stage],
        compensated: true,
      };
    } catch (error) {
      await compensate();
      return {
        ok: false,
        stage: step.stage,
        error,
        code: SUBMISSION_PERSISTENCE_ERROR_CODES[step.stage],
        compensated: true,
      };
    }
  }
  return { ok: true };
}

export type SubmissionTagSuggestion = {
  tag_dimension: string;
  tag_value: string;
  confidence: number | null;
  reason: string | null;
};

export type SubmissionTagWriteResult = {
  error?: { message: string } | null;
};

/** 标签属于核心日报写入后的可补充步骤，但失败仍必须恢复原标签快照。 */
export async function persistSubmissionTags(input: {
  loadPrevious: () => Promise<{ data: unknown[]; error?: { message: string } | null }>;
  generateAiTags: () => Promise<SubmissionTagSuggestion[]>;
  writeAiTags: (tags: SubmissionTagSuggestion[]) => Promise<SubmissionTagWriteResult>;
  writeManualTags: () => Promise<SubmissionTagWriteResult>;
  restorePrevious: (rows: unknown[]) => Promise<void>;
}): Promise<{ ok: true; aiTags: SubmissionTagSuggestion[] } | { ok: false; error: { message: string } }> {
  const previous = await input.loadPrevious();
  if (previous.error) return { ok: false, error: previous.error };

  const aiTags = await input.generateAiTags();
  const aiResult = await input.writeAiTags(aiTags);
  if (aiResult.error) {
    await input.restorePrevious(previous.data);
    return { ok: false, error: aiResult.error };
  }

  const manualResult = await input.writeManualTags();
  if (manualResult.error) {
    await input.restorePrevious(previous.data);
    return { ok: false, error: manualResult.error };
  }
  return { ok: true, aiTags };
}

/** 统一把数据库写入异常转换为内部阶段码，路由再负责用户文案。 */
export async function runSubmissionPersistenceStep<T>(
  stage: SubmissionPersistenceStage,
  step: () => PromiseLike<{ data: T; error: unknown }>,
  compensate?: () => Promise<unknown>,
): Promise<SubmissionPersistenceStepResult<T>> {
  try {
    const result = await step();
    if (result.error) {
      await compensate?.();
      return { ok: false, stage, error: result.error, code: SUBMISSION_PERSISTENCE_ERROR_CODES[stage], compensated: Boolean(compensate) };
    }
    return { ok: true, data: result.data };
  } catch (error) {
    await compensate?.();
    return { ok: false, stage, error, code: SUBMISSION_PERSISTENCE_ERROR_CODES[stage], compensated: Boolean(compensate) };
  }
}

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
