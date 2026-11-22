/**
 * Cloudflare Workers AI Clairic 客户端（@cf/cloudflare/clairic）。
 * 负责：显式凭据校验、SSRF 防护请求、4 MiB 解码字节压图兜底（长边 2048 / JPEG 90）、超时控制、错误分类与轻量探针。
 * 凭据严格由算力池调度层显式传入，不暗中读取 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN 环境变量。
 */

import sharp from "sharp";
import { describeChannelFailure, type ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import {
  classifyProviderFailure,
  sanitizeProviderErrorMessage,
  type ProviderFailureScope,
} from "@/lib/ai/provider-health";
import { resolveClairicEndpoint } from "@/lib/ai/provider-protocols";
import { withPinnedExternalResponse } from "@/lib/server-url-security";

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

export type ClairicCredentials = {
  baseUrl: string;
  apiKey: string;
  modelId?: string | null;
};

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

export type ClairicProbeInput = {
  baseUrl: string;
  apiKey: string;
  modelId?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  channelName?: string;
  channelLabel?: string;
};

export type ClairicProbeResult = {
  ok: boolean;
  latencyMs: number;
  model: typeof CLAIRIC_MODEL_ID;
  channelName: string;
  channelLabel: string;
  status?: number;
  errorScope?: ProviderFailureScope | null;
  message?: string;
  failureDiagnostic?: ChannelFailureDiagnostic | null;
};

const PROBE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAMUlEQVRIie3QMQ0AAAjAMPybBgm7+FoDSzb7bASKRcmiZFGyKFmULEoWJYuSRel90QGLVfSmL9cHVAAAAABJRU5ErkJggg==",
  "base64",
);

function resolveTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.max(10, Math.min(Math.round(override), 30_000));
  }
  const raw = process.env.CLAIRIC_OCR_TIMEOUT_MS;
  const envRaw = typeof raw === "string" && raw.trim() ? Number(raw.trim()) : NaN;
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

function extractSecrets(baseUrl: string, apiKey: string): string[] {
  const secrets = [apiKey];
  const accountMatch = baseUrl.match(/\/accounts\/([^/]+)/i);
  if (accountMatch?.[1]) {
    secrets.push(accountMatch[1]);
  }
  return secrets;
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
  credentials: ClairicCredentials,
  options: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ClairicCallResult> {
  const rawBaseUrl = typeof credentials?.baseUrl === "string" ? credentials.baseUrl.trim() : "";
  const apiKey = typeof credentials?.apiKey === "string" ? credentials.apiKey.trim() : "";
  if (!rawBaseUrl || !apiKey) {
    throw new ClairicOcrError("Cloudflare Clairic 渠道缺少接口地址或 API Token", "CONFIG");
  }
  const secrets = extractSecrets(rawBaseUrl, apiKey);

  let endpoint: string;
  try {
    endpoint = resolveClairicEndpoint(rawBaseUrl, credentials.modelId);
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    throw new ClairicOcrError(
      `Cloudflare Clairic 接口地址不合法：${sanitizeProviderErrorMessage(rawMsg, secrets)}`,
      "CONFIG",
    );
  }

  if (!input.buffer || input.buffer.length === 0) {
    throw new ClairicOcrError("图片内容为空", "INVALID_RESPONSE");
  }

  const prepared = await prepareClairicImage(input.buffer, input.contentType);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const requestBody = JSON.stringify({
    model: "clairic",
    state: "",
    images: [
      {
        content_type: prepared.contentType,
        base64: prepared.buffer.toString("base64"),
      },
    ],
    fields: input.fields,
  });
  const requestHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  let status = 0;
  let ok = false;
  let rawText = "";
  try {
    if (options.fetchImpl) {
      const response = await options.fetchImpl(endpoint, {
        method: "POST",
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal,
      });
      status = response.status;
      ok = response.ok;
      rawText = await response.text().catch(() => "");
    } else {
      const fetched = await withPinnedExternalResponse(
        endpoint,
        {
          method: "POST",
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal,
        },
        async (pinnedResponse) => ({
          status: pinnedResponse.status,
          ok: pinnedResponse.ok,
          rawText: await pinnedResponse.text().catch(() => ""),
        }),
      );
      status = fetched.status;
      ok = fetched.ok;
      rawText = fetched.rawText;
    }
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

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    if (status === 401 || status === 403) {
      throw new ClairicOcrError(
        `Cloudflare Clairic 鉴权失败（HTTP ${status}）`,
        "AUTH",
        status,
      );
    }
    if (status === 429) {
      throw new ClairicOcrError(
        "Cloudflare Clairic 请求过于频繁（HTTP 429）",
        "RATE_LIMITED",
        429,
      );
    }
    throw new ClairicOcrError(
      `Cloudflare Clairic 返回非 JSON 响应（HTTP ${status}）`,
      "INVALID_RESPONSE",
      status,
    );
  }

  if (status === 401 || status === 403) {
    throw new ClairicOcrError(
      `Cloudflare Clairic 鉴权失败（HTTP ${status}）`,
      "AUTH",
      status,
    );
  }
  if (status === 429) {
    throw new ClairicOcrError("Cloudflare Clairic 请求过于频繁（HTTP 429）", "RATE_LIMITED", 429);
  }
  if (!ok) {
    throw new ClairicOcrError(
      `Cloudflare Clairic 上游异常（HTTP ${status}）`,
      "UPSTREAM_ERROR",
      status,
    );
  }

  if (!isPlainObject(parsedJson)) {
    throw new ClairicOcrError("Cloudflare Clairic 响应根对象格式异常", "INVALID_RESPONSE", status);
  }

  if (parsedJson.success === false) {
    const errors = Array.isArray(parsedJson.errors) ? parsedJson.errors : [];
    const firstMsg = isPlainObject(errors[0]) && typeof errors[0].message === "string"
      ? sanitizeProviderErrorMessage(errors[0].message, secrets)
      : "";
    throw new ClairicOcrError(
      `Cloudflare Clairic 返回失败（HTTP ${status}${firstMsg ? `: ${firstMsg}` : ""}）`,
      "UPSTREAM_ERROR",
      status,
    );
  }

  const result = isPlainObject(parsedJson.result) ? parsedJson.result : parsedJson;
  if (!isPlainObject(result.answers)) {
    throw new ClairicOcrError(
      "Cloudflare Clairic 响应缺少 answers 字段",
      "INVALID_RESPONSE",
      status,
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

function formatProbeError(error: unknown, secrets: string[]): {
  message: string;
  status?: number;
  errorScope: ProviderFailureScope;
} {
  if (error instanceof ClairicOcrError) {
    const safeMessage = sanitizeProviderErrorMessage(error.message, secrets);
    switch (error.errorType) {
      case "CONFIG":
        return { message: safeMessage, errorScope: "unknown" };
      case "AUTH": {
        const status = error.status ?? 401;
        return {
          message: "Cloudflare Clairic 鉴权失败，请检查接口地址与 API Token",
          status,
          errorScope: classifyProviderFailure({ status, message: safeMessage }),
        };
      }
      case "TIMEOUT":
        return {
          message: "Cloudflare Clairic 探针请求超时（超过 5 秒）",
          errorScope: "model",
        };
      case "RATE_LIMITED":
        return {
          message: "Cloudflare Clairic 请求过于频繁，请稍后重试",
          status: error.status ?? 429,
          errorScope: "model",
        };
      case "INVALID_RESPONSE":
        return {
          message: "Cloudflare Clairic 返回格式异常",
          status: error.status,
          errorScope: "unknown",
        };
      case "UPSTREAM_ERROR":
        return {
          message: safeMessage,
          status: error.status,
          errorScope: classifyProviderFailure({
            status: error.status,
            errorType: error.status ? `http_${error.status}` : "network",
            message: safeMessage,
          }),
        };
    }
  }
  const msg = sanitizeProviderErrorMessage(
    error instanceof Error ? error.message : String(error),
    secrets,
  );
  return {
    message: msg || "Cloudflare Clairic 试跑失败",
    errorScope: classifyProviderFailure({ errorType: "network", message: msg }),
  };
}

/**
 * 轻量连通性探针：5 秒超时 + 内置最小 32x32 PNG 单字段探测，用于渠道接入探测、模型测试与后台试跑。
 */
export async function probeClairicOcr(
  input: ClairicProbeInput,
): Promise<ClairicProbeResult> {
  const startedAt = Date.now();
  const channelName = input.channelName?.trim() || CLAIRIC_CHANNEL_NAME;
  const channelLabel = input.channelLabel?.trim() || CLAIRIC_CHANNEL_LABEL;
  const secrets = extractSecrets(input.baseUrl ?? "", input.apiKey ?? "");
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
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        modelId: input.modelId ?? CLAIRIC_MODEL_ID,
      },
      {
        timeoutMs: input.timeoutMs ?? DEFAULT_CLAIRIC_TIMEOUT_MS,
        fetchImpl: input.fetchImpl,
      },
    );
    return {
      ok: true,
      latencyMs: result.latencyMs,
      model: CLAIRIC_MODEL_ID,
      channelName,
      channelLabel,
      status: 200,
      errorScope: null,
    };
  } catch (error) {
    const { message, status, errorScope } = formatProbeError(error, secrets);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model: CLAIRIC_MODEL_ID,
      channelName,
      channelLabel,
      status,
      errorScope,
      message,
      failureDiagnostic: describeChannelFailure({ message, status, secrets }),
    };
  }
}
