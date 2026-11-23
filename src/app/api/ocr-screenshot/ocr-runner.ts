import sharp from "sharp";
import { AiChannelError, MIN_CHANNEL_ATTEMPT_BUDGET_MS, resolveAttemptBudgetMs, sendToChannel, type AiMessage } from "@/lib/ai/client";
import { getFeatureConfig, getServiceSupabaseClient, resolveFeatureChannelChain, type ChannelConfig, type FeatureConfig } from "@/lib/ai/client-routing";
import { claimProviderRecovery, getProviderKeyModelConfig, releaseProviderRecovery } from "@/lib/ai/provider-routing";
import { recordProviderFailure, recordProviderSuccess } from "@/lib/ai/provider-health-recorder";
import { mapAiErrorKind, recordAiCallAttempt } from "@/lib/ai/call-attempt-recorder";
import { resolveAiFeatureAccess } from "@/lib/ai/feature-catalog";
import { sanitizeProviderErrorMessage } from "@/lib/ai/provider-health";
import { normalizeProviderProtocol, type AiProviderProtocol } from "@/lib/ai/provider-protocols";
import { CLAIRIC_MODEL_ID, ClairicOcrError, DEFAULT_CLAIRIC_TIMEOUT_MS, type ClairicUsage } from "@/lib/clairic-ocr";
import { toCanonicalModelId } from "@/lib/ai-config/canonical-model";
import { runClairicOcrAttempt } from "./clairic-channel";
import { hasJsonObject, parseOcrResponse, type OcrErrorCode, type ParsedScreenshotResponse, type ScreenshotType } from "./ocr-contract";
import type { OcrFallbackAttempt, OcrFallbackDetail } from "./ocr-log";
import { buildPromptByType } from "./ocr-prompts";

export const OCR_TOTAL_TIMEOUT_MS = 60_000;
export const CLAIRIC_ATTEMPT_TIMEOUT_MS = DEFAULT_CLAIRIC_TIMEOUT_MS;
export const VISION_ATTEMPT_TIMEOUT_MS = 15_000;
const MAX_VISION_IMAGE_DIMENSION = 2048;

export type OcrRunnerTimings = {
  download_ms?: number;
  ocr_ms?: number;
  clairic_ms?: number;
  parse_ms?: number;
  total_ms?: number;
};

export type OcrRunnerInput = {
  dataUrl: string;
  screenshotType: ScreenshotType;
  timings: OcrRunnerTimings;
  /** 接口入口（/api/ocr-screenshot）生成的请求编号；识别记录与 AI 调用记录都用它，不再自己另生成。 */
  requestId: string;
};

export type OcrRunnerSuccess = {
  parsed: ParsedScreenshotResponse;
  channelName: string;
  model: string | null;
  protocol: AiProviderProtocol;
  usage: ClairicUsage | null;
  ocrMs: number;
  fallbackDetail: OcrFallbackDetail;
};

export class OcrRunnerError extends Error {
  readonly errorCode: OcrErrorCode;
  readonly ocrMs: number;
  readonly attempts: OcrFallbackAttempt[];
  readonly lastChannelName: string | null;
  readonly lastModel: string | null;

  constructor(
    message: string,
    detail: {
      errorCode: OcrErrorCode;
      ocrMs: number;
      attempts: OcrFallbackAttempt[];
      lastChannelName: string | null;
      lastModel: string | null;
    },
  ) {
    super(message);
    this.name = "OcrRunnerError";
    this.errorCode = detail.errorCode;
    this.ocrMs = detail.ocrMs;
    this.attempts = detail.attempts;
    this.lastChannelName = detail.lastChannelName;
    this.lastModel = detail.lastModel;
  }
}

export type OcrRunnerDeps = {
  getFeatureConfig: typeof getFeatureConfig;
  resolveFeatureChannelChain: typeof resolveFeatureChannelChain;
  getServiceClient: typeof getServiceSupabaseClient;
  getProviderKeyModelConfig: typeof getProviderKeyModelConfig;
  claimProviderRecovery: typeof claimProviderRecovery;
  releaseProviderRecovery: typeof releaseProviderRecovery;
  recordProviderSuccess: typeof recordProviderSuccess;
  recordProviderFailure: typeof recordProviderFailure;
  recordAiCallAttempt: typeof recordAiCallAttempt;
  runClairicAttempt: typeof runClairicOcrAttempt;
  sendToChannel: typeof sendToChannel;
  normalizeVisionDataUrl: typeof normalizeVisionDataUrl;
  now: () => number;
};

const defaultRunnerDeps: OcrRunnerDeps = {
  getFeatureConfig,
  resolveFeatureChannelChain,
  getServiceClient: getServiceSupabaseClient,
  getProviderKeyModelConfig,
  claimProviderRecovery,
  releaseProviderRecovery,
  recordProviderSuccess,
  recordProviderFailure,
  recordAiCallAttempt,
  runClairicAttempt: runClairicOcrAttempt,
  sendToChannel,
  normalizeVisionDataUrl,
  now: () => Date.now(),
};

/**
 * 视觉代理对长边超过 2048px 的手机长截图会返回无效响应，统一在视觉调用边界压图；
 * Clairic 通道保留原图字节与 4 MiB 自适应策略。
 */
export async function normalizeVisionDataUrl(dataUrl: string): Promise<string> {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex <= 0) return dataUrl;
  const inputBuffer = Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
  if (inputBuffer.length === 0) return dataUrl;
  const metadata = await sharp(inputBuffer).metadata();
  if (Math.max(metadata.width ?? 0, metadata.height ?? 0) <= MAX_VISION_IMAGE_DIMENSION) {
    return dataUrl;
  }
  const outputBuffer = await sharp(inputBuffer)
    .resize({ width: MAX_VISION_IMAGE_DIMENSION, height: MAX_VISION_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
}

function collectChannelSecrets(channels: ChannelConfig[]): string[] {
  const secrets: string[] = [];
  for (const ch of channels) {
    if (ch.apiKey) secrets.push(ch.apiKey);
    const match = ch.baseUrl?.match(/\/accounts\/([^/]+)/i);
    if (match?.[1]) secrets.push(match[1]);
  }
  return secrets;
}

function classifyFailure(error: unknown, secrets: string[]): {
  ocrErrorCode: OcrErrorCode;
  healthErrorType: string;
  reason: string;
  safeMessage: string;
} {
  if (error instanceof ClairicOcrError) {
    const safeMessage = sanitizeProviderErrorMessage(error.message, secrets);
    switch (error.errorType) {
      case "TIMEOUT":
        return { ocrErrorCode: "AI_TIMEOUT", healthErrorType: "timeout", reason: "请求超时", safeMessage };
      case "RATE_LIMITED":
        return { ocrErrorCode: "RATE_LIMITED", healthErrorType: "http_429", reason: "限流429", safeMessage };
      case "AUTH":
        return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: `http_${error.status ?? 401}`, reason: "鉴权失败", safeMessage };
      case "CONFIG":
        return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: "config", reason: "配置无效", safeMessage };
      case "INVALID_RESPONSE":
        return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: "invalid_response", reason: "响应异常", safeMessage };
      case "UPSTREAM_ERROR":
        return {
          ocrErrorCode: "AI_CHANNEL_UNAVAILABLE",
          healthErrorType: error.status ? `http_${error.status}` : "network",
          reason: error.status ? `上游${error.status}` : "网络异常",
          safeMessage,
        };
    }
  }
  if (error instanceof AiChannelError) {
    const safeMessage = sanitizeProviderErrorMessage(error.message, secrets);
    if (error.errorType === "timeout" || error.errorType === "http_408") {
      return { ocrErrorCode: "AI_TIMEOUT", healthErrorType: error.errorType, reason: "请求超时", safeMessage };
    }
    if (error.errorType === "http_429") {
      return { ocrErrorCode: "RATE_LIMITED", healthErrorType: "http_429", reason: "限流429", safeMessage };
    }
    if (error.errorType === "empty_response" || error.errorType === "empty_stream") {
      return { ocrErrorCode: "AI_EMPTY_RESPONSE", healthErrorType: error.errorType, reason: "返回空响应", safeMessage };
    }
    if (error.errorType === "parse_failed") {
      return { ocrErrorCode: "AI_PARSE_FAILED", healthErrorType: "parse_failed", reason: "解析失败", safeMessage };
    }
    if (error.errorType === "http_401" || error.errorType === "http_403") {
      return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: error.errorType, reason: "鉴权失败", safeMessage };
    }
    if (error.errorType === "http_402") {
      return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: "http_402", reason: "额度不足", safeMessage };
    }
    if (error.errorType === "content_contract_violation") {
      return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: error.errorType, reason: "未按要求输出", safeMessage };
    }
    const statusMatch = /^http_(\d{3})$/.exec(error.errorType);
    return {
      ocrErrorCode: "AI_CHANNEL_UNAVAILABLE",
      healthErrorType: error.errorType,
      reason: statusMatch ? `上游${statusMatch[1]}` : "网络异常",
      safeMessage,
    };
  }

  const raw = error instanceof Error ? error.message : String(error);
  const safeMessage = sanitizeProviderErrorMessage(raw, secrets);
  if (/超时|timeout/i.test(safeMessage)) {
    return { ocrErrorCode: "AI_TIMEOUT", healthErrorType: "timeout", reason: "请求超时", safeMessage };
  }
  return { ocrErrorCode: "AI_CHANNEL_UNAVAILABLE", healthErrorType: "network", reason: "渠道异常", safeMessage };
}

export async function runScreenshotOcr(
  input: OcrRunnerInput,
  overrides: Partial<OcrRunnerDeps> = {},
): Promise<OcrRunnerSuccess> {
  const deps: OcrRunnerDeps = { ...defaultRunnerDeps, ...overrides };
  const access = resolveAiFeatureAccess("ocr_screenshot");
  if (!access.allowed) {
    throw new OcrRunnerError(access.reason ?? "当前不允许调用截图识别功能", {
      errorCode: "AI_CHANNEL_UNAVAILABLE",
      ocrMs: 0,
      attempts: [],
      lastChannelName: null,
      lastModel: null,
    });
  }

  const featureConfig: FeatureConfig = (await deps.getFeatureConfig("ocr_screenshot")) ?? {
    featureKey: "ocr_screenshot",
    providerKeyModelId: null,
    modelId: null,
    systemPrompt: null,
    isEnabled: true,
    lifecycleState: "active",
  };
  if (featureConfig.lifecycleState === "archived" || !featureConfig.isEnabled) {
    throw new OcrRunnerError(
      featureConfig.lifecycleState === "archived" ? "截图识别功能已归档" : "截图识别功能已禁用",
      { errorCode: "AI_CHANNEL_UNAVAILABLE", ocrMs: 0, attempts: [], lastChannelName: null, lastModel: null },
    );
  }

  const channels = await deps.resolveFeatureChannelChain(featureConfig);
  if (channels.length === 0) {
    throw new OcrRunnerError("无可用截图识别渠道", {
      errorCode: "AI_CHANNEL_UNAVAILABLE",
      ocrMs: 0,
      attempts: [],
      lastChannelName: null,
      lastModel: null,
    });
  }

  const requestId = input.requestId;
  const secrets = collectChannelSecrets(channels);
  const deadline = deps.now() + OCR_TOTAL_TIMEOUT_MS;
  const failedProviderKeyIds = new Set<string>();
  const attempts: OcrFallbackAttempt[] = [];
  let cachedVisionDataUrl: string | null = null;
  let totalOcrMs = 0;
  let lastErrorCode: OcrErrorCode = "AI_CHANNEL_UNAVAILABLE";
  let lastSafeMessage = "所有截图识别渠道不可用";
  let lastChannelName: string | null = null;
  let lastModel: string | null = null;

  for (const channel of channels) {
    const service = deps.getServiceClient();
    if (service && channel.providerKeyModelId && channel.providerKeyId && failedProviderKeyIds.has(channel.providerKeyId)) {
      const stillValid = await deps.getProviderKeyModelConfig(service, channel.providerKeyModelId, {
        includeSleeping: Boolean(channel.cooldownUntil),
      });
      if (!stillValid) continue;
    }

    const protocol = normalizeProviderProtocol(channel.protocol);
    const perChannelTimeoutMs = protocol === "cloudflare_clairic" ? CLAIRIC_ATTEMPT_TIMEOUT_MS : VISION_ATTEMPT_TIMEOUT_MS;
    const attemptBudgetMs = resolveAttemptBudgetMs(perChannelTimeoutMs, deadline - deps.now());
    if (attemptBudgetMs < MIN_CHANNEL_ATTEMPT_BUDGET_MS) break;

    let recoveryToken: string | null = null;
    const recoveryService = service && channel.requiresProbe && channel.providerKeyModelId ? service : null;
    if (recoveryService) {
      if (attemptBudgetMs < perChannelTimeoutMs) continue;
      try {
        recoveryToken = await deps.claimProviderRecovery(
          recoveryService,
          channel.providerKeyModelId!,
          attemptBudgetMs,
          Boolean(channel.cooldownUntil),
        );
      } catch (error) {
        console.warn("[ocr-runner] recovery lease unavailable", error);
      }
      if (!recoveryToken) continue;
    }

    const channelDisplayName = channel.providerKeyLabel?.trim() || channel.name;
    const configuredModel = channel.model?.trim() || (protocol === "cloudflare_clairic" ? CLAIRIC_MODEL_ID : null);
    const canonicalModelId = channel.canonicalModelId?.trim() || toCanonicalModelId(configuredModel ?? "unknown");
    const attemptStartedAt = deps.now();

    try {
      let parsed: ParsedScreenshotResponse | null = null;
      let resolvedModel = configuredModel;
      let usage: ClairicUsage | null = null;

      if (protocol === "cloudflare_clairic") {
        const res = await deps.runClairicAttempt({
          dataUrl: input.dataUrl,
          screenshotType: input.screenshotType,
          credentials: { baseUrl: channel.baseUrl, apiKey: channel.apiKey, modelId: channel.model },
          timeoutMs: attemptBudgetMs,
          channelName: channelDisplayName,
          timings: input.timings,
        });
        parsed = res.parsed;
        resolvedModel = res.model;
        usage = res.usage;
      } else {
        if (!cachedVisionDataUrl) {
          cachedVisionDataUrl = await deps.normalizeVisionDataUrl(input.dataUrl);
        }
        const messages: AiMessage[] = [
          ...(featureConfig.systemPrompt ? [{ role: "system" as const, content: featureConfig.systemPrompt }] : []),
          {
            role: "user",
            content: [
              { type: "text", text: buildPromptByType(input.screenshotType) },
              { type: "image_url", image_url: { url: cachedVisionDataUrl } },
            ],
          },
        ];
        const aiResult = await deps.sendToChannel(channel, {
          messages,
          maxTokens: 1000,
          jsonMode: true,
          timeoutMs: attemptBudgetMs,
          databaseOnly: true,
          featureKey: "ocr_screenshot",
          validateContent: hasJsonObject,
        });
        resolvedModel = aiResult.model || configuredModel;
        const parseStart = deps.now();
        parsed = parseOcrResponse(aiResult.content, input.screenshotType);
        input.timings.parse_ms = (input.timings.parse_ms ?? 0) + Math.max(0, deps.now() - parseStart);
        if (!parsed) {
          throw new AiChannelError("AI 返回格式无法识别", "parse_failed", true);
        }
      }

      const elapsedMs = Math.max(0, deps.now() - attemptStartedAt);
      totalOcrMs += elapsedMs;
      input.timings.ocr_ms = totalOcrMs;
      attempts.push({
        channel_name: channelDisplayName,
        model_id: resolvedModel,
        protocol,
        ok: true,
        elapsed_ms: elapsedMs,
      });

      if (service && channel.source === "provider_key_model" && channel.providerKeyId) {
        await deps.recordProviderSuccess({
          service,
          providerKeyId: channel.providerKeyId,
          providerKeyModelId: channel.providerKeyModelId,
        }).catch((err) => console.warn("[ocr-runner] provider success marker skipped", err));
      }
      await deps.recordAiCallAttempt({
        service,
        requestId,
        attemptNo: attempts.length,
        featureKey: "ocr_screenshot",
        modelId: canonicalModelId,
        keyModelId: channel.providerKeyModelId ?? null,
        keyId: channel.providerKeyId ?? null,
        isSuccess: true,
        errorKind: null,
        errorMessage: null,
        durationMs: elapsedMs,
        isProbe: false,
      });

      return {
        parsed,
        channelName: channelDisplayName,
        model: resolvedModel,
        protocol,
        usage,
        ocrMs: totalOcrMs,
        fallbackDetail: { attempts },
      };
    } catch (error) {
      const elapsedMs = Math.max(0, deps.now() - attemptStartedAt);
      totalOcrMs += elapsedMs;
      input.timings.ocr_ms = totalOcrMs;
      const classified = classifyFailure(error, secrets);
      lastErrorCode = classified.ocrErrorCode;
      lastSafeMessage = classified.safeMessage;
      lastChannelName = channelDisplayName;
      lastModel = configuredModel;

      attempts.push({
        channel_name: channelDisplayName,
        model_id: configuredModel,
        protocol,
        ok: false,
        elapsed_ms: elapsedMs,
        error_code: classified.ocrErrorCode,
        reason: classified.reason,
      });

      await deps.recordAiCallAttempt({
        service,
        requestId,
        attemptNo: attempts.length,
        featureKey: "ocr_screenshot",
        modelId: canonicalModelId,
        keyModelId: channel.providerKeyModelId ?? null,
        keyId: channel.providerKeyId ?? null,
        isSuccess: false,
        errorKind: mapAiErrorKind(classified.healthErrorType, classified.safeMessage),
        errorMessage: classified.safeMessage,
        durationMs: elapsedMs,
        isProbe: false,
      });

      if (service && channel.source === "provider_key_model" && channel.providerKeyId) {
        await deps.recordProviderFailure({
          service,
          providerKeyId: channel.providerKeyId,
          providerKeyModelId: channel.providerKeyModelId,
          errorType: classified.healthErrorType,
          message: classified.safeMessage,
        }).catch((err) => console.warn("[ocr-runner] provider failure marker skipped", err));
        failedProviderKeyIds.add(channel.providerKeyId);
      }
    } finally {
      if (recoveryService && recoveryToken) {
        await deps.releaseProviderRecovery(recoveryService, channel.providerKeyModelId!, recoveryToken).catch((err) =>
          console.warn("[ocr-runner] recovery release skipped", err),
        );
      }
    }
  }

  throw new OcrRunnerError(lastSafeMessage, {
    errorCode: lastErrorCode,
    ocrMs: totalOcrMs,
    attempts,
    lastChannelName,
    lastModel,
  });
}
