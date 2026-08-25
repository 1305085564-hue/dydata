/**
 * 截图识别输出契约：类型 + 解析函数（纯函数，无 IO 依赖）。
 * 从 route.ts 抽出供百度通道与视觉通道共用；route.ts 统一再导出保持兼容。
 */

export type ConfidenceLevel = "high" | "medium" | "low";
export type ScreenshotType = "data" | "retention";
export type ScreenshotAssetRole = "screenshot_1" | "screenshot_2";
export type ScreenshotTypeInput =
  | ScreenshotType
  | "overview"
  | "traffic_curve"
  | "retention_curve"
  | "engagement_extra"
  | "other"
  | ScreenshotAssetRole;
export type OcrErrorCode =
  | "RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_CHANNEL_UNAVAILABLE"
  | "AI_EMPTY_RESPONSE"
  | "AI_PARSE_FAILED"
  | "LOW_CONFIDENCE"
  | "STORAGE_READ_FAILED";

type OcrFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain";

const OCR_FIELDS: OcrFieldKey[] = [
  "play_count",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_gain",
];

type ParsedOcrResult = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  confidence: Record<OcrFieldKey, ConfidenceLevel>;
};

export type RetentionMetrics = {
  avg_play_duration: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
};

export type RetentionRecognitionResult =
  | {
      recognized: true;
      retention_metrics: RetentionMetrics;
      confidence: number | null;
    }
  | {
      recognized: false;
      reason: string;
    };

type OpenAICompatibleMessageContentBlock = {
  type?: string;
  text?: string;
};

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export type ParsedScreenshotResponse = {
  slot_status: "pending_confirm" | "confirmed" | "failed";
  screenshot_type: ScreenshotType;
  confidence_score: number;
  requires_manual_confirmation: boolean;
  recognized_fields: JsonObject | null;
  confidence?: Record<OcrFieldKey, ConfidenceLevel>;
  error_code?: OcrErrorCode;
  error?: string;
};

function normalizeScreenshotTypeInput(value: unknown): ScreenshotType | null {
  switch (value) {
    case "overview":
    case "engagement_extra":
    case "other":
    case "data":
      return "data";
    case "retention_curve":
    case "retention":
      return "retention";
    // curve / traffic_curve 类型识别已下线，不再映射为任何识别类型。
    // screenshot_1 / screenshot_2 由 getScreenshotTypeFallbackByAssetRole 按槽位决定类型。
    default:
      return null;
  }
}

export function getScreenshotTypeByAssetRole(assetRole: unknown): ScreenshotType | null {
  return normalizeScreenshotTypeInput(assetRole);
}

export function getScreenshotTypeFallbackByAssetRole(assetRole: unknown): ScreenshotType {
  if (assetRole === "screenshot_2") {
    return "retention";
  }

  return "data";
}

export function resolveKnownScreenshotType(input: {
  screenshotType: ScreenshotType | null;
  assetRole: ScreenshotAssetRole | null;
}): { type: ScreenshotType; source: "explicit" | "asset_role" } | null {
  if (input.screenshotType) {
    return { type: input.screenshotType, source: "explicit" };
  }

  if (input.assetRole) {
    return {
      type: getScreenshotTypeFallbackByAssetRole(input.assetRole),
      source: "asset_role",
    };
  }

  return null;
}

export function buildNoTextFailedResponse(screenshotType: ScreenshotType): ParsedScreenshotResponse {
  return {
    slot_status: "failed",
    screenshot_type: screenshotType,
    confidence_score: 0,
    requires_manual_confirmation: true,
    error_code: "LOW_CONFIDENCE",
    error: "图片不清晰或未识别到数据",
    recognized_fields: null,
  };
}

export function parseOcrResponse(
  content: unknown,
  screenshotType: ScreenshotTypeInput
): ParsedScreenshotResponse | null {
  const normalizedType = normalizeScreenshotTypeInput(screenshotType);
  if (!normalizedType) {
    return null;
  }

  if (normalizedType === "retention") {
    const parsed = parseRetentionContent(content);
    if (!parsed) {
      return null;
    }

    if (!parsed.recognized) {
      return {
        slot_status: "failed",
        screenshot_type: normalizedType,
        confidence_score: 0,
        requires_manual_confirmation: true,
        error_code: "LOW_CONFIDENCE",
        error: parsed.reason,
        recognized_fields: null,
      };
    }

    const confidenceScore = parsed.confidence ?? 0;
    return {
      slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
      screenshot_type: normalizedType,
      confidence_score: confidenceScore,
      requires_manual_confirmation: confidenceScore < 0.7,
      recognized_fields: {
        recognized: true,
        retention_metrics: parsed.retention_metrics,
        confidence: parsed.confidence,
      } as unknown as JsonObject,
    };
  }

  const parsed = parseOcrContent(content);
  if (!parsed) {
    return null;
  }

  const recognizedFields = Object.fromEntries(
    OCR_FIELDS.filter((field) => parsed[field] !== null).map((field) => [field, parsed[field]])
  ) as JsonObject;

  const hasAnyValue = OCR_FIELDS.some((field) => parsed[field] !== null);
  if (!hasAnyValue) {
    return {
      slot_status: "failed",
      screenshot_type: normalizedType,
      confidence_score: 0,
      requires_manual_confirmation: true,
      error_code: "LOW_CONFIDENCE",
      error: "图片不清晰或未识别到数据",
      recognized_fields: null,
    };
  }

  const confidenceScore = getConfidenceScore(parsed.confidence);

  return {
    slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
    screenshot_type: normalizedType,
    confidence_score: confidenceScore,
    requires_manual_confirmation: confidenceScore < 0.7,
    recognized_fields: recognizedFields,
    confidence: parsed.confidence,
  };
}

function parseOcrContent(content: unknown): ParsedOcrResult | null {
  const normalizedContent = normalizeMessageContent(content);
  if (!normalizedContent) {
    return null;
  }

  const jsonText = extractJson(normalizedContent);
  if (!jsonText) {
    return null;
  }

  try {
    const raw = JSON.parse(jsonText) as Partial<ParsedOcrResult> & {
      confidence?: Partial<Record<OcrFieldKey, ConfidenceLevel>>;
    };

    const normalized: ParsedOcrResult = {
      play_count: normalizeNumber(raw.play_count, true),
      likes: normalizeNumber(raw.likes),
      comments: normalizeNumber(raw.comments),
      shares: normalizeNumber(raw.shares),
      favorites: normalizeNumber(raw.favorites),
      follower_gain: normalizeNumber(raw.follower_gain),
      confidence: {
        play_count: normalizeConfidence(raw.confidence?.play_count),
        likes: normalizeConfidence(raw.confidence?.likes),
        comments: normalizeConfidence(raw.confidence?.comments),
        shares: normalizeConfidence(raw.confidence?.shares),
        favorites: normalizeConfidence(raw.confidence?.favorites),
        follower_gain: normalizeConfidence(raw.confidence?.follower_gain),
      },
    };

    return normalized;
  } catch {
    return null;
  }
}

export function parseRetentionContent(content: unknown): RetentionRecognitionResult | null {
  const normalizedContent = normalizeMessageContent(content);
  if (!normalizedContent) {
    return null;
  }

  const jsonText = extractJson(normalizedContent);
  if (!jsonText) {
    return null;
  }

  try {
    const raw = JSON.parse(jsonText) as {
      recognized?: unknown;
      reason?: unknown;
      retention_metrics?: {
        avg_play_duration?: unknown;
        bounce_rate_2s?: unknown;
        completion_rate_5s?: unknown;
        completion_rate?: unknown;
      };
      confidence?: unknown;
    };

    if (raw.recognized === false) {
      const reason = normalizeReason(raw.reason);
      return reason ? { recognized: false, reason } : null;
    }

    const retentionMetrics: RetentionMetrics = {
      avg_play_duration: normalizeMetricNumber(raw.retention_metrics?.avg_play_duration),
      bounce_rate_2s: normalizeMetricNumber(raw.retention_metrics?.bounce_rate_2s),
      completion_rate_5s: normalizeMetricNumber(raw.retention_metrics?.completion_rate_5s),
      completion_rate: normalizeMetricNumber(raw.retention_metrics?.completion_rate),
    };

    const hasAnyMetric = Object.values(retentionMetrics).some((value) => value !== null);
    if (!hasAnyMetric) {
      return null;
    }

    return {
      recognized: true,
      retention_metrics: retentionMetrics,
      confidence: normalizeScore(raw.confidence),
    };
  } catch {
    return null;
  }
}

function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = (content as OpenAICompatibleMessageContentBlock[])
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text?.trim() || "")
      .filter(Boolean)
      .join("\n");

    return text || null;
  }

  return null;
}

function extractJson(content: string): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return content.slice(start, end + 1);
}

function normalizeNumber(value: unknown, allowDecimal = false): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? allowDecimal
        ? Math.round(value * 100) / 100
        : Math.round(value)
      : null;
  }

  if (typeof value === "string") {
    const hasWan = /万$/.test(value);
    const normalized = value.replace(/[,%\s]/g, "").replace(/万$/, "");
    if (!normalized) {
      return null;
    }
    let parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    if (hasWan) parsed *= 10000;
    return allowDecimal ? Math.round(parsed * 100) / 100 : Math.round(parsed);
  }

  return null;
}

function normalizeMetricNumber(value: unknown): number | null {
  if (typeof value === "string") {
    return normalizeNumber(value.replace(/[秒sS]/g, ""), true);
  }

  return normalizeNumber(value, true);
}

function getConfidenceScore(confidence: Record<OcrFieldKey, ConfidenceLevel>) {
  const scoreMap: Record<ConfidenceLevel, number> = {
    high: 1,
    medium: 0.5,
    low: 0,
  };

  const total = OCR_FIELDS.reduce((sum, field) => sum + scoreMap[confidence[field]], 0);
  return Math.round((total / OCR_FIELDS.length) * 100) / 100;
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
}

function normalizeScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function normalizeReason(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
