import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiChannelError, callAi } from "@/lib/ai/client";
import type { AiMessage, AiResponse } from "@/lib/ai/client";
import { validateOcrStorageReference } from "./input";
import { detectImageMimeType, hasMatchingImageSignature } from "@/lib/file-signatures";
import { logApiRequest, resolveRequestId } from "@/lib/api-logger";

type ConfidenceLevel = "high" | "medium" | "low";
type ScreenshotType = "data" | "retention";
type ScreenshotTypeSource = "explicit" | "asset_role" | "asset_role_fallback";
export type OcrErrorCode =
  | "RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_CHANNEL_UNAVAILABLE"
  | "AI_EMPTY_RESPONSE"
  | "AI_PARSE_FAILED"
  | "LOW_CONFIDENCE"
  | "STORAGE_READ_FAILED";
type ScreenshotTypeInput =
  | ScreenshotType
  | "overview"
  | "traffic_curve"
  | "retention_curve"
  | "engagement_extra"
  | "other"
  | ScreenshotAssetRole;
export type ScreenshotAssetRole = "screenshot_1" | "screenshot_2";

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
  downloadMs?: number;
};

type ResolvedScreenshotType = {
  type: ScreenshotType;
  source: ScreenshotTypeSource;
};

type ImagePayloadError = {
  error: string;
  errorCode?: OcrErrorCode;
  status?: number;
};

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

type OcrTimings = {
  download_ms?: number;
  ocr_ms?: number;
  parse_ms?: number;
  total_ms: number;
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
const SCREENSHOT_TYPES: ScreenshotType[] = ["data", "retention"];

function getOcrErrorMessage(errorCode: OcrErrorCode) {
  switch (errorCode) {
    case "RATE_LIMITED":
      return "请求过于频繁，请稍后再试";
    case "AI_TIMEOUT":
      return "识别超时，请稍后重试";
    case "AI_CHANNEL_UNAVAILABLE":
      return "截图识别通道暂不可用，请手动填写或稍后重试";
    case "AI_EMPTY_RESPONSE":
      return "当前模型没有返回识别结果，请手动填写或联系管理员检查视觉模型";
    case "AI_PARSE_FAILED":
      return "AI 返回格式无法识别，请手动填写或稍后重试";
    case "LOW_CONFIDENCE":
      return "图片不清晰或识别置信度低，请手动核对";
    case "STORAGE_READ_FAILED":
      return "已上传截图读取失败，请重新上传";
  }
}

function getAiErrorCode(error: unknown): OcrErrorCode {
  if (error instanceof AiChannelError) {
    if (error.errorType === "timeout") return "AI_TIMEOUT";
    if (error.errorType === "empty_response") return "AI_EMPTY_RESPONSE";
    return "AI_CHANNEL_UNAVAILABLE";
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/超时|timeout/i.test(message)) return "AI_TIMEOUT";
  if (/空正文|未返回有效内容|empty/i.test(message)) return "AI_EMPTY_RESPONSE";
  return "AI_CHANNEL_UNAVAILABLE";
}

async function runOcrAttempt(
  dataUrl: string,
  screenshotType: ScreenshotType,
  timings: Partial<OcrTimings>,
): Promise<{ parsed: ParsedScreenshotResponse | null; aiResult: AiResponse }> {
  const messages: AiMessage[] = [{
    role: "user",
    content: [
      { type: "text", text: buildPromptByType(screenshotType) },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  }];

  const ocrStart = Date.now();
  const aiResult = await callAi({
    messages,
    maxTokens: 1000,
    jsonMode: true,
    timeoutMs: 25000,
    featureKey: "ocr_screenshot",
    databaseOnly: true,
  });
  timings.ocr_ms = (timings.ocr_ms ?? 0) + Date.now() - ocrStart;

  const parseStart = Date.now();
  const parsed = parseOcrResponse(aiResult.content, screenshotType);
  timings.parse_ms = (timings.parse_ms ?? 0) + Date.now() - parseStart;

  return { parsed, aiResult };
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const startTime = Date.now();
  const supabase = await createClient();
  const timings: Partial<OcrTimings> = {};
  let logContext: {
    assetRole?: ScreenshotAssetRole | null;
    screenshotType?: ScreenshotType | null;
    screenshotTypeSource?: ScreenshotTypeSource | null;
    aiChannel?: string | null;
    aiModel?: string | null;
  } = {};

  const finish = (
    body: Record<string, unknown>,
    status: number,
    outcome: string,
    userId?: string | null,
    errorCode?: OcrErrorCode,
  ) => {
    timings.total_ms = Date.now() - startTime;
    logApiRequest({
      requestId,
      route: "/api/ocr-screenshot",
      method: "POST",
      status,
      durationMs: timings.total_ms,
      userId: userId ?? null,
      outcome,
      detail: {
        asset_role: logContext.assetRole ?? null,
        screenshot_type: logContext.screenshotType ?? null,
        screenshot_type_source: logContext.screenshotTypeSource ?? null,
        error_code: errorCode ?? null,
        timings,
        ai_channel: logContext.aiChannel ?? null,
        ai_model: logContext.aiModel ?? null,
      },
    });
    return NextResponse.json({ request_id: requestId, ...body }, { status });
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return finish({ error: "未登录" }, 401, "unauthorized", null);
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const imagePayload = contentType.includes("multipart/form-data")
      ? await parseMultipartPayload(request)
      : await parseJsonPayload(request, user.id);

    if ("error" in imagePayload) {
      return finish(
        { error: imagePayload.error, error_code: imagePayload.errorCode },
        imagePayload.status ?? 400,
        imagePayload.errorCode ? "input_error" : "bad_request",
        user.id,
        imagePayload.errorCode,
      );
    }

    logContext = {
      ...logContext,
      assetRole: imagePayload.assetRole,
    };

    if (!imagePayload.dataUrl) {
      return finish({ error: "图片为空、损坏或请求格式不正确" }, 400, "bad_request", user.id);
    }

    timings.download_ms = imagePayload.downloadMs ?? 0;
    const dataUrl = imagePayload.dataUrl;
    const resolvedScreenshotType = resolveScreenshotType(imagePayload);
    const screenshotType = resolvedScreenshotType.type;
    logContext = {
      ...logContext,
      screenshotType,
      screenshotTypeSource: resolvedScreenshotType.source,
    };

    try {
      const attempt = await runOcrAttempt(dataUrl, screenshotType, timings);
      const parsed = attempt.parsed;
      logContext = {
        ...logContext,
        aiChannel: attempt.aiResult.channelName,
        aiModel: attempt.aiResult.model,
      };

      if (!parsed) {
        const errorCode: OcrErrorCode = "AI_PARSE_FAILED";
        return finish(
          {
            error: getOcrErrorMessage(errorCode),
            error_code: errorCode,
            timings,
          },
          500,
          "parse_error",
          user.id,
          errorCode,
        );
      }

      if (parsed.slot_status === "failed") {
        const errorCode = parsed.error_code ?? "LOW_CONFIDENCE";
        return finish(
          {
            data: parsed,
            screenshot_type: screenshotType,
            screenshot_type_source: resolvedScreenshotType.source,
            timings,
          },
          200,
          "recognized_failed",
          user.id,
          errorCode,
        );
      }

      return finish(
        {
          data: parsed,
          screenshot_type: screenshotType,
          screenshot_type_source: resolvedScreenshotType.source,
          timings,
        },
        200,
        parsed.slot_status === "pending_confirm" ? "pending_confirm" : "success",
        user.id,
      );
    } catch (error) {
      const errorCode = getAiErrorCode(error);
      return finish(
        {
          error: getOcrErrorMessage(errorCode),
          error_code: errorCode,
          timings,
        },
        500,
        "ai_error",
        user.id,
        errorCode,
      );
    }
  } catch {
    return finish({ error: "图片为空、损坏或请求格式不正确" }, 400, "bad_request", user.id);
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

async function parseJsonPayload(
  request: NextRequest,
  userId: string
): Promise<ImagePayloadSuccess | ImagePayloadError> {
  const body = await request.json();

  // 优先支持已上传到 storage 的图片：{ bucket, path, asset_role, screenshot_type }
  const bucket = typeof body?.bucket === "string" ? body.bucket.trim() : "";
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  if (bucket && path) {
    const reference = validateOcrStorageReference(userId, bucket, path);
    if (!reference.ok) return { error: reference.error };
    const downloadStart = Date.now();
    const downloaded = await downloadImageFromStorage(reference.bucket, reference.path);
    const downloadMs = Date.now() - downloadStart;
    if ("error" in downloaded) {
      return { ...downloaded, errorCode: "STORAGE_READ_FAILED", status: 502 };
    }
    return {
      ...downloaded,
      downloadMs,
      screenshotType: normalizeScreenshotType(body?.screenshot_type),
      assetRole: normalizeAssetRole(body?.asset_role),
    };
  }

  // 保留旧版 JSON data URL 兼容
  const image = typeof body?.image === "string" ? body.image.trim() : "";

  if (!image) {
    return { error: "图片为空、损坏或请求格式不正确" };
  }

  if (image.startsWith("data:image/")) {
    const mimeType = image.slice(5, image.indexOf(";"));
    if (!ACCEPTED_TYPES.has(mimeType)) {
      return { error: "仅支持 jpg、png、webp 图片" };
    }
    const base64 = image.slice(image.indexOf(",") + 1);
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length <= 0 || buffer.length > MAX_FILE_SIZE) {
      return { error: "图片不能超过 8MB" };
    }
    if (!hasMatchingImageSignature(buffer, mimeType)) {
      return { error: "图片内容与文件类型不一致或文件已损坏" };
    }
    return {
      dataUrl: image,
      screenshotType: normalizeScreenshotType(body?.screenshot_type),
      assetRole: normalizeAssetRole(body?.asset_role),
    };
  }

  return { error: "JSON 请求需提供受保护的 bucket+path 或 data URL 格式图片" };
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
  if (!hasMatchingImageSignature(buffer, file.type)) {
    return { error: "图片内容与文件类型不一致或文件已损坏" };
  }
  return {
    dataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
  };
}

async function downloadImageFromStorage(
  bucket: string,
  path: string
): Promise<{ dataUrl: string } | { error: string }> {
  try {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase.storage.from(bucket).download(path);

    if (error || !data) {
      return { error: error?.message || "无法从存储读取图片" };
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_FILE_SIZE) {
      return { error: "图片不能超过 8MB" };
    }

    const detectedMimeType = detectImageMimeType(buffer);
    const declaredMimeType = data.type || inferMimeTypeFromPath(path);
    if (!detectedMimeType || !ACCEPTED_TYPES.has(declaredMimeType) || detectedMimeType !== declaredMimeType) {
      return { error: "仅支持 jpg、png、webp 图片" };
    }

    return {
      dataUrl: `data:${detectedMimeType};base64,${buffer.toString("base64")}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取存储图片失败";
    return { error: message };
  }
}


function inferMimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function resolveScreenshotType(imagePayload: ImagePayloadSuccess): ResolvedScreenshotType {
  const known = resolveKnownScreenshotType({
    screenshotType: imagePayload.screenshotType,
    assetRole: imagePayload.assetRole,
  });
  if (known) {
    return known;
  }

  return {
    type: getScreenshotTypeFallbackByAssetRole(imagePayload.assetRole),
    source: "asset_role_fallback",
  };
}

export function resolveKnownScreenshotType(input: {
  screenshotType: ScreenshotType | null;
  assetRole: ScreenshotAssetRole | null;
}): ResolvedScreenshotType | null {
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

function buildPromptByType(type: ScreenshotType): string {
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
    "6. 只返回 JSON，不要 markdown，不要解释。",
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
    }),
  ].join("\n");
}

function buildRetentionPrompt(): string {
  return [
    "你是抖音跳出回看图识别助手。",
    "请识别截图中的完播留存核心数值，并严格返回 JSON。",
    "字段固定为 recognized、retention_metrics、confidence。",
    "retention_metrics 必须包含 avg_play_duration、bounce_rate_2s、completion_rate_5s、completion_rate。",
    "avg_play_duration 返回秒数纯数字，不要带‘秒’。",
    "bounce_rate_2s、completion_rate_5s、completion_rate 返回百分比纯数字，不要带‘%’。",
    "无法确定的字段返回 null。",
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
      confidence: 0.78,
    }),
  ].join("\n");
}

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

export function getScreenshotTypeByAssetRole(assetRole: unknown): ScreenshotType | null {
  return normalizeScreenshotTypeInput(assetRole);
}

export function getScreenshotTypeFallbackByAssetRole(assetRole: unknown): ScreenshotType {
  if (assetRole === "screenshot_2") {
    return "retention";
  }

  return "data";
}

function normalizeScreenshotType(value: unknown): ScreenshotType | null {
  return typeof value === "string" && SCREENSHOT_TYPES.includes(value as ScreenshotType)
    ? (value as ScreenshotType)
    : null;
}

function normalizeAssetRole(value: unknown): ScreenshotAssetRole | null {
  return value === "screenshot_1" || value === "screenshot_2" ? value : null;
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
