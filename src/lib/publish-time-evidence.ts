import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parseBusinessDateTime } from "@/lib/business-time";

export function publishImageDigest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

type Evidence = { userId: string; path: string; publishedAt: string; expiresAt: number };
type EvidenceEnv = Record<string, string | undefined>;

function secret(env: EvidenceEnv) {
  return env.SCREENSHOT_GRANT_SECRET?.trim() || env.CLOUDBASE_SERVICE_API_KEY?.trim();
}

function sign(body: string, key: string) {
  return createHmac("sha256", key).update("publish-time-v1." + body).digest("base64url");
}

/** 表单时间选择器精确到分钟，验签与签发统一按分钟对齐，避免秒数截断误判。 */
function normalizePublishMinuteIso(raw: string | null): string | null {
  const date = parseBusinessDateTime(raw);
  if (!date) return null;
  const minuteMs = Math.floor(date.getTime() / 60_000) * 60_000;
  return new Date(minuteMs).toISOString();
}

export function createPublishTimeEvidence(
  input: { userId: string; path: string; publishedAt: string },
  env: EvidenceEnv = process.env,
  now = Date.now(),
): string | null {
  const key = secret(env);
  const publishedAt = normalizePublishMinuteIso(input.publishedAt);
  if (!key || !publishedAt) return null;
  const evidence: Evidence = { ...input, publishedAt, expiresAt: now + 7 * 86400_000 };
  const body = Buffer.from(JSON.stringify(evidence)).toString("base64url");
  return body + "." + sign(body, key);
}

export function verifyPublishTimeEvidence(
  token: unknown,
  input: { userId: string; path: string; publishedAt: string | null },
  env: EvidenceEnv = process.env,
  now = Date.now(),
): boolean {
  const key = secret(env);
  if (!key || typeof token !== "string" || token.length > 4096) return false;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(body, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const evidence = JSON.parse(Buffer.from(body, "base64url").toString()) as Evidence;
    const expectedMinute = normalizePublishMinuteIso(evidence.publishedAt);
    const actualMinute = normalizePublishMinuteIso(input.publishedAt);
    return evidence.userId === input.userId && evidence.path === input.path
      && expectedMinute !== null && expectedMinute === actualMinute
      && Number.isFinite(evidence.expiresAt) && evidence.expiresAt > now;
  } catch {
    return false;
  }
}
