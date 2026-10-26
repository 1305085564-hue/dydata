import { buildCosAuthorization, buildCosPathname, type CosCredentials } from "./sign";

export interface CosConfig extends CosCredentials {
  bucket: string;
  region: string;
  appId?: string;
}

type Env = Record<string, string | undefined>;
const DEFAULT_READ_TIMEOUT_MS = 3_000;
type CosReadFailureKind = "timeout" | "network" | "http" | "unknown";
type CosReadFailurePhase = "headers" | "body";
export type CosFailureDetail = {
  kind: CosReadFailureKind;
  code: string | null;
  phase: CosReadFailurePhase;
  attempts: number;
};
type CosGetObjectResult =
  | {
      ok: true;
      status: number;
      body: Uint8Array;
      contentType: string | null;
      etag: string | null;
      contentLength: number;
      attempts: number;
    }
  | {
      ok: false;
      status: number;
      body: null;
      contentType: null;
      etag: null;
      error: string;
      failure: CosFailureDetail;
      attempts: number;
    };

const timeoutCodes = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
]);
const retryableNetworkCodes = new Set([
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT",
  "UND_ERR_SOCKET",
]);
const certificateCodes = new Set([
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
]);
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const cosTimeoutErrors = new WeakSet<object>();

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function collectErrorCodes(error: unknown) {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  const codes: string[] = [];

  while (pending.length > 0 && visited.size < 100) {
    const current = pending.shift();
    if (!isObjectLike(current) || visited.has(current)) continue;
    visited.add(current);

    try {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) codes.push(code);
    } catch {
      // A malformed error object must not interrupt COS error handling.
    }

    try {
      const cause = (current as { cause?: unknown }).cause;
      if (cause !== undefined) pending.push(cause);
    } catch {
      // Continue with other AggregateError entries when a cause getter fails.
    }

    try {
      const errors = (current as { errors?: unknown }).errors;
      if (Array.isArray(errors)) pending.push(...errors.slice(0, 100));
    } catch {
      // AggregateError.errors is optional for non-standard error objects.
    }
  }

  return [...new Set(codes)];
}

function classifyCosReadError(error: unknown, timedOut: boolean) {
  const codes = collectErrorCodes(error);
  const certificateCode = codes.find((code) => certificateCodes.has(code));
  if (certificateCode) {
    return { kind: "network" as const, code: certificateCode, retryable: false };
  }

  const timeoutCode = codes.find((code) => timeoutCodes.has(code));
  if (timedOut || timeoutCode) {
    return { kind: "timeout" as const, code: timeoutCode ?? "COS_TIMEOUT", retryable: true };
  }

  const networkCode = codes.find((code) => retryableNetworkCodes.has(code));
  if (networkCode) {
    return { kind: "network" as const, code: networkCode, retryable: true };
  }

  return {
    kind: "unknown" as const,
    code: codes.find((code) => SAFE_ERROR_CODE.test(code)) ?? null,
    retryable: false,
  };
}

function buildCosGetFailure(
  status: number,
  failure: Omit<CosFailureDetail, "attempts">,
  attempts: number,
): CosGetObjectResult {
  const error = failure.kind === "http"
    ? `cos_status_${status}`
    : failure.kind === "timeout"
      ? "cos_timeout"
      : failure.code ?? (failure.kind === "network" ? "COS_NETWORK_ERROR" : "COS_READ_FAILED");

  return {
    ok: false,
    status,
    body: null,
    contentType: null,
    etag: null,
    error,
    failure: { ...failure, attempts },
    attempts,
  };
}

function logCosGetRetry(
  config: CosConfig,
  failure: Omit<CosFailureDetail, "attempts">,
  attempt: number,
  startedAt: number,
  timeoutMs: number,
) {
  console.info("[cos]", JSON.stringify({
    event: "get_retry",
    host: buildCosHost(config),
    region: config.region,
    kind: failure.kind,
    code: failure.code,
    phase: failure.phase,
    attempt,
    next_attempt: attempt + 1,
    elapsed_ms: Date.now() - startedAt,
    timeout_ms: timeoutMs,
  }));
}

export function readCosConfig(env: Env = process.env): CosConfig | null {
  const secretId = env.COS_SECRET_ID?.trim();
  const secretKey = env.COS_SECRET_KEY?.trim();
  const bucket = env.COS_BUCKET?.trim();
  const region = env.COS_REGION?.trim();
  if (!secretId || !secretKey || !bucket || !region) return null;
  return { secretId, secretKey, bucket, region, appId: env.COS_APP_ID?.trim() || undefined };
}

export function buildCosHost(config: CosConfig) {
  return `${config.bucket}.cos.${config.region}.myqcloud.com`;
}

async function cosFetch(
  config: CosConfig,
  input: { method: string; objectKey: string; headers?: Record<string, string>; body?: BodyInit | null; timeoutMs?: number },
  consume?: (response: Response) => Promise<void>,
) {
  const host = buildCosHost(config);
  const pathname = buildCosPathname(input.objectKey);
  const headers: Record<string, string> = { host, ...(input.headers ?? {}) };
  const authorization = buildCosAuthorization(config, { method: input.method, pathname, headers, expiresIn: 300 });
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("cos_timeout"));
  }, input.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${host}${pathname}`, {
      method: input.method,
      headers: { ...headers, Authorization: authorization },
      body: input.body ?? null,
      signal: controller.signal,
      cache: "no-store",
    });
    // 响应体读取也必须在同一个超时作用域内：fetch 只等到响应头就返回，
    // 若在此处清掉定时器，慢传 body 会脱离保护、无限挂住（大图最高 4.4MB）。
    if (consume) await consume(response);
    return response;
  } catch (error) {
    if (timedOut && isObjectLike(error)) cosTimeoutErrors.add(error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function cosGetObject(
  config: CosConfig,
  objectKey: string,
  timeoutMs = DEFAULT_READ_TIMEOUT_MS,
): Promise<CosGetObjectResult> {
  const startedAt = Date.now();
  const budgetMs = Math.max(0, timeoutMs);
  const deadline = startedAt + budgetMs;
  let attempts = 0;
  let lastFailure: CosGetObjectResult | null = null;

  while (attempts < 2) {
    const remainingMs = Math.max(0, deadline - Date.now());
    if (attempts > 0 && remainingMs <= 0) break;
    attempts += 1;

    let phase: CosReadFailurePhase = "headers";
    let bodyBytes: Uint8Array | null = null;
    try {
      const response = await cosFetch(
        config,
        { method: "GET", objectKey, timeoutMs: remainingMs },
        async (result) => {
          if (!result.ok) {
            await result.body?.cancel().catch(() => undefined);
            return;
          }
          phase = "body";
          bodyBytes = new Uint8Array(await result.arrayBuffer());
        },
      );

      if (!response.ok) {
        const failure = { kind: "http" as const, code: String(response.status), phase: "headers" as const };
        const result = buildCosGetFailure(response.status, failure, attempts);
        const retryableStatus = response.status === 429 || (response.status >= 500 && response.status <= 599);
        if (attempts === 1 && retryableStatus && deadline - Date.now() > 0) {
          logCosGetRetry(config, failure, attempts, startedAt, budgetMs);
          lastFailure = result;
          continue;
        }
        return result;
      }

      const body = bodyBytes ?? new Uint8Array();
      return {
        ok: true,
        status: response.status,
        body,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
        contentLength: Number(response.headers.get("content-length") ?? body.byteLength),
        attempts,
      };
    } catch (error) {
      const timedOut = isObjectLike(error) && cosTimeoutErrors.has(error);
      const classification = classifyCosReadError(error, timedOut);
      const failure = { kind: classification.kind, code: classification.code, phase };
      const result = buildCosGetFailure(0, failure, attempts);
      if (attempts === 1 && classification.retryable && deadline - Date.now() > 0) {
        logCosGetRetry(config, failure, attempts, startedAt, budgetMs);
        lastFailure = result;
        continue;
      }
      return result;
    }
  }

  return lastFailure ?? buildCosGetFailure(0, {
    kind: "timeout",
    code: "COS_TIMEOUT",
    phase: "headers",
  }, attempts);
}

export async function cosHeadObject(config: CosConfig, objectKey: string, timeoutMs = DEFAULT_READ_TIMEOUT_MS) {
  try {
    const response = await cosFetch(config, { method: "HEAD", objectKey, timeoutMs });
    await response.body?.cancel().catch(() => undefined);
    return {
      ok: response.ok,
      status: response.status,
      contentLength: Number(response.headers.get("content-length") ?? 0),
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      sourceSha256: response.headers.get("x-cos-meta-source-sha256"),
      sourceMd5: response.headers.get("x-cos-meta-source-md5"),
    };
  } catch (error) {
    return { ok: false, status: 0, contentLength: 0, contentType: null, etag: null, sourceSha256: null, sourceMd5: null, error: error instanceof Error ? error.message : "cos_head_failed" };
  }
}

export async function cosPutObject(
  config: CosConfig,
  objectKey: string,
  body: Uint8Array | ArrayBuffer,
  contentType: string,
  options: { sourceSha256?: string; sourceMd5?: string; timeoutMs?: number } = {},
) {
  try {
    const headers: Record<string, string> = { "content-type": contentType };
    if (options.sourceSha256) headers["x-cos-meta-source-sha256"] = options.sourceSha256;
    if (options.sourceMd5) headers["x-cos-meta-source-md5"] = options.sourceMd5;
    const response = await cosFetch(config, {
      method: "PUT",
      objectKey,
      headers,
      body: Buffer.from(body as Uint8Array),
      timeoutMs: options.timeoutMs ?? 8_000,
    });
    await response.body?.cancel().catch(() => undefined);
    return { ok: response.ok, status: response.status, etag: response.headers.get("etag"), error: response.ok ? undefined : `cos_status_${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, etag: null, error: error instanceof Error ? error.message : "cos_put_failed" };
  }
}

export async function cosDeleteObject(config: CosConfig, objectKey: string, timeoutMs = 5_000) {
  try {
    const response = await cosFetch(config, { method: "DELETE", objectKey, timeoutMs });
    await response.body?.cancel().catch(() => undefined);
    return { ok: response.ok || response.status === 404, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "cos_delete_failed" };
  }
}

export const __clientInternal = { cosFetch };
