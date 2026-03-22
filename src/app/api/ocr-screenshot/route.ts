import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ConfidenceLevel = "high" | "medium" | "low";
type ScreenshotType = "data" | "curve" | "retention";
export type ScreenshotAssetRole =
  | "overview"
  | "traffic_curve"
  | "retention_curve"
  | "engagement_extra"
  | "other";
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

type ParsedOcrResult = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  confidence: Record<OcrFieldKey, ConfidenceLevel>;
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

type RetentionRecognitionResult =
  | {
      recognized: true;
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

type UpstreamRequestBody = {
  model: string;
  messages: Array<{
    role: "user";
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  }>;
  max_tokens: number;
  response_format: { type: "json_object" };
};

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type UpstreamSuccessResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

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
const OCR_MODEL = process.env.OCR_MODEL || "claude-haiku-4-5";
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

  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "截图识别功能暂不可用，请手动输入数据" },
      { status: 500 }
    );
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
    const upstreamUrl = buildUpstreamUrl(baseUrl);
    const forcedScreenshotType = getScreenshotTypeByAssetRole(imagePayload.assetRole);
    const screenshotType =
      forcedScreenshotType ??
      imagePayload.screenshotType ??
      (await detectScreenshotType(dataUrl, upstreamUrl, apiKey));
    const prompt = buildPromptByType(screenshotType);
    const requestBody: UpstreamRequestBody = {
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" as const },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const aiRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const rawText = await aiRes.text();

      if (!aiRes.ok) {
        return NextResponse.json(
          { error: extractUpstreamError(rawText) || "截图识别失败，请稍后重试或手动输入数据" },
          { status: 500 }
        );
      }

      const aiData = safeJsonParse(rawText) as UpstreamSuccessResponse | null;
      const content = aiData?.choices?.[0]?.message?.content;

      if (screenshotType === "curve") {
        const parsed = parseOcrResponse(content, imagePayload.assetRole ?? "traffic_curve");
        if (!parsed) {
          return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
        }
        return NextResponse.json({ data: parsed, screenshot_type: screenshotType });
      }

      if (screenshotType === "retention") {
        const parsed = parseOcrResponse(content, imagePayload.assetRole ?? "retention_curve");
        if (!parsed) {
          return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
        }
        return NextResponse.json({ data: parsed, screenshot_type: screenshotType });
      }

      const parsed = parseOcrResponse(content, imagePayload.assetRole ?? "overview");

      if (!parsed) {
        return NextResponse.json({ error: "识别失败，请换清晰截图重试" }, { status: 500 });
      }

      if (parsed.slot_status === "failed") {
        return NextResponse.json({ data: parsed, screenshot_type: screenshotType }, { status: 200 });
      }

      return NextResponse.json({ data: parsed, screenshot_type: screenshotType });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return NextResponse.json({ error: "AI 识别超时，请稍后重试" }, { status: 504 });
      }

      return NextResponse.json(
        { error: (error as Error).message || "截图识别出错，请稍后重试或手动输入" },
        { status: 500 }
      );
    } finally {
      clearTimeout(timeout);
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

async function detectScreenshotType(dataUrl: string, upstreamUrl: string, apiKey: string): Promise<ScreenshotType> {
  const requestBody: UpstreamRequestBody = {
    model: OCR_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildClassificationPrompt() },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 300,
    response_format: { type: "json_object" },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      return "data";
    }

    const rawText = await response.text();
    const parsed = safeJsonParse(rawText) as UpstreamSuccessResponse | null;
    return parseClassificationContent(parsed?.choices?.[0]?.message?.content) ?? "data";
  } catch {
    return "data";
  } finally {
    clearTimeout(timeout);
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
    "2. play_count 返回以‘万’为单位的小数，例如 3.21；如果截图写的是 32100，请换算为 3.21。",
    "3. likes、comments、shares、favorites、follower_gain 返回整数。",
    "4. 无法确定时返回 null。",
    "5. confidence 必须包含以上 6 个字段，值只能是 high、medium、low。",
    "6. 只返回 JSON，不要 markdown，不要解释。",
    "返回示例：",
    JSON.stringify({
      play_count: 3.21,
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
    }),
  ].join("\n");
}

function buildClassificationPrompt(): string {
  return [
    "你是抖音截图分类助手。",
    "请判断截图类型，只能返回 data、curve、retention 三种之一。",
    "data=常规数据截图，curve=每小时新增播放量推流曲线，retention=跳出率/回看率图。",
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
    "请识别跳出率和回看率峰值时间点，并严格返回 JSON。",
    "字段固定为 recognized、retention_analysis、confidence。",
    "retention_analysis 必须包含 bounce_peak_time、replay_peak_time、segment_summary。",
    "segment_summary 为数组，每项包含 segment、performance。",
    "无法识别时返回 { recognized:false, reason:'...' }。",
    "只返回 JSON，不要解释。",
    JSON.stringify({
      recognized: true,
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

function buildUpstreamUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function extractUpstreamError(rawText: string): string | null {
  const parsed = safeJsonParse(rawText);
  const error = parsed?.error;
  const message =
    error && typeof error === "object" && "message" in error ? error.message : null;
  return typeof message === "string" && message.trim() ? message : null;
}

function safeJsonParse(rawText: string): JsonObject | null {
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null;
  } catch {
    return null;
  }
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

export function parseOcrResponse(
  content: unknown,
  assetRole: ScreenshotAssetRole
): ParsedScreenshotResponse | null {
  const screenshotType = getScreenshotTypeByAssetRole(assetRole);
  if (!screenshotType) {
    return null;
  }

  if (screenshotType === "curve") {
    const parsed = parseCurveContent(content);
    if (!parsed) {
      return null;
    }

    if (!parsed.recognized) {
      return {
        slot_status: "failed",
        screenshot_type: screenshotType,
        confidence_score: 0,
        requires_manual_confirmation: true,
        error: parsed.reason,
        recognized_fields: null,
      };
    }

    const confidenceScore = parsed.confidence ?? 0;
    return {
      slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
      screenshot_type: screenshotType,
      confidence_score: confidenceScore,
      requires_manual_confirmation: confidenceScore < 0.7,
      recognized_fields: parsed as unknown as JsonObject,
    };
  }

  if (screenshotType === "retention") {
    const parsed = parseRetentionContent(content);
    if (!parsed) {
      return null;
    }

    if (!parsed.recognized) {
      return {
        slot_status: "failed",
        screenshot_type: screenshotType,
        confidence_score: 0,
        requires_manual_confirmation: true,
        error: parsed.reason,
        recognized_fields: null,
      };
    }

    const confidenceScore = parsed.confidence ?? 0;
    return {
      slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
      screenshot_type: screenshotType,
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

  const hasAnyValue = OCR_FIELDS.some((field) => parsed[field] !== null);
  if (!hasAnyValue) {
    return {
      slot_status: "failed",
      screenshot_type: screenshotType,
      confidence_score: 0,
      requires_manual_confirmation: true,
      error: "图片不清晰或未识别到数据",
      recognized_fields: null,
    };
  }

  const confidenceScore = getConfidenceScore(parsed.confidence);

  return {
    slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
    screenshot_type: screenshotType,
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

    const segmentSummary = normalizeSegmentSummary(raw.retention_analysis?.segment_summary);
    if (!segmentSummary) {
      return null;
    }

    return {
      recognized: true,
      retention_analysis: {
        bounce_peak_time: normalizeOptionalText(raw.retention_analysis?.bounce_peak_time),
        replay_peak_time: normalizeOptionalText(raw.retention_analysis?.replay_peak_time),
        segment_summary: segmentSummary,
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
  if (assetRole === "overview" || assetRole === "engagement_extra" || assetRole === "other") {
    return "data";
  }

  if (assetRole === "traffic_curve") {
    return "curve";
  }

  if (assetRole === "retention_curve") {
    return "retention";
  }

  return null;
}

function normalizeScreenshotType(value: unknown): ScreenshotType | null {
  return typeof value === "string" && SCREENSHOT_TYPES.includes(value as ScreenshotType)
    ? (value as ScreenshotType)
    : null;
}

function normalizeAssetRole(value: unknown): ScreenshotAssetRole | null {
  return value === "overview" ||
    value === "traffic_curve" ||
    value === "retention_curve" ||
    value === "engagement_extra" ||
    value === "other"
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
