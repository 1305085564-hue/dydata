/**
 * 统一 AI 客户端
 * 支持环境变量单渠道模式，以及数据库多渠道 failover + 熔断
 */

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_AI_MODEL } from "./constants";
import {
  bumpProviderKeyFailure,
  getProviderKeyModelConfig,
  listRankedProviderKeyModels,
  markProviderKeySuccess,
  type ProviderKeyModelConfig,
} from "./provider-routing";
import { resolveAiFeatureAccess } from "./feature-catalog";
import { withPinnedExternalResponse } from "@/lib/server-url-security";

type TextContent = string;
type MultimodalBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type MessageContent = TextContent | MultimodalBlock[];

export type AiMessage = {
  role: "user" | "system" | "assistant";
  content: MessageContent;
};

export type AiRequestOptions = {
  onChunk?: (text: string) => void;
  messages: AiMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  model?: string;
  providerKeyModelId?: string;
  featureKey?: string;
  databaseOnly?: boolean;
};

export type AiResponse = {
  content: string;
  model: string;
  channelName: string;
  channelId?: string | null;
  providerKeyModelId?: string | null;
  providerKeyId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  elapsedMs: number;
};

type ChannelConfig = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string | null;
  priority?: number;
  providerKeyModelId?: string | null;
  providerKeyId?: string | null;
  source: "env" | "provider_key_model";
};

type FeatureConfig = {
  featureKey: string;
  providerKeyModelId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  isEnabled: boolean;
  lifecycleState: "active" | "archived";
};

type AiFeatureBindingRow = {
  feature_key: string;
  provider_key_model_id: string | null;
  model_id?: string | null;
  system_prompt: string | null;
  is_enabled: boolean;
  lifecycle_state?: "active" | "archived" | null;
};

type UpstreamResponseBody = {
  choices?: Array<{
    message?: {
      content?: unknown;
      text?: unknown;
      reasoning_content?: unknown;
      refusal?: unknown;
    };
    delta?: {
      content?: unknown;
      reasoning_content?: unknown;
      refusal?: unknown;
    };
    finish_reason?: unknown;
    native_finish_reason?: unknown;
  }>;
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
};

type StreamedChatCompletionResult = {
  content: string;
  reasoningContent: string;
  model: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  rawSnippet: string;
  diagnosticBody: UpstreamResponseBody;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MODEL = DEFAULT_AI_MODEL;
const CHANNEL_CACHE_TTL_MS = 60_000;

let cachedFeatureConfigs: { expiresAt: number; configs: Map<string, FeatureConfig> } | null = null;

function getEnvFlag(name: string) {
  return process.env[name]?.trim().toLowerCase();
}

function isDbChannelModeEnabled() {
  return getEnvFlag("AI_CHANNELS_ENABLED") !== "false";
}

function getChannelFromEnv(): ChannelConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;

  return {
    name: "env-default",
    baseUrl,
    apiKey,
    model: process.env.AI_MODEL?.trim() || null,
    source: "env",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _serviceClient: any = null;

function getServiceSupabaseClient() {
  if (_serviceClient) return _serviceClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  _serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _serviceClient;
}

function mapFeatureBinding(row: AiFeatureBindingRow): FeatureConfig {
  return {
    featureKey: row.feature_key,
    providerKeyModelId: row.provider_key_model_id,
    modelId: row.model_id ?? null,
    systemPrompt: row.system_prompt,
    isEnabled: row.is_enabled,
    lifecycleState: row.lifecycle_state === "archived" ? "archived" : "active",
  };
}

async function getFeatureConfig(featureKey: string): Promise<FeatureConfig | null> {
  const now = Date.now();
  if (cachedFeatureConfigs && cachedFeatureConfigs.expiresAt > now) {
    return cachedFeatureConfigs.configs.get(featureKey) ?? null;
  }

  const supabase = getServiceSupabaseClient();
  if (!supabase) {
    cachedFeatureConfigs = {
      expiresAt: now + CHANNEL_CACHE_TTL_MS,
      configs: new Map(),
    };
    return null;
  }

  // 优先读取 model_id（模型为主改造）；生产库尚未执行加列 migration 时降级为旧字段
  let result = await supabase
    .from("ai_feature_bindings")
    .select("feature_key, provider_key_model_id, model_id, system_prompt, is_enabled, lifecycle_state");
  if (result.error) {
    result = await supabase
      .from("ai_feature_bindings")
      .select("feature_key, provider_key_model_id, system_prompt, is_enabled, lifecycle_state");
  }
  const { data: bindingData, error: bindingError } = result;

  const configs = new Map<string, FeatureConfig>();
  if (!bindingError && bindingData?.length) {
    for (const row of bindingData as AiFeatureBindingRow[]) {
      const config = mapFeatureBinding(row);
      configs.set(config.featureKey, config);
    }
  }

  cachedFeatureConfigs = {
    expiresAt: now + CHANNEL_CACHE_TTL_MS,
    configs,
  };

  return configs.get(featureKey) ?? null;
}

/** 把顺位候选转成调用渠道 */
function rankedCandidatesToChannels(
  candidates: Array<{ providerKeyModelId: string; config: ProviderKeyModelConfig }>,
): ChannelConfig[] {
  return candidates.map((candidate) => ({
    id: candidate.config.providerKeyModelId,
    name: candidate.config.providerName,
    baseUrl: candidate.config.baseUrl,
    apiKey: candidate.config.apiKey,
    model: candidate.config.modelId,
    providerKeyModelId: candidate.config.providerKeyModelId,
    providerKeyId: candidate.config.providerKeyId,
    source: "provider_key_model" as const,
  }));
}

/** 场景路由解析调用链（模型为主，渠道为辅）：
 * 1) 场景指定了模型 → 该模型在所有渠道上的部署按 Key/供应商优先级排成顺位，同模型跨渠道自动切换；
 *    model_id 为空时兼容从旧组合绑定推导出模型
 * 2) 场景未指定 → 走「全局默认」（feature_key=default，最低优先级）的模型，同样跨渠道顺位
 * 3) 指定/默认模型全部不健康或不存在 → 全量顺位最后兜底 */
async function resolveFeatureChannelChain(
  featureConfig: FeatureConfig,
): Promise<ChannelConfig[]> {
  const supabase = getServiceSupabaseClient();
  if (!supabase) return [];

  let modelId = featureConfig.modelId?.trim() || null;
  if (!modelId && featureConfig.providerKeyModelId) {
    const pinnedConfig = await getProviderKeyModelConfig(supabase, featureConfig.providerKeyModelId);
    modelId = pinnedConfig?.modelId ?? null;
  }
  if (!modelId) {
    const fallback = await getFeatureConfig("default");
    modelId = fallback?.modelId?.trim() || null;
  }

  if (modelId) {
    const forModel = await listRankedProviderKeyModels(supabase, modelId);
    if (forModel.length > 0) {
      return rankedCandidatesToChannels(forModel);
    }
  }

  const allRanked = await listRankedProviderKeyModels(supabase, undefined);
  return rankedCandidatesToChannels(allRanked);
}

async function getProviderKeyModelChannel(providerKeyModelId: string): Promise<ChannelConfig | null> {
  const supabase = getServiceSupabaseClient();
  if (!supabase) return null;

  const config = await getProviderKeyModelConfig(supabase, providerKeyModelId);
  if (!config) return null;

  return {
    id: config.providerKeyModelId,
    name: config.providerName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.modelId,
    providerKeyModelId: config.providerKeyModelId,
    providerKeyId: config.providerKeyId,
    source: "provider_key_model",
  };
}

function normalizeResponseContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const record = item as { type?: unknown; text?: unknown; value?: unknown };
        if ((record.type === "text" || record.type === "output_text") && typeof record.text === "string") {
          return record.text.trim();
        }
        if (typeof record.value === "string") {
          return record.value.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return text || null;
  }
  return null;
}

function normalizeStreamDeltaText(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return normalizeResponseContent(content);
  }
  return null;
}

function describeMissingResponseContent(data: UpstreamResponseBody): string {
  const choice = data.choices?.[0];
  const message = choice?.message ?? choice?.delta;
  const details: string[] = [];

  if (choice?.finish_reason != null) {
    details.push(`finish_reason=${String(choice.finish_reason)}`);
  }
  if (choice?.native_finish_reason != null) {
    details.push(`native_finish_reason=${String(choice.native_finish_reason)}`);
  }

  if (message && typeof message === "object") {
    const keys = Object.keys(message);
    if (keys.length) {
      details.push(`message_keys=${keys.join(",")}`);
    }
    if ("content" in message) {
      details.push(`content_type=${message.content === null ? "null" : Array.isArray(message.content) ? "array" : typeof message.content}`);
    }
    if (typeof message.refusal === "string" && message.refusal.trim()) {
      details.push(`refusal=${message.refusal.trim().slice(0, 80)}`);
    }
    if (typeof message.reasoning_content === "string" && message.reasoning_content.trim()) {
      details.push("has_reasoning_content=true");
    }
  }

  const suffix = details.length ? `（${details.join("，")}）` : "";

  // content=null + finish_reason=stop 通常意味着模型不支持该请求类型（如不支持 vision）
  const contentIsNull =
    message && "content" in message && message.content === null;
  const finishedNormally =
    choice?.finish_reason === "stop" || choice?.finish_reason === "end_turn";
  if (contentIsNull && finishedNormally) {
    return `AI 返回空正文（200 + content=null），可能该渠道模型不支持图片/多模态输入${suffix}`;
  }

  return `AI 未返回有效内容${suffix}`;
}

export function buildUpstreamUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function resolveModel(channel: ChannelConfig, options: AiRequestOptions) {
  if (options.model?.trim()) {
    return options.model.trim();
  }
  if (channel.model?.trim()) {
    return channel.model.trim();
  }
  if (options.databaseOnly) {
    return DEFAULT_MODEL;
  }
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

function buildRequestBody(options: AiRequestOptions, model: string) {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  return body;
}

async function parseChatCompletionSse(response: Response, options?: AiRequestOptions): Promise<StreamedChatCompletionResult> {
  if (!response.body) {
    throw new AiChannelError("AI 返回空响应流", "empty_stream", true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningContent = "";
  let upstreamModel: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  let lastChunk: UpstreamResponseBody | null = null;
  const rawParts: string[] = [];

  const processEvent = (eventText: string) => {
    const trimmed = eventText.trim();
    if (!trimmed) return;

    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    if (!dataLines.length) return;

    const payload = dataLines.join("\n");
    if (!payload || payload === "[DONE]") return;

    if (rawParts.length < 5) {
      rawParts.push(payload);
    }

    let chunk: UpstreamResponseBody;
    try {
      chunk = JSON.parse(payload) as UpstreamResponseBody;
    } catch {
      throw new AiChannelError(`AI 返回非 JSON：${payload.slice(0, 300)}`, "invalid_json", false);
    }

    lastChunk = chunk;
    if (typeof chunk.model === "string" && chunk.model.trim()) {
      upstreamModel = chunk.model.trim();
    }
    if (chunk.usage) {
      promptTokens = typeof chunk.usage.prompt_tokens === "number" ? chunk.usage.prompt_tokens : promptTokens;
      completionTokens = typeof chunk.usage.completion_tokens === "number" ? chunk.usage.completion_tokens : completionTokens;
      totalTokens = typeof chunk.usage.total_tokens === "number" ? chunk.usage.total_tokens : totalTokens;
    }

    const delta = chunk.choices?.[0]?.delta;
    const chunkContent = normalizeStreamDeltaText(delta?.content);
    if (chunkContent) {
      content += chunkContent;
      options?.onChunk?.(chunkContent);
    }
    const chunkReasoning = normalizeStreamDeltaText(delta?.reasoning_content);
    if (chunkReasoning) {
      reasoningContent += chunkReasoning;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const eventText = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      processEvent(eventText);
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  const rest = buffer.trim();
  if (rest) {
    processEvent(rest);
  }

  return {
    content,
    reasoningContent,
    model: upstreamModel,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
    rawSnippet: rawParts.join("\n").slice(0, 500),
    diagnosticBody:
      lastChunk ??
      ({
        choices: [],
      } satisfies UpstreamResponseBody),
  };
}

function isRetryableStatus(status: number): boolean {
  if (status === 403) return true;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

async function sendToChannel(
  channel: ChannelConfig,
  options: AiRequestOptions,
): Promise<AiResponse> {
  const model = resolveModel(channel, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await withPinnedExternalResponse(
      buildUpstreamUrl(channel.baseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channel.apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(options, model)),
        signal: controller.signal,
      },
      async (pinnedResponse) => {
        const response = pinnedResponse as unknown as Response;
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const retryable = isRetryableStatus(response.status);
          throw new AiChannelError(
            `AI 请求失败: ${response.status} ${text.slice(0, 200)}`.trim(),
            `http_${response.status}`,
            retryable,
          );
        }

        const streamed = await parseChatCompletionSse(response, options);
        const content = streamed.content || streamed.reasoningContent;
        if (!content) {
          throw new AiChannelError(
            `${describeMissingResponseContent(streamed.diagnosticBody)}｜raw=${streamed.rawSnippet}`,
            "empty_response",
            true,
          );
        }

        return {
          content,
          model: streamed.model || model,
          channelName: channel.name,
          channelId: channel.id ?? null,
          providerKeyModelId: channel.providerKeyModelId ?? null,
          providerKeyId: channel.providerKeyId ?? null,
          promptTokens: streamed.usage.promptTokens,
          completionTokens: streamed.usage.completionTokens,
          totalTokens: streamed.usage.totalTokens,
          elapsedMs: Date.now() - startedAt,
        } satisfies AiResponse;
      },
    );
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (error instanceof AiChannelError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiChannelError(`AI 请求超时（${elapsed}ms）`, "timeout", true);
    }
    throw new AiChannelError(
      `AI 网络错误: ${error instanceof Error ? error.message : "unknown"}`,
      "network",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function markChannelSuccess(channel: ChannelConfig) {
  if (channel.source === "provider_key_model" && channel.providerKeyId) {
    const supabase = getServiceSupabaseClient();
    if (!supabase) return;
    await markProviderKeySuccess(supabase, channel.providerKeyId);
  }
}

async function markChannelFailure(channel: ChannelConfig, message: string) {
  if (channel.source === "provider_key_model" && channel.providerKeyId) {
    const supabase = getServiceSupabaseClient();
    if (!supabase) return;
    try {
      await bumpProviderKeyFailure(supabase, channel.providerKeyId, message);
    } catch (error) {
      console.warn("[ai-client] provider key failure marker skipped", error);
    }
  }
}

export class AiChannelError extends Error {
  constructor(
    message: string,
    public readonly errorType: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiChannelError";
  }
}

export async function callAi(options: AiRequestOptions): Promise<AiResponse> {
  const effectiveOptions: AiRequestOptions = {
    ...options,
    messages: [...options.messages],
  };

  const configuredChannels: ChannelConfig[] = [];
  const pushChannelUnique = (channel: ChannelConfig | null) => {
    if (!channel) return;
    if (configuredChannels.some((existing) => existing.id && existing.id === channel.id)) return;
    configuredChannels.push(channel);
  };

  if (options.featureKey) {
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

    if (featureConfig) {
      for (const channel of await resolveFeatureChannelChain(featureConfig)) {
        pushChannelUnique(channel);
      }
    }

    if (featureConfig?.systemPrompt) {
      effectiveOptions.messages = [
        { role: "system", content: featureConfig.systemPrompt },
        ...effectiveOptions.messages,
      ];
    }
  }

  const providerKeyModelId = options.providerKeyModelId?.trim();
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
    return sendWithFailover(channels, effectiveOptions);
  }

  if (!options.databaseOnly) {
    pushChannelUnique(getChannelFromEnv());
  }

  if (configuredChannels.length === 0) {
    if (options.databaseOnly) {
      throw new Error("AI 渠道未配置，请先在后台完成 AI 渠道与功能配置");
    }
    throw new Error("AI API 未配置（需设置 AI_BASE_URL 和 AI_API_KEY，或在后台配置模型顺位）");
  }

  return sendWithFailover(configuredChannels, effectiveOptions);
}

async function sendWithFailover(
  channels: ChannelConfig[],
  effectiveOptions: AiRequestOptions,
): Promise<AiResponse> {
  let lastRetryableError: Error | null = null;
  for (const channel of channels) {
    try {
      const result = await sendToChannel(channel, effectiveOptions);
      await markChannelSuccess(channel);
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

      await markChannelFailure(channel, aiError.message);

      if (!aiError.retryable) {
        aiError.message = `[${channel.name}] ${aiError.message}`;
        throw aiError;
      }

      lastRetryableError = aiError;
    }
  }

  if (lastRetryableError) {
    throw new Error(`所有 AI 渠道不可用（最后错误：${lastRetryableError.message}）`);
  }

  throw new Error("所有 AI 渠道不可用（无可用渠道）");
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
  getEnvFlag,
  getChannelFromEnv,
  isDbChannelModeEnabled,
  isRetryableStatus,
  resolveModel,
  normalizeResponseContent,
  describeMissingResponseContent,
  getFeatureConfigForTests: getFeatureConfig,
  resolveFeatureChannelChainForTests: resolveFeatureChannelChain,
  parseChatCompletionSse,
  setServiceClientForTests(client: unknown) {
    _serviceClient = client;
    cachedFeatureConfigs = null;
  },
  resetCache() {
    cachedFeatureConfigs = null;
  },
};
