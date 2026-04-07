/**
 * 统一 AI 客户端
 * 支持环境变量单渠道模式，以及数据库多渠道 failover + 熔断
 */

import { createClient } from "@supabase/supabase-js";

type TextContent = string;
type MultimodalBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type MessageContent = TextContent | MultimodalBlock[];

export type AiMessage = {
  role: "user" | "system";
  content: MessageContent;
};

export type AiRequestOptions = {
  messages: AiMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  model?: string;
};

export type AiResponse = {
  content: string;
  model: string;
  channelName: string;
  elapsedMs: number;
};

type ChannelConfig = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string | null;
  priority?: number;
  unhealthyUntil?: string | null;
  consecutiveFailures?: number;
  lastFailureAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorMessage?: string | null;
  source: "env" | "database";
};

type AiChannelRow = {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string | null;
  priority: number;
  is_enabled: boolean;
  unhealthy_until: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
};

type UpstreamResponseBody = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const CHANNEL_CACHE_TTL_MS = 60_000;
const CIRCUIT_BREAK_HOURS = 12;

let cachedChannels: { expiresAt: number; channels: ChannelConfig[] } | null = null;
let channelsPromise: Promise<ChannelConfig[]> | null = null;

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

function createServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function updateCachedChannel(channelId: string, updater: (channel: ChannelConfig) => ChannelConfig) {
  if (!cachedChannels) return;

  cachedChannels = {
    ...cachedChannels,
    channels: cachedChannels.channels.map((channel) =>
      channel.id === channelId ? updater(channel) : channel
    ),
  };
}

function mapDbChannel(row: AiChannelRow): ChannelConfig {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    priority: row.priority,
    unhealthyUntil: row.unhealthy_until,
    consecutiveFailures: row.consecutive_failures,
    lastFailureAt: row.last_failure_at,
    lastSuccessAt: row.last_success_at,
    lastErrorMessage: row.last_error_message,
    source: "database",
  };
}

async function fetchDatabaseChannels(): Promise<ChannelConfig[]> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("ai_channels")
    .select(
      "id, name, base_url, api_key, model, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message"
    )
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  if (error || !data?.length) {
    return [];
  }

  return (data as AiChannelRow[]).map(mapDbChannel);
}

async function getAvailableChannels(): Promise<ChannelConfig[]> {
  const envChannel = getChannelFromEnv();

  if (!isDbChannelModeEnabled()) {
    return envChannel ? [envChannel] : [];
  }

  const now = Date.now();
  if (cachedChannels && cachedChannels.expiresAt > now) {
    return cachedChannels.channels;
  }

  if (!channelsPromise) {
    channelsPromise = fetchDatabaseChannels()
      .then((channels) => {
        const effectiveChannels = channels.length > 0 ? channels : envChannel ? [envChannel] : [];
        cachedChannels = {
          expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS,
          channels: effectiveChannels,
        };
        return effectiveChannels;
      })
      .catch(() => {
        const fallbackChannels = envChannel ? [envChannel] : [];
        cachedChannels = {
          expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS,
          channels: fallbackChannels,
        };
        return fallbackChannels;
      })
      .finally(() => {
        channelsPromise = null;
      });
  }

  return channelsPromise;
}

function normalizeResponseContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item && typeof item === "object" && item.type === "text" && typeof item.text === "string")
      .map((item) => (item as { text: string }).text.trim())
      .filter(Boolean)
      .join("\n");
    return text || null;
  }
  return null;
}

export function buildUpstreamUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function resolveModel(channel: ChannelConfig, options: AiRequestOptions) {
  return channel.model || options.model || process.env.AI_MODEL || DEFAULT_MODEL;
}

function buildRequestBody(options: AiRequestOptions, model: string) {
  const body: Record<string, unknown> = {
    model,
    messages: options.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  return body;
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

  let response: Response;
  try {
    response = await fetch(buildUpstreamUrl(channel.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channel.apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(options, model)),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const elapsed = Date.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiChannelError(`AI 请求超时（${elapsed}ms）`, "timeout", true);
    }
    throw new AiChannelError(
      `AI 网络错误: ${error instanceof Error ? error.message : "unknown"}`,
      "network",
      true,
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const retryable = isRetryableStatus(response.status);
    throw new AiChannelError(
      `AI 请求失败: ${response.status} ${text.slice(0, 200)}`.trim(),
      `http_${response.status}`,
      retryable,
    );
  }

  const data = (await response.json()) as UpstreamResponseBody;
  const content = normalizeResponseContent(data.choices?.[0]?.message?.content);
  if (!content) {
    throw new AiChannelError("AI 未返回有效内容", "empty_response", false);
  }

  return {
    content,
    model,
    channelName: channel.name,
    elapsedMs: Date.now() - startedAt,
  };
}

async function markChannelSuccess(channel: ChannelConfig) {
  if (channel.source !== "database" || !channel.id) return;

  const hadFailures =
    (channel.consecutiveFailures ?? 0) > 0 ||
    Boolean(channel.unhealthyUntil) ||
    Boolean(channel.lastFailureAt) ||
    Boolean(channel.lastErrorMessage);

  if (!hadFailures) {
    return;
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return;

  await supabase
    .from("ai_channels")
    .update({
      consecutive_failures: 0,
      unhealthy_until: null,
      last_success_at: new Date().toISOString(),
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", channel.id);

  updateCachedChannel(channel.id, (cachedChannel) => ({
    ...cachedChannel,
    consecutiveFailures: 0,
    unhealthyUntil: null,
    lastSuccessAt: new Date().toISOString(),
    lastErrorMessage: null,
  }));
}

async function markChannelFailure(channel: ChannelConfig, message: string) {
  if (channel.source !== "database" || !channel.id) return;

  const supabase = createServiceSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase.rpc("bump_ai_channel_failure", {
    target_id: channel.id,
    error_message: message.slice(0, 500),
  });

  const row = Array.isArray(data) ? data[0] : null;
  updateCachedChannel(channel.id, (cachedChannel) => ({
    ...cachedChannel,
    consecutiveFailures:
      row && typeof row.consecutive_failures === "number"
        ? row.consecutive_failures
        : (cachedChannel.consecutiveFailures ?? 0) + 1,
    unhealthyUntil:
      row && typeof row.unhealthy_until === "string"
        ? row.unhealthy_until
        : row && row.unhealthy_until === null
          ? null
          : cachedChannel.unhealthyUntil,
    lastFailureAt: new Date().toISOString(),
    lastErrorMessage: message.slice(0, 500),
  }));
}

function isChannelHealthy(channel: ChannelConfig, now: number) {
  if (!channel.unhealthyUntil) return true;
  const unhealthyUntilMs = Date.parse(channel.unhealthyUntil);
  return Number.isNaN(unhealthyUntilMs) || unhealthyUntilMs <= now;
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
  const configuredChannels = await getAvailableChannels();
  if (configuredChannels.length === 0) {
    throw new Error("AI API 未配置（需设置 AI_BASE_URL 和 AI_API_KEY，或配置 ai_channels）");
  }

  const now = Date.now();
  const healthyChannels = configuredChannels.filter((channel) => isChannelHealthy(channel, now));
  const channels = healthyChannels.length > 0 ? healthyChannels : configuredChannels.filter((channel) => channel.source === "env");

  if (channels.length === 0) {
    throw new Error("所有 AI 渠道不可用");
  }

  let lastRetryableError: Error | null = null;
  for (const channel of channels) {
    try {
      const result = await sendToChannel(channel, options);
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
        throw aiError;
      }

      lastRetryableError = aiError;
    }
  }

  if (lastRetryableError) {
    throw new Error("所有 AI 渠道不可用");
  }

  throw new Error("所有 AI 渠道不可用");
}

export async function callAiJson(prompt: string, opts?: {
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
}): Promise<AiResponse> {
  return callAi({
    messages: [{ role: "user", content: prompt }],
    maxTokens: opts?.maxTokens,
    timeoutMs: opts?.timeoutMs,
    model: opts?.model,
    jsonMode: true,
  });
}

export async function callAiText(prompt: string, opts?: {
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
}): Promise<AiResponse> {
  return callAi({
    messages: [{ role: "user", content: prompt }],
    maxTokens: opts?.maxTokens,
    timeoutMs: opts?.timeoutMs,
    model: opts?.model,
    jsonMode: false,
  });
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
  isChannelHealthy,
  resolveModel,
  resetCache() {
    cachedChannels = null;
    channelsPromise = null;
  },
};
