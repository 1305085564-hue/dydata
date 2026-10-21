import { createAdminClient } from "@/lib/supabase/admin";
import { cosDeleteObject, cosGetObject, cosHeadObject, cosPutObject, readCosConfig, type CosConfig } from "@/lib/cos/client";

export const SCREENSHOT_BUCKET = "submission-screenshots";
export const DEFAULT_COS_READ_TIMEOUT_MS = 3_000;
const MIN_COS_READ_TIMEOUT_MS = 200;
const MAX_COS_READ_TIMEOUT_MS = 10_000;
export type ScreenshotBackend = "cos" | "supabase";
type Env = Record<string, string | undefined>;

export function resolveCosReadTimeout(env: Env = process.env) {
  const parsed = Number(env.COS_READ_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COS_READ_TIMEOUT_MS;
  return Math.min(MAX_COS_READ_TIMEOUT_MS, Math.max(MIN_COS_READ_TIMEOUT_MS, Math.round(parsed)));
}

export interface StorageResolution {
  primary: ScreenshotBackend;
  cos: CosConfig | null;
  degraded: boolean;
  reason: "missing_cos_config" | "unsupported_value" | null;
}

export function resolveScreenshotStorage(env: Env = process.env): StorageResolution {
  const cos = readCosConfig(env);
  const configured = env.SCREENSHOT_STORAGE?.trim().toLowerCase();
  if (configured === "cos") {
    return cos
      ? { primary: "cos", cos, degraded: false, reason: null }
      : { primary: "supabase", cos: null, degraded: true, reason: "missing_cos_config" };
  }
  if (configured && configured !== "supabase") {
    return { primary: "supabase", cos, degraded: true, reason: "unsupported_value" };
  }
  return { primary: "supabase", cos, degraded: false, reason: null };
}

function logStorage(event: string, detail: Record<string, unknown> = {}) {
  console.info("[screenshot-storage]", JSON.stringify({ event, ...detail }));
}

export type ScreenshotReadResult =
  | { kind: "redirect"; backend: "supabase"; signedUrl: string; fellBack: false }
  | { kind: "bytes"; backend: ScreenshotBackend; body: Uint8Array; contentType: string | null; etag: string | null; fellBack: boolean }
  | { kind: "failure"; notFound: boolean; errors: string[] };

async function downloadFromSupabase(path: string) {
  const started = Date.now();
  try {
    const { data, error } = await createAdminClient().storage.from(SCREENSHOT_BUCKET).download(path);
    if (error || !data) return { ok: false as const, notFound: /not\s*found|does not exist|404/i.test(error?.message ?? ""), error: error?.message ?? "supabase_download_failed", ms: Date.now() - started };
    return { ok: true as const, body: new Uint8Array(await data.arrayBuffer()), contentType: data.type || null, ms: Date.now() - started };
  } catch (error) {
    return { ok: false as const, notFound: false, error: error instanceof Error ? error.message : "supabase_download_failed", ms: Date.now() - started };
  }
}

export async function readSubmissionScreenshot(
  path: string,
  options: {
    env?: Env;
    createSignedUrl?: (path: string, expiresIn: number) => Promise<{ signedUrl: string | null; error: { message?: string } | null }>;
  } = {},
): Promise<ScreenshotReadResult> {
  const resolution = resolveScreenshotStorage(options.env);
  if (resolution.degraded) logStorage("degraded", { reason: resolution.reason });

  const errors: string[] = [];
  if (resolution.primary === "cos" && resolution.cos) {
    const startedAt = Date.now();
    const cosTimeoutMs = resolveCosReadTimeout(options.env);
    const cos = await cosGetObject(resolution.cos, path, cosTimeoutMs);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) {
      logStorage("read", { backend: "cos", status: cos.status, bytes: cos.body.byteLength, cos_ms: Date.now() - startedAt, total_ms: Date.now() - startedAt });
      return { kind: "bytes", backend: "cos", body: cos.body, contentType: cos.contentType, etag: cos.etag, fellBack: false };
    }
    errors.push(`cos:${cos.error ?? cosStatus}`);
    const cosMs = Date.now() - startedAt;
    const fallbackReason = cos.error ?? `cos_status_${cosStatus}`;
    logStorage("read_failed", { backend: "cos", status: cosStatus, reason: fallbackReason, cos_ms: cosMs, timeout_ms: cosTimeoutMs });
    const supabase = await downloadFromSupabase(path);
    if (supabase.ok) {
      logStorage("read_fallback", { backend: "supabase", status: 200, bytes: supabase.body.byteLength, supabase_ms: supabase.ms, cos_ms: cosMs, total_ms: Date.now() - startedAt, fallback_reason: fallbackReason });
      return { kind: "bytes", backend: "supabase", body: supabase.body, contentType: supabase.contentType, etag: null, fellBack: true };
    }
    errors.push(`supabase:${supabase.error}`);
    return { kind: "failure", notFound: Boolean(cosStatus === 404 && supabase.notFound), errors };
  }

  const createSignedUrl = options.createSignedUrl ?? (async (targetPath, expiresIn) => {
    const { data, error } = await createAdminClient().storage.from(SCREENSHOT_BUCKET).createSignedUrl(targetPath, expiresIn);
    return { signedUrl: data?.signedUrl ?? null, error };
  });
  const signed = await createSignedUrl(path, 60);
  if (signed.signedUrl && !signed.error) {
    logStorage("read", { backend: "supabase", mode: "redirect" });
    return { kind: "redirect", backend: "supabase", signedUrl: signed.signedUrl, fellBack: false };
  }
  errors.push(`supabase:${signed.error?.message ?? "signed_url_failed"}`);
  logStorage("read_failed", { backend: "supabase", status: signed.error?.message ?? "signed_url_failed" });

  if (resolution.cos) {
    const startedAt = Date.now();
    const cosTimeoutMs = resolveCosReadTimeout(options.env);
    const cos = await cosGetObject(resolution.cos, path, cosTimeoutMs);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) {
      logStorage("read_fallback", { backend: "cos", status: cos.status, bytes: cos.body.byteLength, cos_ms: Date.now() - startedAt, total_ms: Date.now() - startedAt, fallback_reason: "supabase_primary_failed" });
      return { kind: "bytes", backend: "cos", body: cos.body, contentType: cos.contentType, etag: cos.etag, fellBack: true };
    }
    errors.push(`cos:${cos.error ?? cosStatus}`);
    logStorage("read_failed", { backend: "cos", status: cosStatus, reason: cos.error ?? `cos_status_${cosStatus}`, cos_ms: Date.now() - startedAt, timeout_ms: cosTimeoutMs, fallback_reason: "supabase_primary_failed" });
    return { kind: "failure", notFound: signed.error?.message?.includes("not found") === true && cosStatus === 404, errors };
  }

  return { kind: "failure", notFound: true, errors };
}

/**
 * 判断截图对象是否可读（只做存在性校验，不下载字节）。
 *
 * 为什么需要它：切换 COS 为唯一写入目标后，新图**只写 COS、不写 Supabase**
 * （见 writeSubmissionScreenshot）。任何仍用 `storage.from().createSignedUrls()`
 * 判断存在性的调用点，都会把刚上传的新图误判成「不存在」——2026-10-20 上午
 * 投稿提交报「截图不存在或无法读取」即由此引起，当时新图已成功落 COS。
 *
 * 这里统一走与读路径一致的分层查找：COS 优先 HEAD，未命中再用 Supabase 兜底
 * （历史图在 Supabase 仍有副本）。
 *
 * 关键分支：只有 COS **明确返回 404** 才继续查 Supabase。超时、网络错误、5xx
 * 都属「无法确认对象不存在」，此时必须放行——否则 COS 抖动就会把刚上传的新图
 * 判成缺失，重演 10-20 的提交失败（新图只写 COS，兜底查 Supabase 必然查不到）。
 */
export async function findReadableSubmissionScreenshots(
  paths: string[],
  options: {
    env?: Env;
    headObject?: typeof cosHeadObject;
    checkSupabase?: (path: string) => Promise<boolean>;
  } = {},
): Promise<{ readable: string[]; missing: string[] }> {
  const resolution = resolveScreenshotStorage(options.env);
  const cosTimeoutMs = resolveCosReadTimeout(options.env);
  const headObject = options.headObject ?? cosHeadObject;
  const checkSupabase = options.checkSupabase ?? (async (path: string) => {
    const { data, error } = await createAdminClient()
      .storage.from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, 60);
    return !error && Boolean(data?.signedUrl);
  });

  const checks = await Promise.all(
    paths.map(async (path) => {
      if (resolution.primary === "cos" && resolution.cos) {
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
      }
      return { path, ok: await checkSupabase(path) };
    }),
  );

  return {
    readable: checks.filter((item) => item.ok).map((item) => item.path),
    missing: checks.filter((item) => !item.ok).map((item) => item.path),
  };
}

export async function downloadSubmissionScreenshotBytes(path: string, options: { env?: Env } = {}) {
  const resolution = resolveScreenshotStorage(options.env);
  const errors: string[] = [];
  if (resolution.primary === "cos" && resolution.cos) {
    const startedAt = Date.now();
    const cosTimeoutMs = resolveCosReadTimeout(options.env);
    const cos = await cosGetObject(resolution.cos, path, cosTimeoutMs);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) {
      logStorage("read", { backend: "cos", status: cos.status, bytes: cos.body.byteLength, cos_ms: Date.now() - startedAt, total_ms: Date.now() - startedAt });
      return { ok: true as const, body: cos.body, contentType: cos.contentType, backend: "cos" as const, fellBack: false };
    }
    errors.push(`cos:${cos.error ?? cosStatus}`);
    const cosMs = Date.now() - startedAt;
    const fallbackReason = cos.error ?? `cos_status_${cosStatus}`;
    logStorage("read_failed", { backend: "cos", status: cosStatus, reason: fallbackReason, cos_ms: cosMs, timeout_ms: cosTimeoutMs });
    const supabase = await downloadFromSupabase(path);
    if (supabase.ok) {
      logStorage("read_fallback", { backend: "supabase", status: 200, bytes: supabase.body.byteLength, supabase_ms: supabase.ms, cos_ms: cosMs, total_ms: Date.now() - startedAt, fallback_reason: fallbackReason });
      return { ok: true as const, body: supabase.body, contentType: supabase.contentType, backend: "supabase" as const, fellBack: true };
    }
    errors.push(`supabase:${supabase.error}`);
    return { ok: false as const, notFound: cosStatus === 404 && supabase.notFound, errors };
  }
  const supabase = await downloadFromSupabase(path);
  if (supabase.ok) return { ok: true as const, body: supabase.body, contentType: supabase.contentType, backend: "supabase" as const, fellBack: false };
  errors.push(`supabase:${supabase.error}`);
  if (resolution.cos) {
    const startedAt = Date.now();
    const cosTimeoutMs = resolveCosReadTimeout(options.env);
    const cos = await cosGetObject(resolution.cos, path, cosTimeoutMs);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) {
      logStorage("read_fallback", { backend: "cos", status: cos.status, bytes: cos.body.byteLength, cos_ms: Date.now() - startedAt, total_ms: Date.now() - startedAt, fallback_reason: "supabase_primary_failed" });
      return { ok: true as const, body: cos.body, contentType: cos.contentType, backend: "cos" as const, fellBack: true };
    }
    errors.push(`cos:${cos.error ?? cosStatus}`);
    logStorage("read_failed", { backend: "cos", status: cosStatus, reason: cos.error ?? `cos_status_${cosStatus}`, cos_ms: Date.now() - startedAt, timeout_ms: cosTimeoutMs, fallback_reason: "supabase_primary_failed" });
    return { ok: false as const, notFound: supabase.notFound && cosStatus === 404, errors };
  }
  return { ok: false as const, notFound: supabase.notFound, errors };
}

export async function writeSubmissionScreenshot(input: { path: string; body: Uint8Array; contentType: string; env?: Env }) {
  const resolution = resolveScreenshotStorage(input.env);
  if (resolution.degraded) logStorage("degraded", { reason: resolution.reason });
  if (resolution.primary === "cos" && resolution.cos) {
    const result = await cosPutObject(resolution.cos, input.path, input.body, input.contentType);
    if (result.ok) {
      logStorage("write", { backend: "cos", bytes: input.body.byteLength });
      return { ok: true as const, backend: "cos" as const };
    }
    logStorage("write_failed", { backend: "cos", status: result.status, reason: result.error });
    return { ok: false as const, error: result.error ?? "cos_upload_failed" };
  }
  const { error } = await createAdminClient().storage.from(SCREENSHOT_BUCKET).upload(input.path, input.body, { contentType: input.contentType, upsert: false });
  if (error) {
    logStorage("write_failed", { backend: "supabase", reason: error.message });
    return { ok: false as const, error: error.message };
  }
  logStorage("write", { backend: "supabase", bytes: input.body.byteLength });
  return { ok: true as const, backend: "supabase" as const };
}

export async function deleteSubmissionScreenshots(paths: string[]) {
  if (paths.length === 0) return { failures: 0 };
  let failures = 0;
  const supabaseResult = await createAdminClient().storage.from(SCREENSHOT_BUCKET).remove(paths);
  if (supabaseResult.error) {
    failures += 1;
    logStorage("delete_failed", { backend: "supabase", reason: supabaseResult.error.message });
  }
  const cos = readCosConfig();
  if (cos) {
    for (const path of paths) {
      const result = await cosDeleteObject(cos, path);
      if (!result.ok) {
        failures += 1;
        logStorage("delete_failed", { backend: "cos", path, status: result.status });
      }
    }
  }
  return { failures };
}
