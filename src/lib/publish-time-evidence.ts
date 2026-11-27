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

export function createPublishTimeEvidence(
  input: { userId: string; path: string; publishedAt: string },
  env: EvidenceEnv = process.env,
  now = Date.now(),
): string | null {
  const key = secret(env);
  const date = parseBusinessDateTime(input.publishedAt);
  if (!key || !date) return null;
  const evidence: Evidence = { ...input, publishedAt: date.toISOString(), expiresAt: now + 7 * 86400_000 };
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
    const date = parseBusinessDateTime(input.publishedAt);
    return evidence.userId === input.userId && evidence.path === input.path
      && evidence.publishedAt === date?.toISOString()
      && Number.isFinite(evidence.expiresAt) && evidence.expiresAt > now;
  } catch {
    return false;
  }
}
