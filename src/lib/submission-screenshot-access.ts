const FILE_ROUTE_PATH = "/api/submission-screenshots/file";
const RELATIVE_URL_BASE = "https://dydata.local";

function isSafeObjectPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.length > 1024) return false;
  const parts = path.split("/");
  return parts.length >= 2 && parts.every((part) => Boolean(part) && part !== "." && part !== "..");
}

function parseScreenshotUrl(value: string) {
  const trimmed = value.trim();
  const isRelative = trimmed === FILE_ROUTE_PATH || trimmed.startsWith(`${FILE_ROUTE_PATH}?`);
  try {
    return {
      url: new URL(trimmed, isRelative ? RELATIVE_URL_BASE : undefined),
      isRelative,
    };
  } catch {
    return null;
  }
}

export function buildSubmissionScreenshotUrl(_requestUrl: string, storagePath: string) {
  const url = new URL(FILE_ROUTE_PATH, RELATIVE_URL_BASE);
  url.searchParams.set("path", storagePath);
  return `${url.pathname}${url.search}`;
}

export function parseSubmissionScreenshotPath(value: string) {
  const parsed = parseScreenshotUrl(value);
  if (!parsed) return null;
  const { url } = parsed;

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.pathname !== FILE_ROUTE_PATH) {
    return null;
  }

  const path = url.searchParams.get("path")?.trim() ?? "";
  return isSafeObjectPath(path) ? path : null;
}

export function getOwnedSubmissionScreenshotPaths(
  userId: string,
  urls: string[],
  expectedOrigin: string
) {
  const prefix = `${userId}/`;
  const paths: string[] = [];

  for (const item of urls) {
    const parsed = parseScreenshotUrl(item);
    if (!parsed) return null;
    if (!parsed.isRelative && parsed.url.origin !== expectedOrigin) return null;

    const path = parseSubmissionScreenshotPath(item);
    if (!path || !path.startsWith(prefix)) return null;
    paths.push(path);
  }

  return paths;
}

export const __internal = { FILE_ROUTE_PATH, isSafeObjectPath };
