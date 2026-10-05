export type ProviderFailureScope = "key" | "model" | "unknown";

const MODEL_FAILURE_PATTERN = /(?:model[_\s-]?(?:not[_\s-]?found|unavailable|unsupported|invalid)|unsupported[_\s-]?model|invalid[_\s-]?model|unknown[_\s-]?model|no such model|does not support (?:the )?model)/i;
const KEY_FAILURE_PATTERN = /(?:api[_\s-]?key|access[_\s-]?key|unauthori[sz]ed|forbidden|invalid credential|insufficient[_\s-]?(?:user[_\s-]?)?quota|billing|余额|额度|欠费|quota exceeded)/i;

function parseHttpStatus(errorType?: string) {
  const match = errorType?.match(/^http_(\d{3})$/);
  return match ? Number(match[1]) : undefined;
}

export function classifyProviderFailure(input: {
  status?: number;
  errorType?: string;
  message?: string;
}): ProviderFailureScope {
  const status = input.status ?? parseHttpStatus(input.errorType);
  const message = `${input.errorType ?? ""} ${input.message ?? ""}`;

  if (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    (typeof status === "number" && status >= 500 && status <= 599) ||
    input.errorType === "network" ||
    input.errorType === "timeout" ||
    KEY_FAILURE_PATTERN.test(message)
  ) {
    return "key";
  }

  if (MODEL_FAILURE_PATTERN.test(message)) return "model";
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
