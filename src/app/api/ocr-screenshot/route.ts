import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateOcrStorageReference } from "./input";
import { detectImageMimeType, hasMatchingImageSignature } from "@/lib/file-signatures";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import type { MutationObservation } from "@/lib/observed-mutation-result";
import type { AiProviderProtocol } from "@/lib/ai/provider-protocols";
import type { ClairicUsage } from "@/lib/clairic-ocr";
import { downloadSubmissionScreenshotBytes } from "@/lib/screenshot-storage";
import { recordOcrRecognitionLog, type OcrFallbackDetail } from "./ocr-log";
import { OcrRunnerError, normalizeVisionDataUrl, runScreenshotOcr, type OcrRunnerTimings } from "./ocr-runner";
import {
  resolveKnownScreenshotType,
  type OcrErrorCode,
  type ScreenshotAssetRole,
  type ScreenshotType,
} from "./ocr-contract";

// 输出契约、解析函数与视觉压缩已下沉模块，这里再导出保持既有导入路径兼容
export {
  getScreenshotTypeByAssetRole,
  hasJsonObject,
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
  ScreenshotAssetRole,
} from "./ocr-contract";
export { normalizeVisionDataUrl };

type OcrScreenshotDeps = {
  createClient: typeof createClient;
  runOcr: typeof runScreenshotOcr;
  recordLog: typeof recordOcrRecognitionLog;
};

export const defaultOcrScreenshotDeps: OcrScreenshotDeps = {
  createClient,
  runOcr: runScreenshotOcr,
  recordLog: recordOcrRecognitionLog,
};

// Vercel 函数执行上限：识别走算力池顺位链，总预算 60 秒
export const maxDuration = 60;

type ImagePayloadSuccess = {
  dataUrl: string;
  screenshotType: ScreenshotType | null;
  assetRole: ScreenshotAssetRole | null;
  downloadMs?: number;
};

type ScreenshotTypeSource = "explicit" | "asset_role";
type ResolvedScreenshotType = { type: ScreenshotType; source: ScreenshotTypeSource };
type ImagePayloadError = { error: string; errorCode?: OcrErrorCode; status?: number };
type OcrTimings = OcrRunnerTimings & { total_ms: number };

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

function getUnexpectedErrorCode(error: unknown): OcrErrorCode {
  if (error instanceof OcrRunnerError) return error.errorCode;
  const message = error instanceof Error ? error.message : String(error);
  if (/超时|timeout/i.test(message)) return "AI_TIMEOUT";
  if (/429|限流|rate/i.test(message)) return "RATE_LIMITED";
  if (/空正文|未返回有效内容|empty/i.test(message)) return "AI_EMPTY_RESPONSE";
  if (/解析失败|parse_failed/i.test(message)) return "AI_PARSE_FAILED";
  return "AI_CHANNEL_UNAVAILABLE";
}

export async function buildOcrScreenshotResponse(
  request: NextRequest,
  deps: OcrScreenshotDeps = defaultOcrScreenshotDeps,
  observation: MutationObservation,
) {
  const startTime = Date.now();
  const supabase = await deps.createClient();
  const timings: Partial<OcrTimings> = {};
  let logContext: {
    ocrEntered?: boolean;
    assetRole?: ScreenshotAssetRole | null;
    screenshotType?: ScreenshotType | null;
    screenshotTypeSource?: ScreenshotTypeSource | null;
    protocol?: AiProviderProtocol | null;
    aiChannel?: string | null;
    aiModel?: string | null;
    clairicUsage?: ClairicUsage | null;
    fallbackDetail?: OcrFallbackDetail | null;
  } = {};

  const finish = async (
    body: Record<string, unknown>,
    status: number,
    outcome: string,
    userId?: string | null,
    errorCode?: OcrErrorCode,
  ) => {
    timings.total_ms = Date.now() - startTime;
    const businessSucceeded = status < 400 && outcome !== "recognized_failed";
    observation.setDetail?.({
      businessSucceeded,
      permissionChecked: Boolean(userId),
      userId: userId ?? null,
      outcome,
      asset_role: logContext.assetRole ?? null,
      screenshot_type: logContext.screenshotType ?? null,
      screenshot_type_source: logContext.screenshotTypeSource ?? null,
      error_code: errorCode ?? null,
      timings,
      protocol: logContext.protocol ?? null,
      ai_channel: logContext.aiChannel ?? null,
      ai_model: logContext.aiModel ?? null,
      ...(logContext.fallbackDetail ? { fallback_detail: logContext.fallbackDetail } : {}),
      ...(logContext.clairicUsage ? { clairic_usage: logContext.clairicUsage } : {}),
    });

    // 测速台账只记真正进入识别的请求，401/输入错误不落账；await 插入保证冻结前落库，异常吞并不影响业务回执
    if (logContext.ocrEntered) {
      try {
        await deps.recordLog({
          // 用接口返回给前端的同一个编号：识别记录与 AI 调用记录据此对上。
          requestId: observation.requestId,
          totalMs: timings.total_ms,
          ocrMs: timings.ocr_ms ?? timings.clairic_ms ?? null,
          downloadMs: timings.download_ms ?? null,
          channelName: logContext.aiChannel ?? null,
          modelId: logContext.aiModel ?? null,
          screenshotType: logContext.screenshotType ?? null,
          isSuccess: businessSucceeded,
          errorCode: errorCode ?? null,
          userId: userId ?? null,
          fallbackDetail: logContext.fallbackDetail ?? null,
        });
      } catch {}
    }

    return appendObservedMutationResult(
      NextResponse.json({ request_id: observation.requestId, ...body, businessSucceeded }, { status }),
      observation,
    );
  };

  observation.mark("auth");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return await finish({ error: "未登录" }, 401, "unauthorized", null);
  }

  try {
    observation.mark("validate");
    const contentType = request.headers.get("content-type") || "";
    const imagePayload = contentType.includes("multipart/form-data")
      ? await parseMultipartPayload(request)
      : await parseJsonPayload(request, user.id);

    if ("error" in imagePayload) {
      return await finish(
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
      return await finish({ error: "图片为空、损坏或请求格式不正确" }, 400, "bad_request", user.id);
    }

    timings.download_ms = imagePayload.downloadMs ?? 0;
    const dataUrl = imagePayload.dataUrl;
    const resolvedScreenshotType = resolveScreenshotType(imagePayload);
    if (!resolvedScreenshotType) {
      return await finish(
        { error: "缺少截图类型：screenshot_type 必须是 data 或 retention" },
        400,
        "bad_request",
        user.id,
      );
    }
    const screenshotType = resolvedScreenshotType.type;
    logContext = {
      ...logContext,
      ocrEntered: true,
      screenshotType,
      screenshotTypeSource: resolvedScreenshotType.source,
    };

    try {
      observation.mark("read");
      const result = await deps.runOcr({ dataUrl, screenshotType, timings, requestId: observation.requestId });
      timings.ocr_ms = result.ocrMs;
      logContext = {
        ...logContext,
        protocol: result.protocol,
        aiChannel: result.channelName,
        aiModel: result.model,
        clairicUsage: result.usage,
        fallbackDetail: result.fallbackDetail,
      };

      const parsed = result.parsed;
      const parsedScreenshotType = parsed.screenshot_type;
      const responseSource = resolvedScreenshotType.source;
      logContext = {
        ...logContext,
        screenshotType: parsedScreenshotType,
        screenshotTypeSource: responseSource,
      };

      if (parsed.slot_status === "failed") {
        const errorCode = parsed.error_code ?? "LOW_CONFIDENCE";
        return await finish(
          {
            data: parsed,
            screenshot_type: parsedScreenshotType,
            screenshot_type_source: responseSource,
            timings,
          },
          200,
          "recognized_failed",
          user.id,
          errorCode,
        );
      }

      return await finish(
        {
          data: parsed,
          screenshot_type: parsedScreenshotType,
          screenshot_type_source: responseSource,
          timings,
        },
        200,
        parsed.slot_status === "pending_confirm" ? "pending_confirm" : "success",
        user.id,
      );
    } catch (error) {
      const errorCode = getUnexpectedErrorCode(error);
      if (error instanceof OcrRunnerError) {
        timings.ocr_ms = error.ocrMs;
        logContext = {
          ...logContext,
          aiChannel: error.lastChannelName,
          aiModel: error.lastModel,
          fallbackDetail: error.attempts.length > 0 ? { attempts: error.attempts } : null,
        };
      }
      return await finish(
        {
          error: getOcrErrorMessage(errorCode),
          error_code: errorCode,
          timings,
        },
        500,
        errorCode === "AI_PARSE_FAILED" ? "parse_error" : "ai_error",
        user.id,
        errorCode,
      );
    }
  } catch {
    return await finish({ error: "图片为空、损坏或请求格式不正确" }, 400, "bad_request", user.id);
  }
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/ocr-screenshot", request, async (observation) =>
    buildOcrScreenshotResponse(request, defaultOcrScreenshotDeps, observation),
  );
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
  userId: string,
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
  path: string,
): Promise<{ dataUrl: string } | { error: string }> {
  try {
    if (bucket !== "submission-screenshots") return { error: "图片存储位置不受支持" };
    const downloaded = await downloadSubmissionScreenshotBytes(path);
    if (!downloaded.ok) return { error: downloaded.errors.join("; ") || "无法从存储读取图片" };
    const buffer = Buffer.from(downloaded.body);
    if (buffer.length > MAX_FILE_SIZE) {
      return { error: "图片不能超过 8MB" };
    }

    const detectedMimeType = detectImageMimeType(buffer);
    const declaredMimeType = downloaded.contentType || inferMimeTypeFromPath(path);
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

function resolveScreenshotType(imagePayload: ImagePayloadSuccess): ResolvedScreenshotType | null {
  return resolveKnownScreenshotType({
    screenshotType: imagePayload.screenshotType,
    assetRole: imagePayload.assetRole,
  });
}

function normalizeScreenshotType(value: unknown): ScreenshotType | null {
  return typeof value === "string" && SCREENSHOT_TYPES.includes(value as ScreenshotType)
    ? (value as ScreenshotType)
    : null;
}

function normalizeAssetRole(value: unknown): ScreenshotAssetRole | null {
  return value === "screenshot_1" || value === "screenshot_2" ? value : null;
}
