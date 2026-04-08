import type { NextRequest } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import { requireAdminActor } from "../ai-assistant/_shared";

export type AiChannelRow = {
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
  created_at: string;
  updated_at: string;
};

type AdminAuthResult = Awaited<ReturnType<typeof requireAdminActor>>;

export async function requireOwnerActor() {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return auth;
  }

  if (auth.actor.role !== "owner") {
    return { error: "仅 owner 可操作 AI 渠道", status: 403 as const };
  }

  return auth;
}

export function toTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function toNullableString(value: unknown) {
  const text = toTrimmedString(value);
  return text ? text : null;
}

export function toBoolean(value: unknown, defaultValue = false) {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

export function toPriority(value: unknown, fallback = 100) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeBaseUrl(value: unknown) {
  const baseUrl = toTrimmedString(value).replace(/\/+$/, "");
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export function normalizeChannelRow(row: AiChannelRow) {
  const { api_key, ...rest } = row;
  return {
    ...rest,
    api_key_masked: maskApiKey(api_key),
  };
}

export function buildUpstreamUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

export function resolveModel(channelModel: string | null | undefined, fallbackModel?: string) {
  return channelModel?.trim() || fallbackModel?.trim() || process.env.AI_MODEL || "claude-sonnet-4-6";
}

const OCR_TEST_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sWwaP8AAAAASUVORK5CYII=";

type UpstreamTestResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      text?: unknown;
      reasoning_content?: unknown;
    };
    finish_reason?: unknown;
    native_finish_reason?: unknown;
  }>;
};

export async function parseJsonBody<T extends Record<string, unknown>>(request: NextRequest) {
  let body: T;
  try {
    body = (await request.json()) as T;
  } catch {
    throw new Error("请求体格式不正确");
  }
  return body;
}

export async function sendChannelTestRequest(input: {
  channel: Pick<AiChannelRow, "base_url" | "api_key" | "model" | "name">;
  timeoutMs?: number;
  mode?: "text" | "ocr";
  modelOverride?: string | null;
}) {
  const timeoutMs = input.timeoutMs ?? 15_000;
  const model = resolveModel(input.modelOverride ?? input.channel.model);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isOcrMode = input.mode === "ocr";
    const response = await fetch(buildUpstreamUrl(input.channel.base_url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.channel.api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: isOcrMode
          ? [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: [
                      "这是 OCR 能力测试。",
                      "忽略图片内容，只返回 JSON：{\"ok\":true,\"mode\":\"ocr\"}",
                      "不要输出其他内容。",
                    ].join("\n"),
                  },
                  {
                    type: "image_url",
                    image_url: { url: OCR_TEST_IMAGE_DATA_URL },
                  },
                ],
              },
            ]
          : [{ role: "user", content: "回复 ok" }],
        max_tokens: isOcrMode ? 120 : 16,
        ...(isOcrMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        elapsedMs,
        error: `HTTP ${response.status}${errorText ? `：${errorText.slice(0, 200)}` : ""}`,
      };
    }

    const rawText = await response.text().catch(() => "");
    let data: UpstreamTestResponse | null = null;
    try {
      data = rawText ? (JSON.parse(rawText) as UpstreamTestResponse) : null;
    } catch {
      return { ok: false, elapsedMs, error: `AI 返回非 JSON：${rawText.slice(0, 300)}` };
    }
    const message = data?.choices?.[0]?.message;
    const responseText =
      aiClientInternal.normalizeResponseContent(message?.content) ??
      aiClientInternal.normalizeResponseContent(message?.text) ??
      aiClientInternal.normalizeResponseContent(message?.reasoning_content);

    if (!responseText) {
      const diag = data ? aiClientInternal.describeMissingResponseContent(data) : "AI 未返回可解析结果";
      return {
        ok: false,
        elapsedMs,
        error: `${diag}｜raw=${rawText.slice(0, 500)}`,
      };
    }

    return {
      ok: true,
      elapsedMs,
      text: responseText,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        elapsedMs,
        error: `请求超时（${timeoutMs}ms）`,
      };
    }

    return {
      ok: false,
      elapsedMs,
      error: error instanceof Error ? error.message : "未知错误",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function toAdminResponseError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallbackMessage;
}

export type OwnerAuth = Exclude<AdminAuthResult, { error: string; status: number }>;
