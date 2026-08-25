import { fetchWithTimeout } from "@/lib/fetch-timeout";

/**
 * 飞书 webhook 共享发送器
 *
 * 设计约定：
 * - 使用 fetchWithTimeout 的真实三参数签名 (url, options, timeoutMs)。
 * - 永不抛异常：超时 / 网络异常 / 非 2xx 一律返回结构化失败结果，
 *   调用方必须根据 ok=false 持久化失败记录，禁止把失败伪装成成功。
 * - 不做进程内自动重试：超时或网络错误时无法确认飞书是否已收到，
 *   自动重试可能重复发消息。补发幂等由调用方负责：
 *   · 催交（remind）→ 依赖 remind_logs 当日成功记录去重。
 * - 失败结果只带状态码和截断后的响应预览，绝不包含 webhook URL 或密钥。
 */

export type FeishuWebhookFailureReason =
  | "not_configured"
  | "timeout"
  | "network"
  | "non_2xx";

export type FeishuWebhookResult =
  | { ok: true }
  | {
      ok: false;
      reason: FeishuWebhookFailureReason;
      status?: number;
      bodyPreview?: string;
    };

export type FeishuWebhookDeps = {
  webhookUrl?: string;
  fetchImpl?: typeof fetchWithTimeout;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const BODY_PREVIEW_LIMIT = 200;

function truncate(text: string) {
  return text.length > BODY_PREVIEW_LIMIT
    ? `${text.slice(0, BODY_PREVIEW_LIMIT)}…`
    : text;
}

export async function sendFeishuWebhook(
  payload: unknown,
  deps: FeishuWebhookDeps = {},
): Promise<FeishuWebhookResult> {
  const webhookUrl = deps.webhookUrl ?? process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: false, reason: "not_configured" };
  }

  const doFetch = deps.fetchImpl ?? fetchWithTimeout;

  try {
    const response = await doFetch(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      let bodyPreview: string | undefined;
      try {
        bodyPreview = truncate(await response.text());
      } catch {
        bodyPreview = undefined;
      }
      return { ok: false, reason: "non_2xx", status: response.status, bodyPreview };
    }

    return { ok: true };
  } catch (error) {
    // fetchWithTimeout 对 AbortError 统一抛「请求超时，请检查网络后重试」
    if (error instanceof Error && error.message.includes("请求超时")) {
      return { ok: false, reason: "timeout" };
    }
    // 网络层异常：不带 error.message，避免泄露内部 URL/堆栈
    return { ok: false, reason: "network" };
  }
}
