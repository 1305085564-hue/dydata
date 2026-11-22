import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { AiChannelError, callAi, type AiMessage } from "@/lib/ai/client";
import { validateOcrStorageReference } from "./input";
import { detectImageMimeType, hasMatchingImageSignature } from "@/lib/file-signatures";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import type { MutationObservation } from "@/lib/observed-mutation-result";
import { runBaiduOcrAttempt, mapBaiduErrorToOcrCode } from "./baidu-channel";
import { runClairicAttemptWithBaiduFallback, runClairicOcrAttempt, type ClairicOrFallbackResult } from "./clairic-channel";
import type { ClairicUsage } from "@/lib/clairic-ocr";
import { fetchOcrChannelSettingsRow, resolveOcrScreenshotChannel, type OcrScreenshotChannel } from "./channel-config";
import { downloadSubmissionScreenshotBytes } from "@/lib/screenshot-storage";
import { recordOcrRecognitionLog } from "./ocr-log";
import { buildPromptByType } from "./ocr-prompts";
import { hasJsonObject, parseOcrResponse, resolveKnownScreenshotType, type OcrErrorCode, type ParsedScreenshotResponse, type ScreenshotAssetRole, type ScreenshotType } from "./ocr-contract";

// 输出契约与解析函数已抽到 ocr-contract.ts，这里统一再导出保持既有导入路径兼容
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

export type { OcrScreenshotChannel };

type OcrScreenshotDeps = {
  createClient: typeof createClient;
  ocrChannelFetcher: typeof fetchOcrChannelSettingsRow;
  callAi: typeof callAi; recordLog: typeof recordOcrRecognitionLog;
  runClairicAttempt?: typeof runClairicOcrAttempt;
  runBaiduAttempt?: typeof runBaiduOcrAttempt;
};

export const defaultOcrScreenshotDeps: OcrScreenshotDeps = {
  createClient,
  ocrChannelFetcher: fetchOcrChannelSettingsRow,
  callAi, recordLog: recordOcrRecognitionLog,
};

// Vercel 函数执行上限：识别走共享渠道，实测偶发 20 秒以上，函数上限声明 60 秒
// （不声明则用平台默认值，可能先于下面 45 秒识别超时把请求掐断）
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

type OcrTimings = {
  download_ms?: number;
  ocr_ms?: number;
  clairic_ms?: number;
  baidu_ms?: number;
  structure_ms?: number;
  parse_ms?: number;
  total_ms: number;
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_VISION_IMAGE_DIMENSION = 2048;
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

export async function runVisionOcrAttempt(
  dataUrl: string,
  screenshotType: ScreenshotType,
  timings: Partial<OcrTimings>,
  callAiImpl: typeof callAi,
): Promise<OcrAttempt> {
  const visionDataUrl = await normalizeVisionDataUrl(dataUrl);
  const messages: AiMessage[] = [{
    role: "user",
    content: [
      { type: "text", text: buildPromptByType(screenshotType) },
      { type: "image_url", image_url: { url: visionDataUrl } },
    ],
  }];

  const ocrStart = Date.now();
  const aiResult = await callAiImpl({
    messages,
    maxTokens: 1000,
    jsonMode: true,
    // 单条 15 秒、整次 60 秒：主模型最多试 2 条（共 30 秒），至少留 30 秒给全局兜底模型。
    // 上游快失败（404/503）本来就秒切，只有完全无响应时才会等满 15 秒。
    timeoutMs: 15_000,
    totalTimeoutMs: 60_000,
    featureKey: "ocr_screenshot",
    databaseOnly: true,
    // 看图渠道里存在「收下请求但不看图」的坏渠道（回一段文字说明），
    // 这类正文必须判为渠道失败并顺位下一个渠道，不能直接报「格式无法识别」
    validateContent: hasJsonObject,
  });
  timings.ocr_ms = (timings.ocr_ms ?? 0) + Date.now() - ocrStart;

  const parseStart = Date.now();
  const parsed = parseOcrResponse(aiResult.content, screenshotType);
  timings.parse_ms = (timings.parse_ms ?? 0) + Date.now() - parseStart;

  return { parsed, channelName: aiResult.channelName ?? "vision", model: aiResult.model };
}

/**
 * API9 的 Gemini 视觉代理对长边超过 2048 的手机长截图会返回 200，
 * 但把图片当成无效数据交给模型。统一在视觉调用边界压缩超长图片，
 * 保留原图存储与百度通道输入，避免上传和其他 OCR 行为发生变化。
 */
export async function normalizeVisionDataUrl(dataUrl: string): Promise<string> {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex <= 0) return dataUrl;

  const inputBuffer = Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
  if (inputBuffer.length === 0) return dataUrl;

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (Math.max(width, height) <= MAX_VISION_IMAGE_DIMENSION) {
    return dataUrl;
  }

  const outputBuffer = await sharp(inputBuffer)
    .resize({
      width: MAX_VISION_IMAGE_DIMENSION,
      height: MAX_VISION_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
}

type OcrAttempt = {
  parsed: ParsedScreenshotResponse | null;
  channelName: string;
  model: string | null;
};

export async function buildOcrScreenshotResponse(
  request: NextRequest,
  deps: OcrScreenshotDeps = defaultOcrScreenshotDeps,
  observation: MutationObservation,
) {
  const startTime = Date.now();
  const supabase = await deps.createClient();
  const timings: Partial<OcrTimings> = {};
  let logContext: {
    assetRole?: ScreenshotAssetRole | null;
    screenshotType?: ScreenshotType | null;
    screenshotTypeSource?: ScreenshotTypeSource | null;
    ocrChannel?: OcrScreenshotChannel | null;
    aiChannel?: string | null;
    aiModel?: string | null;
    channelFallback?: { from: "clairic"; to: "baidu"; reason: string } | null;
    clairicUsage?: ClairicUsage | null;
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
      channel: logContext.ocrChannel ?? null,
      ai_channel: logContext.aiChannel ?? null,
      ai_model: logContext.aiModel ?? null,
      ...(logContext.channelFallback ? { channel_fallback: logContext.channelFallback } : {}),
      ...(logContext.clairicUsage ? { clairic_usage: logContext.clairicUsage } : {}),
    });

    // 测速台账只记真正进入识别的请求（渠道已解析），401/输入错误不落账；await 插入保证 Vercel 冻结前落库，异常吞并不影响业务回执
    if (logContext.ocrChannel) {
      try {
        await deps.recordLog({
          totalMs: timings.total_ms, ocrMs: timings.ocr_ms ?? (logContext.channelFallback ? timings.baidu_ms : timings.clairic_ms) ?? timings.baidu_ms ?? timings.clairic_ms ?? null,
          downloadMs: timings.download_ms ?? null, channelName: logContext.aiChannel ?? null,
          modelId: logContext.aiModel ?? null, screenshotType: logContext.screenshotType ?? null,
          isSuccess: businessSucceeded, errorCode: errorCode ?? null, userId: userId ?? null,
        });
      } catch {}
    }

    return appendObservedMutationResult(NextResponse.json({ request_id: observation.requestId, ...body, businessSucceeded }, { status }), observation);
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
      // 类型只由调用方的槽位决定，服务端不再按内容猜；没给类型就是调用方的错，不进识别、不落测速台账
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
      screenshotType,
      screenshotTypeSource: resolvedScreenshotType.source,
    };

    const ocrChannel = await resolveOcrScreenshotChannel(deps.ocrChannelFetcher);
    logContext = { ...logContext, ocrChannel };

    try {
      observation.mark("read");
      let parsed: ParsedScreenshotResponse | null;
      if (ocrChannel === "clairic") {
        const clairicResult: ClairicOrFallbackResult = await runClairicAttemptWithBaiduFallback(
          { dataUrl, screenshotType, timings },
          { runClairicAttempt: deps.runClairicAttempt, runBaiduAttempt: deps.runBaiduAttempt },
        );
        parsed = clairicResult.parsed;
        logContext = {
          ...logContext,
          aiChannel: clairicResult.channelName,
          aiModel: clairicResult.model,
          channelFallback: clairicResult.fallback,
          clairicUsage: clairicResult.clairicUsage,
        };
      } else {
        const attempt =
          ocrChannel === "baidu"
            ? await (deps.runBaiduAttempt ?? runBaiduOcrAttempt)({ dataUrl, screenshotType, timings })
            : await runVisionOcrAttempt(dataUrl, screenshotType, timings, deps.callAi);
        parsed = attempt.parsed;
        logContext = {
          ...logContext,
          aiChannel: attempt.channelName,
          aiModel: attempt.model,
        };
      }

      if (!parsed) {
        const errorCode: OcrErrorCode = "AI_PARSE_FAILED";
        return await finish(
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
      const errorCode = mapBaiduErrorToOcrCode(error) ?? getAiErrorCode(error);
      return await finish(
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
