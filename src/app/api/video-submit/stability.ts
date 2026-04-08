import { createHash } from "node:crypto";
import type { SubmissionAssetMeta } from "@/types";

export interface NormalizedVideoSubmitMetrics {
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

export interface NormalizedVideoSubmitPayload {
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
  content_keywords: string[];
  assets: SubmissionAssetMeta[];
  metrics: NormalizedVideoSubmitMetrics;
}

export function isUuidLike(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeDateOnly(value: unknown, fallback = getTodayDateString()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }

  return value;
}

export function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeInteger(value: unknown, fallback = 0) {
  return Math.round(normalizeNumber(value, fallback));
}

export function getTodayDateString(now: Date = new Date()) {
  return now.toISOString().split("T")[0];
}

export function normalizeVideoIdLike(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isSubmissionAssetRole(value: unknown): value is SubmissionAssetMeta["role"] {
  return value === "screenshot_1" || value === "screenshot_2" || value === "screenshot_3";
}

export function normalizeSubmissionAssets(value: unknown): SubmissionAssetMeta[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is {
        role: SubmissionAssetMeta["role"];
        url: string;
        confirmed?: boolean;
        confidence_score?: number | null;
        recognized_fields?: Record<string, unknown> | null;
        screenshot_type?: "data" | "curve" | "retention" | null;
      } => {
      return Boolean(
        item &&
          typeof item === "object" &&
          isSubmissionAssetRole((item as SubmissionAssetMeta).role) &&
          typeof (item as SubmissionAssetMeta).url === "string",
      );
      },
    )
    .map((item) => ({
      ...item,
      role: item.role,
      url: item.url.trim(),
      confirmed: Boolean(item.confirmed),
      confidence_score: normalizeOptionalNumber(item.confidence_score),
    }))
    .filter((item) => Boolean(item.role) && Boolean(item.url));
}

export function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildStableUuid(seed: string) {
  const hash = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function buildSubmissionFingerprint(input: {
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
  content_keywords: string[];
  assets: SubmissionAssetMeta[];
  metrics: NormalizedVideoSubmitMetrics;
}) {
  const canonical = {
    account_id: input.account_id,
    anomaly_status: input.anomaly_status,
    assets: input.assets
      .map((asset) => ({
        confidence_score: asset.confidence_score ?? null,
        confirmed: Boolean(asset.confirmed),
        recognized_fields: asset.recognized_fields ?? null,
        role: asset.role,
        screenshot_type: asset.screenshot_type ?? null,
        url: asset.url,
      }))
      .sort((left, right) => left.role.localeCompare(right.role) || left.url.localeCompare(right.url)),
    biz_date: input.biz_date,
    content: input.content,
    content_keywords: [...input.content_keywords].map((item) => item.trim()).sort(),
    metrics: input.metrics,
    published_at: input.published_at,
    published_at_text: input.published_at_text,
    video_url: input.video_url,
    topic_tag: input.topic_tag,
    video_id: input.video_id,
    video_title: input.video_title,
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function buildSubmissionRecordId(input: {
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
  content_keywords: string[];
  assets: SubmissionAssetMeta[];
  metrics: NormalizedVideoSubmitMetrics;
}) {
  if (input.video_id && isUuidLike(input.video_id)) {
    return input.video_id.trim();
  }

  const fingerprint = buildSubmissionFingerprint(input);
  return buildStableUuid(fingerprint);
}
