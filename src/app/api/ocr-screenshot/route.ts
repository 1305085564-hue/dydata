import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiChannelError, callAi } from "@/lib/ai/client";
import type { AiMessage } from "@/lib/ai/client";
import { validateOcrStorageReference } from "./input";
import { detectImageMimeType, hasMatchingImageSignature } from "@/lib/file-signatures";
import { logApiRequest, resolveRequestId } from "@/lib/api-logger";
import { runBaiduOcrAttempt, mapBaiduErrorToOcrCode } from "./baidu-channel";
import { resolveOcrScreenshotChannel, type OcrScreenshotChannel } from "./channel-config";

// 输出契约与解析函数已抽到 ocr-contract.ts，这里统一再导出保持既有导入路径兼容
export {
  getScreenshotTypeByAssetRole,
  getScreenshotTypeFallbackByAssetRole,
  parseOcrResponse,
  parseRetentionContent,
  resolveKnownScreenshotType,
} from "./ocr-contract";
export type {
  ConfidenceLevel,
  OcrErrorCode,
  ParsedScreenshotResponse,
  RetentionMetrics,
  ScreenshotType,
} from "./ocr-contract";

import {
  getScreenshotTypeFallbackByAssetRole,
  parseOcrResponse,
  resolveKnownScreenshotType,
} from "./ocr-contract";
import type {
  OcrErrorCode,
  ParsedScreenshotResponse,
  ScreenshotType,
  ScreenshotAssetRole,
} from "./ocr-contract";

export type { OcrScreenshotChannel };

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
type ScreenshotTypeSource = "explicit" | "asset_role" | "asset_role_fallback";

type ImagePayloadError = {
  error: string;
  errorCode?: OcrErrorCode;
  status?: number;
};

type OcrTimings = {
  download_ms?: number;
  ocr_ms?: number;
  baidu_ms?: number;
  structure_ms?: number;
  parse_ms?: number;
  total_ms: number;
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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

async function runVisionOcrAttempt(
  dataUrl: string,
  screenshotType: ScreenshotType,
  timings: Partial<OcrTimings>,
): Promise<OcrAttempt> {
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

  return { parsed, channelName: "vision", model: aiResult.model };
}

type OcrAttempt = {
  parsed: ParsedScreenshotResponse | null;
  channelName: string;
  model: string | null;
};

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const startTime = Date.now();
  const supabase = await createClient();
  const timings: Partial<OcrTimings> = {};
  let logContext: {
    assetRole?: ScreenshotAssetRole | null;
    screenshotType?: ScreenshotType | null;
    screenshotTypeSource?: ScreenshotTypeSource | null;
    ocrChannel?: OcrScreenshotChannel | null;
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
        channel: logContext.ocrChannel ?? null,
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

    const ocrChannel = await resolveOcrScreenshotChannel();
    logContext = { ...logContext, ocrChannel };

    try {
      const attempt =
        ocrChannel === "baidu"
          ? await runBaiduOcrAttempt({ dataUrl, screenshotType, timings })
          : await runVisionOcrAttempt(dataUrl, screenshotType, timings);
      const parsed = attempt.parsed;
      logContext = {
        ...logContext,
        aiChannel: attempt.channelName,
        aiModel: attempt.model,
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
      const errorCode = mapBaiduErrorToOcrCode(error) ?? getAiErrorCode(error);
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

function normalizeScreenshotType(value: unknown): ScreenshotType | null {
  return typeof value === "string" && SCREENSHOT_TYPES.includes(value as ScreenshotType)
    ? (value as ScreenshotType)
    : null;
}

function normalizeAssetRole(value: unknown): ScreenshotAssetRole | null {
  return value === "screenshot_1" || value === "screenshot_2" ? value : null;
}
