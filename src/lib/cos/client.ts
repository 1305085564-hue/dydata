import { buildCosAuthorization, buildCosPathname, type CosCredentials } from "./sign";

export interface CosConfig extends CosCredentials {
  bucket: string;
  region: string;
  appId?: string;
}

type Env = Record<string, string | undefined>;
const DEFAULT_READ_TIMEOUT_MS = 3_000;

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
  const timer = setTimeout(() => controller.abort(new Error("cos_timeout")), input.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS);
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
  } finally {
    clearTimeout(timer);
  }
}

export async function cosGetObject(config: CosConfig, objectKey: string, timeoutMs = DEFAULT_READ_TIMEOUT_MS) {
  let bodyBytes: Uint8Array | null = null;
  try {
    const response = await cosFetch(
      config,
      { method: "GET", objectKey, timeoutMs },
      async (result) => {
        if (!result.ok) {
          await result.body?.cancel().catch(() => undefined);
          return;
        }
        bodyBytes = new Uint8Array(await result.arrayBuffer());
      },
    );
    if (!response.ok) {
      return { ok: false as const, status: response.status, body: null, contentType: null, etag: null, error: `cos_status_${response.status}` };
    }
    const body = bodyBytes ?? new Uint8Array();
    return {
      ok: true as const,
      status: response.status,
      body,
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      contentLength: Number(response.headers.get("content-length") ?? body.byteLength),
    };
  } catch (error) {
    return { ok: false as const, status: 0, body: null, contentType: null, etag: null, error: error instanceof Error ? error.message : "cos_get_failed" };
  }
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
