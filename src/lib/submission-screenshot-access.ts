const FILE_ROUTE_PATH = "/api/submission-screenshots/file";

function isSafeObjectPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.length > 1024) return false;
  const parts = path.split("/");
  return parts.length >= 2 && parts.every((part) => Boolean(part) && part !== "." && part !== "..");
}

export function buildSubmissionScreenshotUrl(requestUrl: string, storagePath: string) {
  const url = new URL(FILE_ROUTE_PATH, requestUrl);
  url.searchParams.set("path", storagePath);
  return url.toString();
}

export function parseSubmissionScreenshotPath(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

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

  for (const url of urls) {
    try {
      if (new URL(url).origin !== expectedOrigin) return null;
    } catch {
      return null;
    }
    const path = parseSubmissionScreenshotPath(url);
    if (!path || !path.startsWith(prefix)) return null;
    paths.push(path);
  }

  return paths;
}

export const __internal = { FILE_ROUTE_PATH, isSafeObjectPath };
