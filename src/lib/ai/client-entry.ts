import {
getChannelFromEnv,
getEnvFlag,
getFeatureConfig,
getServiceSupabaseClient,
isDbChannelModeEnabled,
resetFeatureCache,
resolveFeatureChannelChain,
setServiceClientForTests
} from "@/lib/ai/client-routing";
import { assertContentContract,isNonRetryableProviderError,isRetryableStatus } from "./client-errors";
import { runAi,sendWithFailover } from "./client-execution";
import { markChannelSuccess } from "./client-health";
import { describeMissingResponseContent,normalizeResponseContent,parseChatCompletionSse,resolveModel,sendToChannel } from "./client-transport";
import type { AiRequestOptions,AiResponse } from "./client-types";

export async function callAi(options: AiRequestOptions): Promise<AiResponse> {
  return runAi(options, true);
}

/** 后台试跑复用正式调用链；探测不改动业务调度使用的健康计数。 */
export async function probeAiFeature(
  featureKey: string,
  options: Omit<AiRequestOptions, "featureKey" | "providerKeyModelId">,
): Promise<AiResponse> {
  return runAi({ ...options, featureKey, databaseOnly: true }, false);
}

export async function callAiJson(prompt: string, opts?: Omit<AiRequestOptions, "messages">): Promise<AiResponse> {
  return callAi({ messages: [{ role: "user", content: prompt }], ...opts, jsonMode: true });
}

export async function callAiText(prompt: string, opts?: Omit<AiRequestOptions, "messages">): Promise<AiResponse> {
  return callAi({ messages: [{ role: "user", content: prompt }], ...opts, jsonMode: false });
}

export function extractJsonString(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      return candidate;
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

export const __internal = {
  sendWithFailoverForTests: sendWithFailover,
  sendToChannelForTests: sendToChannel,
  getEnvFlag,
  getChannelFromEnv,
  isDbChannelModeEnabled,
  isRetryableStatus,
  isNonRetryableProviderError,
  resolveModel,
  normalizeResponseContent,
  describeMissingResponseContent,
  assertContentContract,
  markChannelSuccessForTests: markChannelSuccess,
  getFeatureConfigForTests: getFeatureConfig,
  resolveFeatureChannelChainForTests: resolveFeatureChannelChain,
  parseChatCompletionSse,
  getServiceClient: getServiceSupabaseClient,
  setServiceClientForTests,
  resetCache: resetFeatureCache,
};
