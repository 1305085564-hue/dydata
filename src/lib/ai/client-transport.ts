import {
type ChannelConfig
} from "@/lib/ai/client-routing";
import { DEFAULT_AI_MODEL } from "@/lib/ai/constants";
import { buildHaikuVisionBody,parseHaikuVisionResponse,usesHaikuNativeVision } from "@/lib/ai/haiku-vision-transport";
import { withPinnedExternalResponse } from "@/lib/server-url-security";
import { AiChannelError,assertContentContract,isNonRetryableProviderError,isRetryableStatus } from "./client-errors";
import type { AiRequestOptions,AiResponse,StreamedChatCompletionResult,UpstreamResponseBody } from "./client-types";

export const DEFAULT_TIMEOUT_MS = 15_000;

export const DEFAULT_MAX_TOKENS = 2000;

export const DEFAULT_MODEL = DEFAULT_AI_MODEL;

export function normalizeResponseContent(content: unknown): string | null {
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

export function normalizeStreamDeltaText(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return normalizeResponseContent(content);
  }
  return null;
}

export function describeMissingResponseContent(data: UpstreamResponseBody): string {
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

export function resolveModel(channel: ChannelConfig, options: AiRequestOptions) {
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

export function buildRequestBody(options: AiRequestOptions, model: string) {
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

export async function parseChatCompletionSse(response: Response, options?: AiRequestOptions): Promise<StreamedChatCompletionResult> {
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

export async function sendToChannel(
  channel: ChannelConfig,
  options: AiRequestOptions,
): Promise<AiResponse> {
  if (channel.protocol === "cloudflare_clairic") {
    throw new AiChannelError("Cloudflare Clairic 仅支持截图识别专项调用", "unsupported_protocol", true);
  }
  const model = resolveModel(channel, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const nativeVision = usesHaikuNativeVision(model, options);
  const upstreamUrl = nativeVision ? `${channel.baseUrl.replace(/\/+$/, "")}/messages` : buildUpstreamUrl(channel.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await withPinnedExternalResponse(
      upstreamUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(nativeVision ? { "x-api-key": channel.apiKey, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${channel.apiKey}` }),
        },
        body: JSON.stringify(nativeVision ? buildHaikuVisionBody(model, options) : buildRequestBody(options, model)),
        signal: controller.signal,
      },
      async (pinnedResponse) => {
        const response = pinnedResponse as unknown as Response;
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const retryable =
            isRetryableStatus(response.status) &&
            !isNonRetryableProviderError(response.status, text);
          throw new AiChannelError(
            `AI 请求失败: ${response.status} ${text.slice(0, 200)}`.trim(),
            `http_${response.status}`,
            retryable,
          );
        }

        const streamed = nativeVision ? await parseHaikuVisionResponse(response, options) : await parseChatCompletionSse(response, options);
        const content = streamed.content || streamed.reasoningContent;
        if (!content) {
          throw new AiChannelError(
            `${describeMissingResponseContent(streamed.diagnosticBody)}｜raw=${streamed.rawSnippet}`,
            "empty_response",
            true,
          );
        }

        // 200 但不符合输出契约：不能当成结果，换下一个渠道再试。
        // 连续失败会落到该模型行（scope=unknown）的健康计数上，坏渠道会被顺位淘汰。
        assertContentContract(content, options.validateContent);

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
