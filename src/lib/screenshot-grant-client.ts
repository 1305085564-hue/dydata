export const GRANT_RENEW_BEFORE_SECONDS = 5 * 60;

export type CachedScreenshotGrant = {
  userId: string;
  exp: number;
  mode: "fast";
};

export function shouldRenewGrant(exp: number | null | undefined, now = Math.floor(Date.now() / 1000)) {
  return !exp || exp - now < GRANT_RENEW_BEFORE_SECONDS;
}

export function parseCachedScreenshotGrant(value: string | null, userId: string): CachedScreenshotGrant | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CachedScreenshotGrant>;
    if (parsed.userId !== userId || parsed.mode !== "fast" || typeof parsed.exp !== "number" || !Number.isInteger(parsed.exp)) {
      return null;
    }
    return parsed as CachedScreenshotGrant;
  } catch {
    return null;
  }
}
