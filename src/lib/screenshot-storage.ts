import { cosDeleteObject, cosGetObject, cosHeadObject, cosPutObject, readCosConfig, type CosConfig, type CosFailureDetail } from "@/lib/cos/client";

export const SCREENSHOT_BUCKET = "submission-screenshots";
export const DEFAULT_COS_READ_TIMEOUT_MS = 3_000;
const MIN_COS_READ_TIMEOUT_MS = 200;
const MAX_COS_READ_TIMEOUT_MS = 10_000;
export type ScreenshotBackend = "cos";
type Env = Record<string, string | undefined>;

export function resolveCosReadTimeout(env: Env = process.env) {
  const parsed = Number(env.COS_READ_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COS_READ_TIMEOUT_MS;
  return Math.min(MAX_COS_READ_TIMEOUT_MS, Math.max(MIN_COS_READ_TIMEOUT_MS, Math.round(parsed)));
}

export interface StorageResolution {
  primary: ScreenshotBackend;
  cos: CosConfig;
  degraded: false;
  reason: null;
}

export function resolveScreenshotStorage(env: Env = process.env): StorageResolution {
  const cos = readCosConfig(env);
  if (!cos) throw new Error("缺少 COS 截图存储配置");
  return { primary: "cos", cos, degraded: false, reason: null };
}

function logStorage(event: string, detail: Record<string, unknown> = {}) {
  console.info("[screenshot-storage]", JSON.stringify({ event, ...detail }));
}

export type ScreenshotReadResult =
  | { kind: "bytes"; backend: ScreenshotBackend; body: Uint8Array; contentType: string | null; etag: string | null; fellBack: false }
  | { kind: "failure"; notFound: boolean; errors: string[]; failure?: CosFailureDetail };

export async function readSubmissionScreenshot(
  path: string,
  options: { env?: Env } = {},
): Promise<ScreenshotReadResult> {
  const resolution = resolveScreenshotStorage(options.env);
  const startedAt = Date.now();
  const cosTimeoutMs = resolveCosReadTimeout(options.env);
  const cos = await cosGetObject(resolution.cos, path, cosTimeoutMs);
  const cosStatus = cos.status;
  if (cos.ok && cos.body) {
    logStorage("read", { backend: "cos", status: cos.status, bytes: cos.body.byteLength, cos_ms: Date.now() - startedAt, total_ms: Date.now() - startedAt });
    return { kind: "bytes", backend: "cos", body: cos.body, contentType: cos.contentType, etag: cos.etag, fellBack: false };
  }
  const reason = cos.error ?? `cos_status_${cosStatus}`;
  logStorage("read_failed", { backend: "cos", status: cosStatus, reason, cos_ms: Date.now() - startedAt, timeout_ms: cosTimeoutMs });
  return { kind: "failure", notFound: cosStatus === 404, errors: [`cos:${cos.error ?? cosStatus}`], failure: cos.failure };
}

/**
 * 判断截图对象是否可读（只做存在性校验，不下载字节）。
 *
 * 关键分支：只有 COS 明确返回 404 才判定为缺失。超时、网络错误、5xx
 * 都属「无法确认对象不存在」，此时放行，避免 COS 短暂抖动阻断刚上传的新图提交。
 */
export async function findReadableSubmissionScreenshots(
  paths: string[],
  options: {
    env?: Env;
    headObject?: typeof cosHeadObject;
  } = {},
): Promise<{ readable: string[]; missing: string[] }> {
  const resolution = resolveScreenshotStorage(options.env);
  const cosTimeoutMs = resolveCosReadTimeout(options.env);
  const headObject = options.headObject ?? cosHeadObject;

  const checks = await Promise.all(
    paths.map(async (path) => {
      const head = await headObject(resolution.cos, path, cosTimeoutMs);
      if (head.ok) return { path, ok: true };
      if (head.status !== 404) {
        logStorage("screenshot_exists_unverified", {
          backend: "cos",
          status: head.status,
          reason: head.error ?? `cos_status_${head.status}`,
          timeout_ms: cosTimeoutMs,
        });
        return { path, ok: true };
      }
      return { path, ok: false };
    }),
  );

  return {
    readable: checks.filter((item) => item.ok).map((item) => item.path),
    missing: checks.filter((item) => !item.ok).map((item) => item.path),
  };
}

export async function downloadSubmissionScreenshotBytes(path: string, options: { env?: Env } = {}) {
  const resolution = resolveScreenshotStorage(options.env);
  const startedAt = Date.now();
  const cosTimeoutMs = resolveCosReadTimeout(options.env);
  const cos = await cosGetObject(resolution.cos, path, cosTimeoutMs);
  const cosStatus = cos.status;
  if (cos.ok && cos.body) {
    logStorage("read", { backend: "cos", status: cos.status, bytes: cos.body.byteLength, cos_ms: Date.now() - startedAt, total_ms: Date.now() - startedAt });
    return { ok: true as const, body: cos.body, contentType: cos.contentType, backend: "cos" as const, fellBack: false as const };
  }
  const reason = cos.error ?? `cos_status_${cosStatus}`;
  logStorage("read_failed", { backend: "cos", status: cosStatus, reason, cos_ms: Date.now() - startedAt, timeout_ms: cosTimeoutMs });
  return { ok: false as const, notFound: cosStatus === 404, errors: [`cos:${cos.error ?? cosStatus}`] };
}

export async function writeSubmissionScreenshot(input: { path: string; body: Uint8Array; contentType: string; env?: Env }) {
  const resolution = resolveScreenshotStorage(input.env);
  const result = await cosPutObject(resolution.cos, input.path, input.body, input.contentType);
  if (result.ok) {
    logStorage("write", { backend: "cos", bytes: input.body.byteLength });
    return { ok: true as const, backend: "cos" as const };
  }
  logStorage("write_failed", { backend: "cos", status: result.status, reason: result.error });
  return { ok: false as const, error: result.error ?? "cos_upload_failed" };
}

export async function deleteSubmissionScreenshots(paths: string[]) {
  if (paths.length === 0) return { failures: 0 };
  const cos = readCosConfig();
  if (!cos) return { failures: 1 };
  let failures = 0;
  for (const path of paths) {
    const result = await cosDeleteObject(cos, path);
    if (!result.ok) {
      failures += 1;
      logStorage("delete_failed", { backend: "cos", path, status: result.status });
    }
  }
  return { failures };
}
