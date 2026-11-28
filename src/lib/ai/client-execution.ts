import { toCanonicalModelId } from "@/lib/ai-config/canonical-model";
import { mapAiErrorKind,recordAiCallAttempt } from "@/lib/ai/call-attempt-recorder";
import {
getChannelFromEnv,
getFeatureConfig,
getProviderKeyModelChannel,
getServiceSupabaseClient,
isDbChannelModeEnabled,
resolveFeatureChannelChain,
type ChannelConfig
} from "@/lib/ai/client-routing";
import { resolveAiFeatureAccess } from "@/lib/ai/feature-catalog";
import { sanitizeProviderErrorMessage } from "@/lib/ai/provider-health";
import {
claimProviderRecovery,
getProviderKeyModelConfig,
releaseProviderRecovery,
} from "@/lib/ai/provider-routing";
import { randomUUID } from "node:crypto";
import { AiChannelError,MIN_CHANNEL_ATTEMPT_BUDGET_MS,resolveAttemptBudgetMs } from "./client-errors";
import { markChannelFailure,markChannelSuccess } from "./client-health";
import { DEFAULT_TIMEOUT_MS,resolveModel,sendToChannel } from "./client-transport";
import type { AiRequestOptions,AiResponse } from "./client-types";

export // 整条顺位链的总耗时上界：无论后台配了多少个渠道，单次调用都不会超过这个时间
const DEFAULT_TOTAL_TIMEOUT_MS = 30_000;

export async function runAi(options: AiRequestOptions, recordHealth: boolean): Promise<AiResponse> {
  const effectiveOptions: AiRequestOptions = {
    ...options,
    messages: [...options.messages],
  };
  const requestId = randomUUID();

  const configuredChannels: ChannelConfig[] = [];
  const pushChannelUnique = (channel: ChannelConfig | null) => {
    if (!channel) return;
    if (configuredChannels.some((existing) => existing.id && existing.id === channel.id)) return;
    configuredChannels.push(channel);
  };

  if (options.featureKey) {
    delete effectiveOptions.model;
    const access = resolveAiFeatureAccess(options.featureKey);
    if (!access.allowed) {
      throw new Error(access.reason);
    }

    const featureConfig = await getFeatureConfig(options.featureKey);
    if (featureConfig?.lifecycleState === "archived") {
      throw new Error("该 AI 功能已归档");
    }
    if (featureConfig && !featureConfig.isEnabled) {
      throw new Error("该 AI 功能已禁用");
    }

    {
      for (const channel of await resolveFeatureChannelChain(featureConfig ?? { featureKey: options.featureKey, modelId: null, systemPrompt: null, isEnabled: true, lifecycleState: "active" })) {
        pushChannelUnique(channel);
      }
    }

    if (configuredChannels.length === 0 && isDbChannelModeEnabled()) throw new Error("无可用模型");

    if (featureConfig?.systemPrompt) {
      effectiveOptions.messages = [
        { role: "system", content: featureConfig.systemPrompt },
        ...effectiveOptions.messages,
      ];
    }
  }

  const providerKeyModelId = !options.featureKey ? options.providerKeyModelId?.trim() : undefined;
  if (providerKeyModelId) {
    const providerChannel = await getProviderKeyModelChannel(providerKeyModelId);
    if (providerChannel) {
      const existingIndex = configuredChannels.findIndex((c) => c.id === providerChannel.id);
      if (existingIndex >= 0) {
        configuredChannels.unshift(...configuredChannels.splice(existingIndex, 1));
      } else {
        configuredChannels.unshift(providerChannel);
      }
    }
  }

  if (!isDbChannelModeEnabled()) {
    const envChannel = getChannelFromEnv();
    const channels = envChannel ? [envChannel] : [];
    if (channels.length === 0) {
      throw new Error("AI API 未配置（需设置 AI_BASE_URL 和 AI_API_KEY）");
    }
    return sendWithFailover(channels, effectiveOptions, recordHealth, sendToChannel, requestId, !recordHealth);
  }

  if (!options.databaseOnly && !options.featureKey) {
    pushChannelUnique(getChannelFromEnv());
  }

  if (configuredChannels.length === 0) {
    if (options.databaseOnly) {
      throw new Error("AI 渠道未配置，请先在后台完成 AI 渠道与功能配置");
    }
    throw new Error("AI API 未配置（需设置 AI_BASE_URL 和 AI_API_KEY，或在后台配置模型顺位）");
  }

  return sendWithFailover(configuredChannels, effectiveOptions, recordHealth, sendToChannel, requestId, !recordHealth);
}

export async function sendWithFailover(
  channels: ChannelConfig[],
  effectiveOptions: AiRequestOptions,
  recordHealth = true,
  send = sendToChannel,
  requestId = randomUUID(),
  isProbe = !recordHealth,
): Promise<AiResponse> {
  const perChannelTimeoutMs = effectiveOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const totalTimeoutMs = effectiveOptions.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const deadline = Date.now() + totalTimeoutMs;

  let lastRetryableError: Error | null = null;
  let attemptedChannels = 0;
  const failedProviderKeyIds = new Set<string>();

  for (const channel of channels) {
    // An earlier attempt can freeze this key; do not reuse a stale candidate later in the same chain.
    if (send === sendToChannel && channel.providerKeyModelId && channel.providerKeyId && failedProviderKeyIds.has(channel.providerKeyId)) {
      const service = getServiceSupabaseClient();
      if (!service || !await getProviderKeyModelConfig(service, channel.providerKeyModelId, { includeSleeping: Boolean(channel.cooldownUntil) })) continue;
    }
    const attemptBudgetMs = resolveAttemptBudgetMs(perChannelTimeoutMs, deadline - Date.now());
    if (attemptBudgetMs < MIN_CHANNEL_ATTEMPT_BUDGET_MS) break;

    let recoveryToken: string | null = null;
    const recoveryService = recordHealth && channel.requiresProbe && channel.providerKeyModelId && send === sendToChannel
      ? getServiceSupabaseClient() : null;
    if (recoveryService) {
      if (attemptBudgetMs < perChannelTimeoutMs) continue;
      try {
        recoveryToken = await claimProviderRecovery(recoveryService, channel.providerKeyModelId!, attemptBudgetMs, Boolean(channel.cooldownUntil));
      } catch (error) {
        console.warn("[ai-client] recovery lease unavailable", error);
      }
      if (!recoveryToken) continue;
    }
    attemptedChannels += 1;
    const attemptStartedAt = Date.now();
    const modelId = channel.canonicalModelId?.trim() || toCanonicalModelId(resolveModel(channel, effectiveOptions));
    try {
      const result = await send(channel, {
        ...effectiveOptions,
        timeoutMs: attemptBudgetMs,
      });
      if (recordHealth) await markChannelSuccess(channel);
      await recordAiCallAttempt({
        service: getServiceSupabaseClient(),
        requestId,
        attemptNo: attemptedChannels,
        featureKey: effectiveOptions.featureKey?.trim() || null,
        modelId,
        keyModelId: channel.providerKeyModelId ?? null,
        keyId: channel.providerKeyId ?? null,
        isSuccess: true,
        errorKind: null,
        errorMessage: null,
        durationMs: result.elapsedMs ?? Date.now() - attemptStartedAt,
        isProbe,
      });
      return result;
    } catch (error) {
      const aiError =
        error instanceof AiChannelError
          ? error
          : new AiChannelError(
              error instanceof Error ? error.message : "未知错误",
              "unknown",
              false,
            );

      aiError.message = sanitizeProviderErrorMessage(aiError.message, channels.map((candidate) => candidate.apiKey));
      await recordAiCallAttempt({
        service: getServiceSupabaseClient(),
        requestId,
        attemptNo: attemptedChannels,
        featureKey: effectiveOptions.featureKey?.trim() || null,
        modelId,
        keyModelId: channel.providerKeyModelId ?? null,
        keyId: channel.providerKeyId ?? null,
        isSuccess: false,
        errorKind: mapAiErrorKind(aiError.errorType, aiError.message),
        errorMessage: aiError.message,
        durationMs: Date.now() - attemptStartedAt,
        isProbe,
      });
      if (recordHealth) {
        await markChannelFailure(channel, aiError);
        if (channel.providerKeyId) failedProviderKeyIds.add(channel.providerKeyId);
      }

      if (!aiError.retryable && !/^http_(401|402|403|404|408|422)$/.test(aiError.errorType)) {
        aiError.message = `[${channel.name}] ${aiError.message}`;
        throw aiError;
      }

      lastRetryableError = aiError;
    } finally {
      if (recoveryService && recoveryToken) {
        try {
          await releaseProviderRecovery(recoveryService, channel.providerKeyModelId!, recoveryToken);
        } catch (error) {
          console.warn("[ai-client] recovery release skipped", error);
        }
      }
    }
  }

  const budgetNote =
    attemptedChannels === 0
      ? `（剩余时间不足，未发起调用；整链上限 ${Math.round(totalTimeoutMs / 1000)} 秒）`
      : attemptedChannels < channels.length
        ? `（已尝试 ${attemptedChannels}/${channels.length} 个渠道，整链上限 ${Math.round(totalTimeoutMs / 1000)} 秒）`
        : "";

  if (lastRetryableError) {
    throw new Error(`所有 AI 渠道不可用${budgetNote}（最后错误：${lastRetryableError.message}）`);
  }

  throw new Error(`所有 AI 渠道不可用${budgetNote}（无可用渠道）`);
}
