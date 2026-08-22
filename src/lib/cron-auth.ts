import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function normalizeSecret(secret: string | undefined) {
  const value = secret?.trim();
  return value ? value : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export function getCronSecrets() {
  return Array.from(new Set([
    normalizeSecret(process.env.CRON_SECRET),
    normalizeSecret(process.env.REMIND_SECRET),
  ].filter((secret): secret is string => Boolean(secret))));
}

export function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return normalizeSecret(match?.[1]);
}

export function getRequestSecret(request: NextRequest) {
  return normalizeSecret(new URL(request.url).searchParams.get("secret") ?? undefined);
}

export function matchesCronSecret(candidate: string | null) {
  if (!candidate || getCronSecrets().length === 0) {
    return false;
  }

  const candidateHash = sha256(candidate);
  return getCronSecrets().some((secret) => timingSafeEqual(sha256(secret), candidateHash));
}

// Vercel Cron 自动携带 Authorization: Bearer CRON_SECRET；
// 手动/外部触发仍可用 ?secret=（值必须来自环境变量，禁止写死）。
export function isCronAuthorized(request: NextRequest) {
  if (matchesCronSecret(getBearerToken(request))) {
    return true;
  }

  return matchesCronSecret(getRequestSecret(request));
}
