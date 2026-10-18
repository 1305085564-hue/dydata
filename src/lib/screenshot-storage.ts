import { createAdminClient } from "@/lib/supabase/admin";
import { cosDeleteObject, cosGetObject, cosPutObject, readCosConfig, type CosConfig } from "@/lib/cos/client";

export const SCREENSHOT_BUCKET = "submission-screenshots";
export type ScreenshotBackend = "cos" | "supabase";
type Env = Record<string, string | undefined>;

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
    const cos = await cosGetObject(resolution.cos, path, 3_000);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) {
      logStorage("read", { backend: "cos", status: cos.status, bytes: cos.body.byteLength });
      return { kind: "bytes", backend: "cos", body: cos.body, contentType: cos.contentType, etag: cos.etag, fellBack: false };
    }
    errors.push(`cos:${cos.error ?? cosStatus}`);
    logStorage("read_failed", { backend: "cos", status: cosStatus, reason: cos.error });
    const supabase = await downloadFromSupabase(path);
    if (supabase.ok) {
      logStorage("read_fallback", { backend: "supabase", status: 200, bytes: supabase.body.byteLength, ms: supabase.ms });
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
    const cos = await cosGetObject(resolution.cos, path, 3_000);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) {
      logStorage("read_fallback", { backend: "cos", status: cos.status, bytes: cos.body.byteLength });
      return { kind: "bytes", backend: "cos", body: cos.body, contentType: cos.contentType, etag: cos.etag, fellBack: true };
    }
    errors.push(`cos:${cos.error ?? cosStatus}`);
    return { kind: "failure", notFound: signed.error?.message?.includes("not found") === true && cosStatus === 404, errors };
  }

  return { kind: "failure", notFound: true, errors };
}

export async function downloadSubmissionScreenshotBytes(path: string, options: { env?: Env } = {}) {
  const resolution = resolveScreenshotStorage(options.env);
  const errors: string[] = [];
  if (resolution.primary === "cos" && resolution.cos) {
    const cos = await cosGetObject(resolution.cos, path, 3_000);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) return { ok: true as const, body: cos.body, contentType: cos.contentType, backend: "cos" as const, fellBack: false };
    errors.push(`cos:${cos.error ?? cosStatus}`);
    const supabase = await downloadFromSupabase(path);
    if (supabase.ok) return { ok: true as const, body: supabase.body, contentType: supabase.contentType, backend: "supabase" as const, fellBack: true };
    errors.push(`supabase:${supabase.error}`);
    return { ok: false as const, notFound: cosStatus === 404 && supabase.notFound, errors };
  }
  const supabase = await downloadFromSupabase(path);
  if (supabase.ok) return { ok: true as const, body: supabase.body, contentType: supabase.contentType, backend: "supabase" as const, fellBack: false };
  errors.push(`supabase:${supabase.error}`);
  if (resolution.cos) {
    const cos = await cosGetObject(resolution.cos, path, 3_000);
    const cosStatus = cos.status;
    if (cos.ok && cos.body) return { ok: true as const, body: cos.body, contentType: cos.contentType, backend: "cos" as const, fellBack: true };
    errors.push(`cos:${cos.error ?? cosStatus}`);
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
