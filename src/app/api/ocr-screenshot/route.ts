import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callAi } from "@/lib/ai/client";
import type { AiMessage } from "@/lib/ai/client";

type ConfidenceLevel = "high" | "medium" | "low";
type ScreenshotType = "data" | "curve" | "retention";
type ScreenshotTypeInput =
  | ScreenshotType
  | "overview"
  | "traffic_curve"
  | "retention_curve"
  | "engagement_extra"
  | "other"
  | ScreenshotAssetRole;
export type ScreenshotAssetRole =
  | "screenshot_1"
  | "screenshot_2"
  | "screenshot_3";
type CurvePattern = "前高后低" | "平稳增长" | "二次起量" | "低开高走" | "断崖式";
type DropSeverity = "high" | "medium" | "low";
type TailStrength = "high" | "medium" | "low";

type OcrFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain";

type CurveInfoExtra = {
  curve_pattern?: string | null;
};

type RetentionInfoExtra = {
  bounce_peak_time?: string | null;
  replay_peak_time?: string | null;
};

type ParsedOcrResult = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  confidence: Record<OcrFieldKey, ConfidenceLevel>;
  curve_info?: CurveInfoExtra | null;
  retention_info?: RetentionInfoExtra | null;
};

type CurveRecognitionResult =
  | {
      recognized: true;
      curve_pattern: CurvePattern;
      first_peak_position: string | null;
      drop_severity: DropSeverity | null;
      tail_strength: TailStrength | null;
      confidence: number | null;
    }
  | {
      recognized: false;
      reason: string;
    };

type RetentionSegmentSummary = {
  segment: string;
  performance: string;
};

type RetentionAnalysis = {
  bounce_peak_time: string | null;
  replay_peak_time: string | null;
  segment_summary: RetentionSegmentSummary[];
};

type RetentionMetrics = {
  avg_play_duration: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
};

type RetentionRecognitionResult =
  | {
      recognized: true;
      retention_metrics: RetentionMetrics;
      retention_analysis: RetentionAnalysis;
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

type ImagePayloadSuccess = {
  dataUrl: string;
  screenshotType: ScreenshotType | null;
  assetRole: ScreenshotAssetRole | null;
};

type ImagePayloadError = {
  error: string;
};

export type ParsedScreenshotResponse = {
  slot_status: "pending_confirm" | "confirmed" | "failed";
  screenshot_type: ScreenshotType;
  confidence_score: number;
  requires_manual_confirmation: boolean;
  recognized_fields: JsonObject | null;
  confidence?: Record<OcrFieldKey, ConfidenceLevel>;
  error?: string;
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OCR_FIELDS: OcrFieldKey[] = [
  "play_count",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_gain",
];
const SCREENSHOT_TYPES: ScreenshotType[] = ["data", "curve", "retention"];
const CURVE_PATTERNS: CurvePattern[] = ["前高后低", "平稳增长", "二次起量", "低开高走", "断崖式"];
const QUALITATIVE_LEVELS: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const imagePayload = contentType.includes("multipart/form-data")
      ? await parseMultipartPayload(request)
      : await parseJsonPayload(request);

    if ("error" in imagePayload) {
      return NextResponse.json({ error: imagePayload.error }, { status: 400 });
    }

    if (!imagePayload.dataUrl) {
      return NextResponse.json({ error: "图片为空、损坏或请求格式不正确" }, { status: 400 });
    }

    const dataUrl = imagePayload.dataUrl;
    const forcedScreenshotType = getScreenshotTypeByAssetRole(imagePayload.assetRole);
    const screenshotType =
      forcedScreenshotType ??
      imagePayload.screenshotType ??
      (await detectScreenshotType(dataUrl));
    const prompt = buildPromptByType(screenshotType);

    try {
      const messages: AiMessage[] = [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }];

      const aiResult = await callAi({
        messages,
        maxTokens: 1000,
        jsonMode: true,
        timeoutMs: 25000,
        featureKey: "ocr_screenshot",
        databaseOnly: true,
      });

      const content = aiResult.content;

      if (screenshotType === "curve") {
        const parsed = parseOcrResponse(content, "curve");
        if (!parsed) {
          return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
        }
        return NextResponse.json({ data: parsed, screenshot_type: parsed.screenshot_type });
      }

      if (screenshotType === "retention") {
        const parsed = parseOcrResponse(content, "retention");
        if (!parsed) {
          return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
        }
        return NextResponse.json({ data: parsed, screenshot_type: parsed.screenshot_type });
      }

      const parsed = parseOcrResponse(content, "data");

      if (!parsed) {
        return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
      }

      if (parsed.slot_status === "failed") {
        return NextResponse.json({ data: parsed, screenshot_type: screenshotType }, { status: 200 });
      }

      return NextResponse.json({ data: parsed, screenshot_type: screenshotType });
    } catch (error) {
      const message = error instanceof Error ? error.message : "截图识别出错，请稍后重试或手动输入";
      return NextResponse.json(
        {
          error:
            message === "该 AI 功能已禁用"
              ? "截图识别功能已禁用，请先在后台启用"
              : message,
        },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json({ error: "图片为空、损坏或请求格式不正确" }, { status: 400 });
  }
}

async function parseMultipartPayload(request: NextRequest): Promise<ImagePayloadSuccess | ImagePayloadError> {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "请上传图片文件" };
  }

  const filePayload = await fileToDataUrl(file);
  if ("error" in filePayload) {
    return filePayload;
  }

  return {
    ...filePayload,
    screenshotType: normalizeScreenshotType(formData.get("screenshot_type")),
    assetRole: normalizeAssetRole(formData.get("asset_role")),
  };
}

async function parseJsonPayload(request: NextRequest): Promise<ImagePayloadSuccess | ImagePayloadError> {
  const body = await request.json();
  const image = typeof body?.image === "string" ? body.image.trim() : "";

  if (!image) {
    return { error: "图片为空、损坏或请求格式不正确" };
  }

  if (image.startsWith("data:image/")) {
    const mimeType = image.slice(5, image.indexOf(";"));
    if (!ACCEPTED_TYPES.has(mimeType)) {
      return { error: "仅支持 jpg、png、webp 图片" };
    }
    return {
      dataUrl: image,
      screenshotType: normalizeScreenshotType(body?.screenshot_type),
      assetRole: normalizeAssetRole(body?.asset_role),
    };
  }

  return { error: "JSON 请求需提供 data URL 格式图片" };
}

async function fileToDataUrl(file: File): Promise<{ dataUrl: string } | { error: string }> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return { error: "仅支持 jpg、png、webp 图片" };
  }

  if (file.size <= 0) {
    return { error: "图片为空或已损坏，请重新上传" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { error: "图片不能超过 8MB" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    dataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
  };
}

async function detectScreenshotType(dataUrl: string): Promise<ScreenshotType> {
  try {
    const messages: AiMessage[] = [{
      role: "user",
      content: [
        { type: "text", text: buildClassificationPrompt() },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }];

    const result = await callAi({
      messages,
      maxTokens: 300,
      jsonMode: true,
      timeoutMs: 12000,
      featureKey: "ocr_screenshot",
      databaseOnly: true,
    });

    return parseClassificationContent(result.content) ?? "data";
  } catch {
    return "data";
  }
}

function buildPromptByType(type: ScreenshotType): string {
  if (type === "curve") {
    return buildCurvePrompt();
  }

  if (type === "retention") {
    return buildRetentionPrompt();
  }

  return buildPrompt();
}

function buildPrompt(): string {
  return [
    "你是抖音数据截图 OCR 助手。",
    "请识别截图中的 6 个核心指标，并严格只返回 JSON。",
    "要求：",
    "1. 字段固定为 play_count、likes、comments、shares、favorites、follower_gain、confidence。",
    "2. play_count 返回真实播放量数字，例如 32100；如果截图写的是 3.21万，请换算为 32100。",
    "3. likes、comments、shares、favorites、follower_gain 返回整数。",
    "4. 无法确定时返回 null。",
    "5. confidence 必须包含以上 6 个字段，值只能是 high、medium、low。",
    "6. 如果截图中还包含推流曲线（每小时新增播放量图），增加 curve_info 字段，包含 curve_pattern（前高后低/平稳增长/二次起量/低开高走/断崖式）。",
    "7. 如果截图中还包含跳出率/回看率图表，增加 retention_info 字段，包含 bounce_peak_time 和 replay_peak_time。",
    "8. 如果没有推流曲线或跳出率图表，不用返回 curve_info 或 retention_info。",
    "9. 只返回 JSON，不要 markdown，不要解释。",
    "返回示例：",
    JSON.stringify({
      play_count: 32100,
      likes: 1280,
      comments: 68,
      shares: 15,
      favorites: 106,
      follower_gain: 42,
      confidence: {
        play_count: "high",
        likes: "high",
        comments: "medium",
        shares: "medium",
        favorites: "low",
        follower_gain: "medium",
      },
      curve_info: { curve_pattern: "二次起量" },
    }),
  ].join("\n");
}

function buildClassificationPrompt(): string {
  return [
    "你是抖音截图分类助手。",
    "请判断截图类型，只能返回 data、curve、retention 三种之一。",
    "data=包含播放量、点赞、评论、分享、收藏、涨粉等数字指标的截图。",
    "curve=仅包含每小时新增播放量推流曲线图（没有数字指标）。",
    "retention=仅包含跳出率/回看率曲线图（没有数字指标）。",
    "重要：如果截图同时包含数字指标（播放量等）和曲线图，必须返回 data。",
    "只返回 JSON。",
    JSON.stringify({ screenshot_type: "data" }),
  ].join("\n");
}

function buildCurvePrompt(): string {
  return [
    "你是抖音推流曲线识别助手。",
    "请识别‘每小时新增播放量’曲线，并严格返回 JSON。",
    "字段固定为 recognized、curve_pattern、first_peak_position、drop_severity、tail_strength、confidence。",
    "curve_pattern 只能是：前高后低、平稳增长、二次起量、低开高走、断崖式。",
    "drop_severity 和 tail_strength 只能是 high、medium、low。",
    "无法识别时返回 { recognized:false, reason:'...' }。",
    "只返回 JSON，不要解释。",
    JSON.stringify({
      recognized: true,
      curve_pattern: "二次起量",
      first_peak_position: "前段",
      drop_severity: "medium",
      tail_strength: "high",
      confidence: 0.86,
    }),
  ].join("\n");
}

function buildRetentionPrompt(): string {
  return [
    "你是抖音跳出回看图识别助手。",
    "请识别截图中的完播留存核心数值，并严格返回 JSON。",
    "字段固定为 recognized、retention_metrics、retention_analysis、confidence。",
    "retention_metrics 必须包含 avg_play_duration、bounce_rate_2s、completion_rate_5s、completion_rate。",
    "avg_play_duration 返回秒数纯数字，不要带‘秒’。",
    "bounce_rate_2s、completion_rate_5s、completion_rate 返回百分比纯数字，不要带‘%’。",
    "无法确定的字段返回 null。",
    "retention_analysis 必须包含 bounce_peak_time、replay_peak_time、segment_summary。",
    "segment_summary 为数组，每项包含 segment、performance。",
    "无法识别时返回 { recognized:false, reason:'...' }。",
    "只返回 JSON，不要解释。",
    JSON.stringify({
      recognized: true,
      retention_metrics: {
        avg_play_duration: 23.6,
        bounce_rate_2s: 41.2,
        completion_rate_5s: 32.8,
        completion_rate: 18.5,
      },
      retention_analysis: {
        bounce_peak_time: "0-3秒",
        replay_peak_time: "12-15秒",
        segment_summary: [
          { segment: "0-5秒", performance: "跳出高" },
          { segment: "10-15秒", performance: "回看明显" },
        ],
      },
      confidence: 0.78,
    }),
  ].join("\n");
}

export function parseClassificationContent(content: unknown): ScreenshotType | null {
  const normalizedContent = normalizeMessageContent(content);
  if (!normalizedContent) {
    return null;
  }

  const jsonText = extractJson(normalizedContent);
  if (!jsonText) {
    return null;
  }

  try {
    const raw = JSON.parse(jsonText) as { screenshot_type?: unknown };
    return normalizeScreenshotType(raw.screenshot_type);
  } catch {
    return null;
  }
}

function normalizeScreenshotTypeInput(value: unknown): ScreenshotType | null {
  switch (value) {
    case "overview":
    case "engagement_extra":
    case "other":
    case "data":
    case "screenshot_1":
      return "data";
    case "traffic_curve":
    case "curve":
      return "curve";
    case "retention_curve":
    case "retention":
    case "screenshot_2":
      return "retention";
    default:
      return null;
  }
}

export function parseOcrResponse(
  content: unknown,
  screenshotType: ScreenshotTypeInput
): ParsedScreenshotResponse | null {
  const normalizedType = normalizeScreenshotTypeInput(screenshotType);
  if (!normalizedType) {
    return null;
  }

  if (normalizedType === "curve") {
    const parsed = parseCurveContent(content);
    if (!parsed) {
      return null;
    }

    if (!parsed.recognized) {
      return {
        slot_status: "failed",
        screenshot_type: normalizedType,
        confidence_score: 0,
        requires_manual_confirmation: true,
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
      recognized_fields: parsed as unknown as JsonObject,
    };
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
      recognized_fields: parsed as unknown as JsonObject,
    };
  }

  const parsed = parseOcrContent(content);
  if (!parsed) {
    return null;
  }

  const recognizedFields = Object.fromEntries(
    OCR_FIELDS.filter((field) => parsed[field] !== null).map((field) => [field, parsed[field]])
  ) as JsonObject;

  if (parsed.curve_info) {
    (recognizedFields as Record<string, JsonValue>).curve_info = parsed.curve_info as unknown as JsonObject;
  }
  if (parsed.retention_info) {
    (recognizedFields as Record<string, JsonValue>).retention_info = parsed.retention_info as unknown as JsonObject;
  }

  const hasAnyValue = OCR_FIELDS.some((field) => parsed[field] !== null);
  if (!hasAnyValue) {
    return {
      slot_status: "failed",
      screenshot_type: normalizedType,
      confidence_score: 0,
      requires_manual_confirmation: true,
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
      curve_info?: { curve_pattern?: unknown };
      retention_info?: { bounce_peak_time?: unknown; replay_peak_time?: unknown };
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
      curve_info: raw.curve_info ? {
        curve_pattern: normalizeOptionalText(raw.curve_info.curve_pattern) ?? null,
      } : null,
      retention_info: raw.retention_info ? {
        bounce_peak_time: normalizeOptionalText(raw.retention_info.bounce_peak_time) ?? null,
        replay_peak_time: normalizeOptionalText(raw.retention_info.replay_peak_time) ?? null,
      } : null,
    };

    return normalized;
  } catch {
    return null;
  }
}

export function parseCurveContent(content: unknown): CurveRecognitionResult | null {
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
      curve_pattern?: unknown;
      first_peak_position?: unknown;
      drop_severity?: unknown;
      tail_strength?: unknown;
      confidence?: unknown;
    };

    if (raw.recognized === false) {
      const reason = normalizeReason(raw.reason);
      return reason ? { recognized: false, reason } : null;
    }

    const curvePattern = normalizeCurvePattern(raw.curve_pattern);
    if (!curvePattern) {
      return null;
    }

    return {
      recognized: true,
      curve_pattern: curvePattern,
      first_peak_position: normalizeOptionalText(raw.first_peak_position),
      drop_severity: normalizeLevel(raw.drop_severity),
      tail_strength: normalizeLevel(raw.tail_strength),
      confidence: normalizeScore(raw.confidence),
    };
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
      retention_analysis?: {
        bounce_peak_time?: unknown;
        replay_peak_time?: unknown;
        segment_summary?: unknown;
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

    const segmentSummary = normalizeSegmentSummary(raw.retention_analysis?.segment_summary);

    return {
      recognized: true,
      retention_metrics: retentionMetrics,
      retention_analysis: {
        bounce_peak_time: normalizeOptionalText(raw.retention_analysis?.bounce_peak_time),
        replay_peak_time: normalizeOptionalText(raw.retention_analysis?.replay_peak_time),
        segment_summary: segmentSummary ?? [],
      },
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
    const normalized = value.replace(/[,%\s]/g, "").replace(/万$/, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
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

export function getScreenshotTypeByAssetRole(assetRole: unknown): ScreenshotType | null {
  return normalizeScreenshotTypeInput(assetRole);
}

function normalizeScreenshotType(value: unknown): ScreenshotType | null {
  return typeof value === "string" && SCREENSHOT_TYPES.includes(value as ScreenshotType)
    ? (value as ScreenshotType)
    : null;
}

function normalizeAssetRole(value: unknown): ScreenshotAssetRole | null {
  return value === "screenshot_1" ||
    value === "screenshot_2" ||
    value === "screenshot_3"
    ? value
    : null;
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCurvePattern(value: unknown): CurvePattern | null {
  return typeof value === "string" && CURVE_PATTERNS.includes(value as CurvePattern)
    ? (value as CurvePattern)
    : null;
}

function normalizeLevel(value: unknown): DropSeverity | TailStrength | null {
  return typeof value === "string" && QUALITATIVE_LEVELS.includes(value as DropSeverity)
    ? (value as DropSeverity)
    : null;
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

function normalizeSegmentSummary(value: unknown): RetentionSegmentSummary[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const segment = normalizeOptionalText((item as { segment?: unknown }).segment);
      const performance = normalizeOptionalText((item as { performance?: unknown }).performance);

      if (!segment || !performance) {
        return null;
      }

      return { segment, performance };
    })
    .filter((item): item is RetentionSegmentSummary => item !== null);

  return normalized.length > 0 ? normalized : null;
}
