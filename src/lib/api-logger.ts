/**
 * API 结构化日志
 *
 * 规矩：
 * - 每条日志一行 JSON，带 requestId，便于在 Vercel Logs 里按请求串联。
 * - userId 只允许在用户鉴权完成后由调用方显式传入；公开接口（如 /api/health）不传。
 * - detail 中的敏感键（token/secret/password/api_key/cookie/authorization）一律脱敏；
 *   禁止把原始请求体整包塞进日志。
 */

const SENSITIVE_KEY_PATTERN =
  /(authorization|token|secret|password|api[_-]?key|cookie)/i;

const SENSITIVE_PLACEHOLDER = "[REDACTED]";

export function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

type Redactable = Record<string, unknown>;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date)
  ) {
    return redactSensitive(value as Redactable);
  }
  return value;
}

export function redactSensitive<T extends Redactable>(record: T): T {
  const output: Redactable = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      output[key] = SENSITIVE_PLACEHOLDER;
      continue;
    }
    output[key] = redactValue(value);
  }
  return output as T;
}

export function resolveRequestId(request: Request): string {
  const headerId = request.headers.get("x-request-id")?.trim();
  if (headerId) {
    // 截断外部传入的 id，防止超长字符串污染日志
    return headerId.slice(0, 64);
  }
  return crypto.randomUUID();
}

export interface ApiLogEntry {
  requestId: string;
  route: string;
  method?: string;
  status?: number;
  durationMs?: number;
  /** 仅在完成用户鉴权后传入；公开/机器触发接口留空 */
  userId?: string | null;
  outcome?: string;
  detail?: Record<string, unknown>;
}

function serialize(entry: ApiLogEntry, level: "info" | "error", errorMessage?: string) {
  return JSON.stringify({
    level,
    kind: "api",
    ts: new Date().toISOString(),
    ...redactSensitive({ ...entry }),
    ...(errorMessage !== undefined ? { error: errorMessage } : {}),
  });
}

export function logApiRequest(entry: ApiLogEntry) {
  console.info(serialize(entry, "info"));
}

/** 仅记录错误 message 本身；禁止携带堆栈、数据库原始错误或请求体 */
export function logApiError(entry: ApiLogEntry, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(serialize(entry, "error", message));
}
