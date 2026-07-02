import type { SubmissionAssetMeta } from "@/types";
import { SCRIPT_FORMATS, type ScriptFormat } from "@/lib/conversion-hub/types";
import {
  normalizeDateOnly,
  normalizeInteger,
  normalizeNumber,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeSubmissionAssets,
  normalizeVideoIdLike,
} from "./stability";

const SUBMISSION_SCREENSHOT_BUCKET_PATH = "/storage/v1/object/public/submission-screenshots/";

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

export interface VideoSubmitValidationResult {
  ok: true;
  normalized: {
    account_id: string;
    video_id: string | null;
    video_url: string | null;
    video_title: string;
    content: string;
    published_at: string | null;
    published_at_text: string | null;
    biz_date: string;
    anomaly_status: string;
    topic_tag: string | null;
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

function validateSubmissionAssetUrls(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const configuredSupabaseHost = (() => {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!rawUrl) return null;
    try {
      return new URL(rawUrl).host;
    } catch {
      return null;
    }
  })();

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

    if (!parsed.pathname.includes(SUBMISSION_SCREENSHOT_BUCKET_PATH)) {
      return "截图必须先上传到系统截图空间，请重新上传截图";
    }

    if (configuredSupabaseHost && parsed.host !== configuredSupabaseHost) {
      return "截图地址不是当前项目的 Supabase 地址，请重新上传截图";
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
  const assetUrlError = validateSubmissionAssetUrls(payload.assets);

  if (assetUrlError) {
    return { ok: false, error: assetUrlError };
  }

  if (!title || !content) {
    return { ok: false, error: "标题和文案为必填项" };
  }

  return {
    ok: true,
    contentKeywords: keywords,
    normalized: {
      account_id: accountId,
      video_id: normalizeVideoIdLike(payload.video_id),
      video_url: normalizeOptionalText(payload.video_url),
      video_title: title,
      content,
      published_at: normalizeOptionalDate(payload.published_at),
      published_at_text: normalizeOptionalText(payload.published_at_text),
      biz_date: normalizeDateOnly(payload.biz_date),
      anomaly_status: normalizeOptionalText(payload.anomaly_status) ?? "正常",
      topic_tag: normalizeOptionalText(payload.topic_tag),
      video_form: normalizeOptionalText(payload.video_form),
      content_keywords: keywords,
      script_text: normalizeOptionalText(payload.script_text),
      script_format: normalizeScriptFormat(payload.script_format),
      assets: normalizeSubmissionAssets(payload.assets),
      metrics: normalizeMetrics(payload.metrics),
    },
  };
}
