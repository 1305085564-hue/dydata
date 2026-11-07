export type ProviderFailureScope = "key" | "model" | "unknown";

const MODEL_FAILURE_PATTERN = /(?:model[_\s-]?(?:not[_\s-]?found|unavailable|unsupported|invalid)|unsupported[_\s-]?model|invalid[_\s-]?model|unknown[_\s-]?model|no such model|does not support (?:the )?model)/i;
const KEY_FAILURE_PATTERN = /(?:api[_\s-]?key|access[_\s-]?key|unauthori[sz]ed|forbidden|invalid credential|insufficient[_\s-]?(?:user[_\s-]?)?quota|billing|余额|额度|欠费|quota exceeded)/i;

function parseHttpStatus(errorType?: string) {
  const match = errorType?.match(/^http_(\d{3})$/);
  return match ? Number(match[1]) : undefined;
}

const KEY_AUTH_PATTERN = /(?:unauthori[sz]ed|invalid[_\s-]+(?:api[_\s-]?key|credential))/i;
const KEY_TEMPORARY_PATTERN = /(?:quota|billing|余额|额度|Cloudflare|captcha|access denied)/i;

/**
 * 永久失效只属于 Key 级明确鉴权拒绝。
 * 模型级 404/503/超时、额度/限流/临时拦截都只进入可恢复冷却；撤下由可信清单同步单独负责。
 */
export function isPermanentProviderFailure(input: { status?: number; errorType?: string; message?: string }) {
  const status = input.status ?? parseHttpStatus(input.errorType);
  if (status === 402 || status === 408 || status === 429) return false;
  if (status !== undefined && status >= 500) return false;
  const message = input.message ?? "";
  if (classifyProviderFailure(input) !== "key") return false;
  if (status === 401) return true;
  if (status === 403 && KEY_AUTH_PATTERN.test(message)) return true;
  if (status === 403 && KEY_TEMPORARY_PATTERN.test(message)) return false;
  return KEY_AUTH_PATTERN.test(`${input.errorType ?? ""} ${message}`);
}

export function classifyProviderFailure(input: {
  status?: number;
  errorType?: string;
  message?: string;
}): ProviderFailureScope {
  const status = input.status ?? parseHttpStatus(input.errorType);
  const message = `${input.errorType ?? ""} ${input.message ?? ""}`;

  if (status === 401 || status === 402) return "key";
  if (status === 408 || status === 429 || (status !== undefined && status >= 500) || input.errorType === "network" || input.errorType === "timeout") return "model";
  if (MODEL_FAILURE_PATTERN.test(message)) return "model";
  if (status === 403 || KEY_FAILURE_PATTERN.test(message)) return "key";

  return "unknown";
}

export function sanitizeProviderErrorMessage(message: unknown, secrets: string[] = []) {
  let sanitized = typeof message === "string" ? message : "上游请求失败";
  sanitized = sanitized.replace(/Bearer\s+[^\s,;]+/gi, "[凭据已隐藏]");
  for (const secret of secrets) {
    const value = secret.trim();
    if (!value) continue;
    sanitized = sanitized.split(value).join("[凭据已隐藏]");
  }
  sanitized = sanitized.replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "凭据已隐藏");
  return sanitized.trim().slice(0, 200) || "上游请求失败";
}

/** Only matching temporary transport failures may pause an entire channel. */
export function providerFailureKind(errorType: string): "timeout" | "service" | "other" {
  if (errorType === "timeout" || errorType === "network" || errorType === "http_408") return "timeout";
  return /^http_5\d\d$/.test(errorType) ? "service" : "other";
}
