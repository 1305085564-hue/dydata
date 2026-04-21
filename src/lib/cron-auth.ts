import type { NextRequest } from "next/server";

function normalizeSecret(secret: string | undefined) {
  const value = secret?.trim();
  return value ? value : null;
}

export function getCronSecrets() {
  return Array.from(new Set([
    normalizeSecret(process.env.CRON_SECRET),
    normalizeSecret(process.env.REMIND_SECRET),
  ].filter((secret): secret is string => Boolean(secret))));
}

export function getRequestSecret(request: NextRequest) {
  return normalizeSecret(new URL(request.url).searchParams.get("secret") ?? undefined);
}

export function isCronAuthorized(request: NextRequest) {
  const secret = getRequestSecret(request);
  if (!secret) {
    return false;
  }

  return getCronSecrets().includes(secret);
}
