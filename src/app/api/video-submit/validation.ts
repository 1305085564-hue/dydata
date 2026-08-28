import type { SubmissionAssetMeta } from "@/types";
import { SCRIPT_FORMATS, type ScriptFormat } from "@/lib/conversion-hub/types";
import {
  deriveVideoPunishType,
  normalizeVideoAnomalyStatus,
  type VideoPunishType,
} from "@/lib/video-anomaly";
import {
  normalizeDateOnly,
  normalizeInteger,
  normalizeNumber,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeSubmissionAssets,
  normalizeVideoIdLike,
  isUuidLike,
} from "./stability";
import { parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";

export interface VideoSubmitValidationMetrics {
  play_count: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_loss: number;
  follower_convert: number;
  avg_play_duration: number;
  bounce_rate_2s: number;
  completion_rate_5s: number;
  completion_rate: number;
}

export const SUBMISSION_TOPIC_TAGS = ["干货", "复盘"] as const;
export type VideoSubmitMode = "create" | "edit" | "abnormal";

export interface VideoSubmitValidationResult {
  ok: true;
  normalized: {
    account_id: string;
    mode: VideoSubmitMode;
    video_id: string | null;
    video_url: string | null;
    video_title: string | null;
    content: string;
    published_at: string | null;
    published_at_text: string | null;
    biz_date: string;
    anomaly_status: string;
    punish_type: VideoPunishType | null;
    platform_notice: string | null;
    appeal: string | null;
    topic_tag: string | null;
    topic_id: string | null;
    script_author_user_id: string | null;
    video_editor_user_id: string | null;
    operator_user_id: string | null;
    video_form: string | null;
    content_keywords: string[];
    script_text: string | null;
    script_format: ScriptFormat;
    assets: SubmissionAssetMeta[];
    metrics: VideoSubmitValidationMetrics;
  };
  contentKeywords: string[];
}

export interface VideoSubmitValidationErrorResult {
  ok: false;
  error: string;
}

export type VideoSubmitValidationOutcome = VideoSubmitValidationResult | VideoSubmitValidationErrorResult;

export function resolveOperatorUserId(operatorUserId: string | null, currentUserId: string) {
  return operatorUserId ?? currentUserId;
}

export function resolveSubmissionRoleUserIds(
  input: Pick<VideoSubmitValidationResult["normalized"], "script_author_user_id" | "video_editor_user_id" | "operator_user_id">,
  currentUserId: string,
) {
  return {
    scriptAuthorUserId: input.script_author_user_id ?? currentUserId,
    videoEditorUserId: input.video_editor_user_id ?? currentUserId,
    operatorUserId: input.operator_user_id ?? currentUserId,
  };
}

function normalizeOptionalUserId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isUuidLike(trimmed) ? trimmed : undefined;
}

export function normalizeContentKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, 3);
}

function normalizeMetrics(value: unknown): VideoSubmitValidationMetrics {
  const metrics = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    play_count: normalizeNumber(metrics.play_count),
    likes: normalizeInteger(metrics.likes),
    comments: normalizeInteger(metrics.comments),
    shares: normalizeInteger(metrics.shares),
    favorites: normalizeInteger(metrics.favorites),
    follower_gain: normalizeInteger(metrics.follower_gain),
    follower_loss: normalizeInteger(metrics.follower_loss),
    follower_convert: normalizeInteger(metrics.follower_convert),
    avg_play_duration: normalizeNumber(metrics.avg_play_duration),
    bounce_rate_2s: normalizeNumber(metrics.bounce_rate_2s),
    completion_rate_5s: normalizeNumber(metrics.completion_rate_5s),
    completion_rate: normalizeNumber(metrics.completion_rate),
  };
}

function normalizeScriptFormat(value: unknown): ScriptFormat {
  return typeof value === "string" && SCRIPT_FORMATS.includes(value as ScriptFormat)
    ? (value as ScriptFormat)
    : "oral";
}

function normalizeSubmissionMode(
  value: unknown,
  anomalyStatus: string,
  videoId: string | null,
): VideoSubmitMode | null {
  if (value === undefined || value === null || value === "") {
    return videoId ? "edit" : anomalyStatus === "abnormal" ? "abnormal" : "create";
  }

  return value === "create" || value === "edit" || value === "abnormal"
    ? value
    : null;
}

const SCREENSHOT_ROLE_LABELS: Record<"screenshot_1" | "screenshot_2", string> = {
  screenshot_1: "互动截图",
  screenshot_2: "完播截图",
};

function validateSubmissionAssetShape(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return "截图资产格式不正确，请重新上传截图";

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return "截图资产格式不正确，请重新上传截图";
    }

    const role = (item as { role?: unknown }).role;
    const url = (item as { url?: unknown }).url;
    const confirmed = (item as { confirmed?: unknown }).confirmed;
    if (role !== "screenshot_1" && role !== "screenshot_2") {
      return "截图槽位不正确，请重新上传截图";
    }
    if (typeof url !== "string" || !url.trim()) {
      return `${SCREENSHOT_ROLE_LABELS[role]}地址不能为空，请重新上传截图`;
    }
    if (typeof confirmed !== "boolean") {
      return `${SCREENSHOT_ROLE_LABELS[role]}确认状态不正确，请重新上传截图`;
    }
  }

  return null;
}

function validateSubmissionAssetUrls(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string" || !url.trim()) continue;

    if (url.trim().startsWith("blob:")) {
      return "截图地址不能是本地临时地址，请重新上传截图";
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return "截图地址格式不正确，请重新上传截图";
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "截图地址必须是线上可访问地址，请重新上传截图";
    }

    if (!parseSubmissionScreenshotPath(parsed.toString())) {
      return "截图必须先上传到系统截图空间，请重新上传截图";
    }
  }

  return null;
}

export function validateVideoSubmitPayload(body: unknown): VideoSubmitValidationOutcome {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "请求体格式不正确" };
  }

  const payload = body as Record<string, unknown>;
  const accountId = typeof payload.account_id === "string" ? payload.account_id.trim() : "";
  if (!accountId) {
    return { ok: false, error: "account_id 为必填项" };
  }

  const title = normalizeOptionalText(payload.video_title);
  const content = normalizeOptionalText(payload.content);
  const keywords = normalizeContentKeywords(payload.content_keywords);
  const videoId = normalizeVideoIdLike(payload.video_id);
  const anomalyStatus = normalizeVideoAnomalyStatus(payload.anomaly_status);
  const mode = normalizeSubmissionMode(payload.mode, anomalyStatus, videoId);
  const scriptText = normalizeOptionalText(payload.script_text);
  const metrics = normalizeMetrics(payload.metrics);
  const topicTag = normalizeOptionalText(payload.topic_tag);
  const topicId = normalizeVideoIdLike(payload.topic_id);
  const assetShapeError = validateSubmissionAssetShape(payload.assets);
  const assetUrlError = validateSubmissionAssetUrls(payload.assets);
  const rawMetrics = payload.metrics && typeof payload.metrics === "object" && !Array.isArray(payload.metrics)
    ? payload.metrics as Record<string, unknown>
    : null;
  const scriptAuthorUserId = normalizeOptionalUserId(payload.script_author_user_id);
  const videoEditorUserId = normalizeOptionalUserId(payload.video_editor_user_id);
  const operatorUserId = normalizeOptionalUserId(payload.operator_user_id);

  if (!mode) {
    return { ok: false, error: "mode 必须是 create、edit 或 abnormal" };
  }

  if (videoId && !isUuidLike(videoId)) {
    return { ok: false, error: "video_id 必须是合法 UUID" };
  }
  if (topicId && !isUuidLike(topicId)) {
    return { ok: false, error: "topic_id 必须是合法 UUID" };
  }
  if (mode === "edit" && (!videoId || !isUuidLike(videoId))) {
    return { ok: false, error: "编辑提交必须携带合法 video_id" };
  }
  if (mode === "create" && videoId) {
    return { ok: false, error: "新建提交不能携带 video_id" };
  }
  if (mode === "abnormal" && videoId) {
    return { ok: false, error: "异常新建不能携带 video_id" };
  }
  if (mode === "abnormal" && anomalyStatus !== "abnormal") {
    return { ok: false, error: "异常提交 mode 必须使用异常状态" };
  }

  if (assetShapeError) {
    return { ok: false, error: assetShapeError };
  }
  if (assetUrlError) {
    return { ok: false, error: assetUrlError };
  }
  if (
    rawMetrics?.follower_convert !== undefined &&
    rawMetrics.follower_convert !== null &&
    (typeof rawMetrics.follower_convert !== "number" || !Number.isFinite(rawMetrics.follower_convert))
  ) {
    return { ok: false, error: "导粉指标格式不正确" };
  }

  if (scriptAuthorUserId === undefined) return { ok: false, error: "script_author_user_id 必须是合法 UUID" };
  if (videoEditorUserId === undefined) return { ok: false, error: "video_editor_user_id 必须是合法 UUID" };
  if (operatorUserId === undefined) return { ok: false, error: "operator_user_id 必须是合法 UUID" };

  if (anomalyStatus === "abnormal") {
    if (!content) {
      return { ok: false, error: "异常提交时文案为必填项" };
    }
  } else if (!title || !content) {
    return { ok: false, error: "标题和文案为必填项" };
  }

  if (topicTag && !SUBMISSION_TOPIC_TAGS.includes(topicTag as (typeof SUBMISSION_TOPIC_TAGS)[number])) {
    return { ok: false, error: "话题标签必须是干货或复盘" };
  }
  if (anomalyStatus !== "abnormal" && !topicTag) {
    return { ok: false, error: "正常提交时话题标签为必填项" };
  }

  if (metrics.follower_convert > 0 && !scriptText) {
    return { ok: false, error: "导粉大于 0 时导粉话术为必填项" };
  }

  const assets = normalizeSubmissionAssets(payload.assets);
  if (anomalyStatus === "normal" && (mode !== "edit" || assets.length > 0)) {
    const roles = new Set(assets.map((asset) => asset.role));
    if (assets.length !== 2 || roles.size !== 2 || !roles.has("screenshot_1") || !roles.has("screenshot_2")) {
      return { ok: false, error: "正常提交必须包含互动截图和完播截图" };
    }

    const unconfirmed = assets.find((asset) => !asset.confirmed);
    if (unconfirmed) {
      return { ok: false, error: `${SCREENSHOT_ROLE_LABELS[unconfirmed.role]}必须先确认` };
    }
  }

  return {
    ok: true,
    contentKeywords: keywords,
    normalized: {
      account_id: accountId,
      mode,
      video_id: videoId,
      video_url: normalizeOptionalText(payload.video_url),
      video_title: title,
      content,
      published_at: normalizeOptionalDate(payload.published_at),
      published_at_text: normalizeOptionalText(payload.published_at_text),
      biz_date: normalizeDateOnly(payload.biz_date),
      anomaly_status: anomalyStatus,
      punish_type: deriveVideoPunishType({
        punishType: payload.punish_type,
        anomalyStatus: payload.anomaly_status,
      }),
      platform_notice: normalizeOptionalText(payload.platform_notice),
      appeal: normalizeOptionalText(payload.appeal),
      topic_tag: topicTag,
      topic_id: topicId,
      script_author_user_id: scriptAuthorUserId,
      video_editor_user_id: videoEditorUserId,
      operator_user_id: operatorUserId,
      video_form: normalizeOptionalText(payload.video_form),
      content_keywords: keywords,
      script_text: scriptText,
      script_format: normalizeScriptFormat(payload.script_format),
      assets,
      metrics,
    },
  };
}
