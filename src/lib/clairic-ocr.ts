/**
 * Cloudflare Workers AI Clairic 客户端（@cf/cloudflare/clairic）。
 * 负责：环境变量读取、4 MiB 解码字节压图兜底（长边 2048 / JPEG 90）、超时控制、错误分类与轻量探针。
 * 密钥仅从服务端环境变量 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN 读取，不硬编码、不打印。
 */

import sharp from "sharp";
import { describeChannelFailure, type ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { sanitizeProviderErrorMessage } from "@/lib/ai/provider-health";

export const CLAIRIC_MODEL_ID = "@cf/cloudflare/clairic";
export const CLAIRIC_CHANNEL_NAME = "cloudflare-clairic";
export const CLAIRIC_CHANNEL_LABEL = "Cloudflare Clairic";

export const CLAIRIC_DECODED_BYTE_LIMIT = 4 * 1024 * 1024;
/** 留 5% 安全余量，超过即压图到长边 2048px / JPEG 90，绝不低于 2048 */
export const CLAIRIC_COMPRESS_THRESHOLD_BYTES = Math.floor(3.8 * 1024 * 1024);
export const CLAIRIC_MAX_IMAGE_EDGE_PX = 2048;
export const CLAIRIC_JPEG_QUALITY = 90;
export const DEFAULT_CLAIRIC_TIMEOUT_MS = 5_000;

export type ClairicOcrErrorType =
  | "CONFIG"
  | "TIMEOUT"
  | "AUTH"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE";

export class ClairicOcrError extends Error {
  constructor(
    message: string,
    public readonly errorType: ClairicOcrErrorType,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ClairicOcrError";
  }
}

export type ClairicFieldSpec =
  | { type: "number"; integer?: boolean; decimals?: number; instructions: string }
  | { type: "text"; instructions: string };

export type ClairicAnswer = {
  value?: unknown;
  guess?: unknown;
  confidence?: number;
  p_null?: number;
};

export type ClairicUsage = {
  passes?: number;
  input_tokens?: number;
  [key: string]: unknown;
};

export type ClairicCallResult = {
  answers: Record<string, ClairicAnswer>;
  usage: ClairicUsage | null;
  latencyMs: number;
};

export type ClairicProbeResult = {
  ok: boolean;
  latencyMs: number;
  model: typeof CLAIRIC_MODEL_ID;
  channelName: typeof CLAIRIC_CHANNEL_NAME;
  channelLabel: typeof CLAIRIC_CHANNEL_LABEL;
  message?: string;
  failureDiagnostic?: ChannelFailureDiagnostic;
};

const PROBE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAMUlEQVRIie3QMQ0AAAjAMPybBgm7+FoDSzb7bASKRcmiZFGyKFmULEoWJYuSRel90QGLVfSmL9cHVAAAAABJRU5ErkJggg==",
  "base64",
);

function getEnvValue(name: string): string {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function requireClairicConfig(): { accountId: string; apiToken: string } {
  const accountId = getEnvValue("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = getEnvValue("CLOUDFLARE_API_TOKEN");
  if (!accountId || !apiToken) {
    throw new ClairicOcrError(
      "Cloudflare Clairic 未配置：缺少 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN 环境变量",
      "CONFIG",
    );
  }
  return { accountId, apiToken };
}

function resolveTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.max(10, Math.min(Math.round(override), 30_000));
  }
  const envRaw = Number(getEnvValue("CLAIRIC_OCR_TIMEOUT_MS"));
  if (Number.isFinite(envRaw) && envRaw > 0) {
    return Math.max(1_000, Math.min(Math.round(envRaw), 30_000));
  }
  return DEFAULT_CLAIRIC_TIMEOUT_MS;
}

function normalizeImageContentType(contentType: string): string {
  const lower = contentType.trim().toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  if (lower === "image/jpeg" || lower === "image/png" || lower === "image/webp") {
    return lower;
  }
  return "image/png";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 4 MiB 字节压图兜底：
 * 解码字节超过阈值时，用 sharp 缩至长边 2048px、JPEG quality 90（绝不低于 2048）；
 * 未超阈值保持原图字节与 MIME 直传，避免无谓重编码损失清晰度。
 */
export async function prepareClairicImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; compressed: boolean }> {
  const normalizedType = normalizeImageContentType(contentType);
  if (buffer.length <= CLAIRIC_COMPRESS_THRESHOLD_BYTES) {
    return { buffer, contentType: normalizedType, compressed: false };
  }

  try {
    const compressedBuffer = await sharp(buffer)
      .resize({
        width: CLAIRIC_MAX_IMAGE_EDGE_PX,
        height: CLAIRIC_MAX_IMAGE_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: CLAIRIC_JPEG_QUALITY })
      .toBuffer();

    return {
      buffer: compressedBuffer,
      contentType: "image/jpeg",
      compressed: true,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ClairicOcrError(`图片压缩处理失败：${detail}`, "UPSTREAM_ERROR");
  }
}

export function buildClairicEndpoint(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CLAIRIC_MODEL_ID}`;
}

export async function callClairicOcr(
  input: {
    buffer: Buffer;
    contentType: string;
    fields: Record<string, ClairicFieldSpec>;
  },
  options: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ClairicCallResult> {
  const { accountId, apiToken } = requireClairicConfig();
  if (!input.buffer || input.buffer.length === 0) {
    throw new ClairicOcrError("图片内容为空", "INVALID_RESPONSE");
  }

  const prepared = await prepareClairicImage(input.buffer, input.contentType);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = buildClairicEndpoint(accountId);
  const secrets = [apiToken, accountId];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "clairic",
        state: "",
        images: [
          {
            content_type: prepared.contentType,
            base64: prepared.buffer.toString("base64"),
          },
        ],
        fields: input.fields,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ClairicOcrError(`Cloudflare Clairic 请求超时（${timeoutMs}ms）`, "TIMEOUT");
    }
    const rawMsg = error instanceof Error ? error.message : String(error);
    const safeMsg = sanitizeProviderErrorMessage(rawMsg, secrets);
    throw new ClairicOcrError(`Cloudflare Clairic 网络请求失败：${safeMsg}`, "UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;
  const rawText = await response.text().catch(() => "");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new ClairicOcrError(
        `Cloudflare Clairic 鉴权失败（HTTP ${response.status}）`,
        "AUTH",
        response.status,
      );
    }
    if (response.status === 429) {
      throw new ClairicOcrError(
        "Cloudflare Clairic 请求过于频繁（HTTP 429）",
        "RATE_LIMITED",
        429,
      );
    }
    throw new ClairicOcrError(
      `Cloudflare Clairic 返回非 JSON 响应（HTTP ${response.status}）`,
      "INVALID_RESPONSE",
      response.status,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ClairicOcrError(
      `Cloudflare Clairic 鉴权失败（HTTP ${response.status}）`,
      "AUTH",
      response.status,
    );
  }
  if (response.status === 429) {
    throw new ClairicOcrError("Cloudflare Clairic 请求过于频繁（HTTP 429）", "RATE_LIMITED", 429);
  }
  if (!response.ok) {
    throw new ClairicOcrError(
      `Cloudflare Clairic 上游异常（HTTP ${response.status}）`,
      "UPSTREAM_ERROR",
      response.status,
    );
  }

  if (!isPlainObject(parsedJson)) {
    throw new ClairicOcrError("Cloudflare Clairic 响应根对象格式异常", "INVALID_RESPONSE", response.status);
  }

  if (parsedJson.success === false) {
    throw new ClairicOcrError(
      `Cloudflare Clairic 返回失败（HTTP ${response.status}）`,
      "UPSTREAM_ERROR",
      response.status,
    );
  }

  const result = isPlainObject(parsedJson.result) ? parsedJson.result : parsedJson;
  if (!isPlainObject(result.answers)) {
    throw new ClairicOcrError(
      "Cloudflare Clairic 响应缺少 answers 字段",
      "INVALID_RESPONSE",
      response.status,
    );
  }

  const answers: Record<string, ClairicAnswer> = {};
  for (const [key, val] of Object.entries(result.answers)) {
    if (isPlainObject(val)) {
      answers[key] = val as ClairicAnswer;
    }
  }

  const usage = isPlainObject(result.usage) ? (result.usage as ClairicUsage) : null;
  return { answers, usage, latencyMs };
}

function formatProbeErrorMessage(error: unknown): { message: string; status?: number } {
  if (error instanceof ClairicOcrError) {
    switch (error.errorType) {
      case "CONFIG":
        return { message: "未配置 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN 环境变量" };
      case "AUTH":
        return { message: "Cloudflare Clairic 鉴权失败，请检查账号 ID 与 API Token", status: error.status };
      case "TIMEOUT":
        return { message: "Cloudflare Clairic 探针请求超时（超过 5 秒）" };
      case "RATE_LIMITED":
        return { message: "Cloudflare Clairic 请求过于频繁，请稍后重试", status: error.status };
      case "INVALID_RESPONSE":
        return { message: "Cloudflare Clairic 返回格式异常", status: error.status };
      case "UPSTREAM_ERROR":
        return { message: error.message, status: error.status };
    }
  }
  const msg = error instanceof Error ? error.message : String(error);
  return { message: msg || "Cloudflare Clairic 试跑失败" };
}

/**
 * 轻量连通性探针：5 秒超时 + 内置最小 32x32 PNG 单字段探测，用于后台管理页「试跑」。
 */
export async function probeClairicOcr(
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ClairicProbeResult> {
  const startedAt = Date.now();
  try {
    const result = await callClairicOcr(
      {
        buffer: PROBE_PNG_BUFFER,
        contentType: "image/png",
        fields: {
          probe_text: {
            type: "text",
            instructions: "Read any visible text in the image, or return null if blank.",
          },
        },
      },
      {
        timeoutMs: options.timeoutMs ?? DEFAULT_CLAIRIC_TIMEOUT_MS,
        fetchImpl: options.fetchImpl,
      },
    );
    return {
      ok: true,
      latencyMs: result.latencyMs,
      model: CLAIRIC_MODEL_ID,
      channelName: CLAIRIC_CHANNEL_NAME,
      channelLabel: CLAIRIC_CHANNEL_LABEL,
    };
  } catch (error) {
    const { message, status } = formatProbeErrorMessage(error);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model: CLAIRIC_MODEL_ID,
      channelName: CLAIRIC_CHANNEL_NAME,
      channelLabel: CLAIRIC_CHANNEL_LABEL,
      message,
      failureDiagnostic: describeChannelFailure({ message, status }),
    };
  }
}
