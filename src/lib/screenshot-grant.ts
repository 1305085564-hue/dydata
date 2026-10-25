import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

export const GRANT_COOKIE_NAME = "shot_grant";
export const GRANT_COOKIE_PATH = "/api/submission-screenshots";
export const GRANT_TTL_SECONDS = 30 * 60;
export const GRANT_RENEW_BEFORE_SECONDS = 5 * 60;
export const GRANT_MAX_ALLOW_ENTRIES = 120;
// Cookie 头的实测基线：120 个 UUID 的压缩票据约 3,427B；4KB 以内再留余量。
export const GRANT_MAX_COOKIE_BYTES = 3_800;

type GrantEnv = Record<string, string | undefined>;

export interface ScreenshotGrantPayload {
  v: 1;
  u: string;
  allow: string[] | "*";
  exp: number;
}

export type GrantFailureReason =
  | "missing"
  | "disabled"
  | "secret_missing"
  | "malformed"
  | "signature_invalid"
  | "expired"
  | "payload_invalid"
  | "oversize"
  | "owner_denied";

export interface GrantVerification {
  payload: ScreenshotGrantPayload | null;
  reason: GrantFailureReason | null;
}

export type GrantBuildFailureReason = "secret_missing" | "payload_invalid" | "oversize";

export type GrantBuildResult =
  | { value: string; reason: null }
  | { value: null; reason: GrantBuildFailureReason };

function toBase64Url(value: Uint8Array) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function getSecret(env: GrantEnv = process.env) {
  return env.SCREENSHOT_GRANT_SECRET?.trim() || null;
}

function signData(data: string, secret: string) {
  return toBase64Url(createHmac("sha256", secret).update(data, "ascii").digest());
}

function validPayload(value: unknown): value is ScreenshotGrantPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ScreenshotGrantPayload>;
  if (payload.v !== 1 || typeof payload.u !== "string" || !payload.u) return false;
  if (typeof payload.exp !== "number" || !Number.isInteger(payload.exp) || payload.exp <= 0) return false;
  if (payload.allow === "*") return true;
  return Array.isArray(payload.allow)
    && payload.allow.length <= GRANT_MAX_ALLOW_ENTRIES
    && payload.allow.every((item) => typeof item === "string" && item.length > 0 && item.length <= 128);
}

export function buildGrantValueResult(
  payload: ScreenshotGrantPayload,
  env: GrantEnv = process.env,
): GrantBuildResult {
  const secret = getSecret(env);
  if (!secret) return { value: null, reason: "secret_missing" };
  if (!validPayload(payload)) return { value: null, reason: "payload_invalid" };
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const data = toBase64Url(compressed);
  const value = `${data}.${signData(data, secret)}`;
  if (Buffer.byteLength(value, "utf8") > GRANT_MAX_COOKIE_BYTES) {
    return { value: null, reason: "oversize" };
  }
  return { value, reason: null };
}

export function buildGrantValue(
  payload: ScreenshotGrantPayload,
  env: GrantEnv = process.env,
): string | null {
  return buildGrantValueResult(payload, env).value;
}

export function verifyGrantValue(
  value: string | null | undefined,
  options: { env?: GrantEnv; now?: number } = {},
): GrantVerification {
  if (!value) return { payload: null, reason: "missing" };
  const secret = getSecret(options.env);
  if (!secret) return { payload: null, reason: "secret_missing" };
  if (Buffer.byteLength(value, "utf8") > GRANT_MAX_COOKIE_BYTES) {
    return { payload: null, reason: "oversize" };
  }

  const separator = value.lastIndexOf(".");
  if (separator <= 0 || separator === value.length - 1) {
    return { payload: null, reason: "malformed" };
  }
  const data = value.slice(0, separator);
  const providedSignature = value.slice(separator + 1);
  const expectedSignature = signData(data, secret);
  const providedBuffer = Buffer.from(providedSignature, "ascii");
  const expectedBuffer = Buffer.from(expectedSignature, "ascii");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return { payload: null, reason: "signature_invalid" };
  }

  try {
    const payload = JSON.parse(inflateRawSync(fromBase64Url(data)).toString("utf8")) as unknown;
    if (!validPayload(payload)) return { payload: null, reason: "payload_invalid" };
    if (payload.exp <= (options.now ?? Math.floor(Date.now() / 1000))) {
      return { payload: null, reason: "expired" };
    }
    return { payload, reason: null };
  } catch {
    return { payload: null, reason: "malformed" };
  }
}

export function grantAllowsOwner(payload: ScreenshotGrantPayload, ownerUserId: string) {
  return payload.allow === "*" || payload.allow.includes(ownerUserId);
}

export function shouldRenewGrant(exp: number | null | undefined, now = Math.floor(Date.now() / 1000)) {
  return !exp || exp - now < GRANT_RENEW_BEFORE_SECONDS;
}

export function readGrantCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const item of cookieHeader.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === GRANT_COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

export const __grantInternal = { fromBase64Url, toBase64Url, getSecret, signData, validPayload };
